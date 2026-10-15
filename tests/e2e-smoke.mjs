import assert from "node:assert/strict"
import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { chromium } from "playwright-core"

const baseUrl = process.argv[2] || process.env.FAULTLINE_URL || "http://127.0.0.1:5173"
const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
const outputDir = path.resolve("test-results")
await mkdir(outputDir, { recursive: true })

const report = {
  generatedAt: new Date().toISOString(),
  baseUrl,
  passed: [],
  warnings: [],
  failures: [],
  consoleErrors: [],
  pageErrors: [],
  failedRequests: [],
  accessibility: {},
  measurements: {},
}

const pass = (name, details = "") => report.passed.push({ name, details })
const warn = (name, details = "") => report.warnings.push({ name, details })

async function check(name, task) {
  try {
    const details = await task()
    pass(name, details || "")
  } catch (error) {
    report.failures.push({ name, details: error instanceof Error ? error.message : String(error) })
  }
}

const browser = await chromium.launch({ executablePath: chromePath, headless: true })
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 })
await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: baseUrl })
const page = await context.newPage()

page.on("console", (message) => { if (message.type() === "error") report.consoleErrors.push(message.text()) })
page.on("pageerror", (error) => report.pageErrors.push(error.message))
page.on("requestfailed", (request) => report.failedRequests.push({ url: request.url(), error: request.failure()?.errorText || "unknown" }))

const startedAt = Date.now()
await page.goto(baseUrl, { waitUntil: "networkidle", timeout: 20_000 })
report.measurements.desktopLoadMs = Date.now() - startedAt
await page.waitForFunction(() => !document.querySelector(".sample-flag")?.textContent?.includes("READING CONTRACT"), undefined, { timeout: 20_000 })
const contractReady = (await page.locator(".sample-flag").innerText()).includes("CONTRACT READY")
report.measurements.contractReady = contractReady

await check("Document identity", async () => {
  assert.equal(await page.title(), "Faultline")
  await page.locator("h1").filter({ hasText: "Pressure test" }).waitFor()
})

await check("Primary landmarks", async () => {
  assert.equal(await page.locator("header").count(), 1)
  assert.equal(await page.locator("main").count(), 1)
  assert.equal(await page.locator("footer").count(), 1)
  assert.equal(await page.locator("nav[aria-label='Primary navigation'] a").count(), 3)
})

await check("All benchmark fixtures render", async () => {
  assert.equal(await page.locator(".suite-tab").count(), 4)
  const labels = await page.locator(".suite-tab strong").allTextContents()
  assert.deepEqual(labels, ["Injection immunity", "Source order invariance", "Authoritative correction", "Conflict abstention"])
})

await check("Predefined targets cannot masquerade as measured results", async () => {
  assert.match(await page.locator(".experiment__result").innerText(), /PREDEFINED EXPECTATION/)
  assert.match(await page.locator(".experiment__result").innerText(), /LATEST ONCHAIN RESULT[\s\S]*NOT RUN/)
  assert.match(await page.locator(".score-dial").innerText(), /OBSERVED PASS RATE[\s\S]*0 ONCHAIN RUNS/)
  assert.equal(await page.locator(".score-dial strong").innerText(), "—")
  assert.equal(await page.locator(".suite-commitment").count(), 0)
})

await check("Fixture selection updates the experiment", async () => {
  const cases = [
    ["Source order invariance", "SUPPORT", "SUPPORT"],
    ["Authoritative correction", "REJECT", "SUPPORT"],
    ["Conflict abstention", "SUPPORT", "UNCLEAR"],
  ]
  for (const [name, baseline, challenge] of cases) {
    await page.getByRole("button", { name: new RegExp(name) }).click()
    await page.locator(".experiment h3").filter({ hasText: name }).waitFor()
    const verdicts = await page.locator(".evidence-block > strong").allTextContents()
    assert.deepEqual(verdicts, [baseline, challenge])
  }
})

await check("Run drawer opens from the active experiment", async () => {
  await page.getByRole("button", { name: /Execute selected test/ }).click()
  await page.getByRole("dialog").waitFor()
  assert.match(await page.getByRole("dialog").innerText(), /Conflict abstention/)
  assert.match(await page.getByRole("dialog").innerText(), contractReady ? /CONTRACT READY/ : /CONTRACT NOT CONFIGURED/)
})

await check("Uninitialized contract cannot fabricate an onchain run", async () => {
  assert.equal(await page.getByRole("button", { name: "Run on GenLayer" }).count(), 0)
  assert.match(await page.getByRole("dialog").innerText(), contractReady ? /Only the deploying wallet can activate the four canonical suites/ : /Set VITE_FAULTLINE_CONTRACT_ADDRESS/)
  assert.equal(await page.locator(".console-row").count(), 0)
})

await check("Empty contract ledger remains honest after refresh", async () => {
  await page.getByRole("button", { name: "Close run panel" }).click()
  await page.reload({ waitUntil: "networkidle" })
  assert.equal(await page.locator(".console-row").count(), 0)
  assert.match(await page.locator(".console-empty").innerText(), contractReady ? /No accepted runs yet/ : /Connect a deployed contract/)
})

await check("Header launch control opens a fresh run", async () => {
  await page.getByRole("button", { name: "Launch protocol" }).click()
  await page.getByRole("dialog").waitFor()
  await page.getByRole("button", { name: "Close run panel" }).click()
  await page.getByRole("dialog").waitFor({ state: "detached" })
})

await check("Failure report stays disabled until a real failed receipt exists", async () => {
  const button = page.getByRole("button", { name: "Copy failure report" })
  assert.equal(await button.isDisabled(), true)
  assert.match(await page.locator("#finding").innerText(), /No unresolved\s+fault/)
})

await check("Internal navigation targets exist", async () => {
  const hrefs = await page.locator(".mastnav a").evaluateAll((links) => links.map((link) => link.getAttribute("href")))
  for (const href of hrefs) {
    assert.ok(href?.startsWith("#"))
    assert.equal(await page.locator(href).count(), 1)
  }
})

await check("Keyboard focus is visible and ordered", async () => {
  await page.goto(baseUrl, { waitUntil: "networkidle", timeout: 20_000 })
  await page.keyboard.press("Tab")
  const first = await page.evaluate(() => ({ tag: document.activeElement?.tagName, className: document.activeElement?.className || "", outline: getComputedStyle(document.activeElement).outlineStyle }))
  assert.equal(first.tag, "A")
  assert.match(String(first.className), /skip-link/)
  assert.notEqual(first.outline, "none")
  await page.locator("body").click({ position: { x: 700, y: 400 } })
})

await page.screenshot({ path: path.join(outputDir, "desktop.png"), fullPage: true })

await check("Desktop has no page-level horizontal overflow", async () => {
  const dimensions = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth }))
  assert.ok(dimensions.scrollWidth <= dimensions.innerWidth + 1, JSON.stringify(dimensions))
})

await page.addScriptTag({ path: path.resolve("node_modules/axe-core/axe.min.js") })
const desktopAxe = await page.evaluate(async () => await globalThis.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } }))
report.accessibility.desktop = desktopAxe.violations.map((item) => ({ id: item.id, impact: item.impact, description: item.description, nodes: item.nodes.map((node) => node.target) }))
if (desktopAxe.violations.some((item) => item.impact === "critical" || item.impact === "serious")) warn("Desktop accessibility", JSON.stringify(report.accessibility.desktop))
else pass("Desktop accessibility", `${desktopAxe.violations.length} critical/serious violations`)

const mobile = await context.newPage()
mobile.on("console", (message) => { if (message.type() === "error") report.consoleErrors.push(`[mobile] ${message.text()}`) })
mobile.on("pageerror", (error) => report.pageErrors.push(`[mobile] ${error.message}`))
await mobile.setViewportSize({ width: 390, height: 844 })
await mobile.goto(baseUrl, { waitUntil: "networkidle", timeout: 20_000 })

await check("Mobile key controls remain available", async () => {
  await mobile.getByRole("button", { name: "Launch protocol" }).waitFor()
  await mobile.getByRole("button", { name: /Conflict abstention/ }).scrollIntoViewIfNeeded()
  await mobile.getByRole("button", { name: /Conflict abstention/ }).click()
  assert.match(await mobile.locator(".experiment h3").innerText(), /Conflict abstention/)
})

await check("Mobile drawer fits the viewport", async () => {
  await mobile.getByRole("button", { name: "Launch protocol" }).click()
  await mobile.waitForTimeout(350)
  const box = await mobile.getByRole("dialog").boundingBox()
  assert.ok(box)
  assert.ok(box.x >= 0 && box.width <= 390, JSON.stringify(box))
  await mobile.getByRole("button", { name: "Close run panel" }).click()
})

await check("Mobile has no page-level horizontal overflow", async () => {
  const dimensions = await mobile.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth }))
  assert.ok(dimensions.scrollWidth <= dimensions.innerWidth + 1, JSON.stringify(dimensions))
})

await mobile.screenshot({ path: path.join(outputDir, "mobile-390x844.png"), fullPage: true })
await mobile.addScriptTag({ path: path.resolve("node_modules/axe-core/axe.min.js") })
const mobileAxe = await mobile.evaluate(async () => await globalThis.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } }))
report.accessibility.mobile = mobileAxe.violations.map((item) => ({ id: item.id, impact: item.impact, description: item.description, nodes: item.nodes.map((node) => node.target) }))
if (mobileAxe.violations.some((item) => item.impact === "critical" || item.impact === "serious")) warn("Mobile accessibility", JSON.stringify(report.accessibility.mobile))
else pass("Mobile accessibility", `${mobileAxe.violations.length} critical/serious violations`)

const tablet = await context.newPage()
await tablet.setViewportSize({ width: 820, height: 1180 })
await tablet.goto(baseUrl, { waitUntil: "networkidle", timeout: 20_000 })
await check("Tablet layout has no page-level horizontal overflow", async () => {
  const dimensions = await tablet.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth }))
  assert.ok(dimensions.scrollWidth <= dimensions.innerWidth + 1, JSON.stringify(dimensions))
})
await tablet.screenshot({ path: path.join(outputDir, "tablet-820x1180.png"), fullPage: true })

const uniqueConsoleErrors = [...new Set(report.consoleErrors)]
const uniquePageErrors = [...new Set(report.pageErrors)]
report.consoleErrors = uniqueConsoleErrors
report.pageErrors = uniquePageErrors
await check("No application console errors", async () => assert.deepEqual(uniqueConsoleErrors, []))
await check("No uncaught page errors", async () => assert.deepEqual(uniquePageErrors, []))

await browser.close()
await writeFile(path.join(outputDir, "e2e-report.json"), JSON.stringify(report, null, 2))

console.log(`Passed: ${report.passed.length}`)
console.log(`Warnings: ${report.warnings.length}`)
console.log(`Failures: ${report.failures.length}`)
for (const failure of report.failures) console.log(`FAIL ${failure.name}: ${failure.details}`)
for (const warning of report.warnings) console.log(`WARN ${warning.name}: ${warning.details}`)
if (report.failures.length) process.exitCode = 1
