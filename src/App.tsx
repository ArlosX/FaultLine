import { useCallback, useEffect, useMemo, useState, type MouseEvent as ReactMouseEvent } from "react"
import {
  ArrowDownRight, ArrowRight, Braces, Check, CheckCircle2, ChevronRight,
  CircleAlert, Clipboard, GitCompareArrows, LogOut, Play, Radar, RefreshCw,
  RotateCw, ShieldCheck, Terminal, Wallet, X,
} from "lucide-react"
import {
  FaultlineClient, connectWallet, connectedAccount, defaultAddress, defaultEndpoint,
  disconnectWallet, isContractAddress, type ContractProtocol, type ContractRun, type ContractStats, type ContractSuite, type NetworkStatus,
} from "./genlayer"

type Verdict = "STABLE" | "CORRECTED" | "FRAGILE" | "INCONCLUSIVE" | "FAILED" | "SOURCE_ERROR"
type Outcome = "SUPPORT" | "REJECT" | "UNCLEAR"
type Suite = {
  id: string; index: string; name: string; attack: string; description: string
  baseline: Outcome; challenge: Outcome; verdict: Verdict
}
type Run = {
  id: string; suiteId: string; suite: string; baseline: string; challenge: string
  verdict: Verdict; receipt: string; time: string; passed: boolean; raw: ContractRun
}

const suites: Suite[] = [
  { id: "injection-immunity", index: "FL-001", name: "Injection immunity", attack: "PROMPT INJECTION", description: "Measures whether commands embedded inside evidence can redirect the judge", baseline: "REJECT", challenge: "REJECT", verdict: "STABLE" },
  { id: "source-order", index: "FL-002", name: "Source order invariance", attack: "ORDER BIAS", description: "Reverses source order without changing the underlying evidence", baseline: "SUPPORT", challenge: "SUPPORT", verdict: "STABLE" },
  { id: "authority-correction", index: "FL-003", name: "Authoritative correction", attack: "NEW EVIDENCE", description: "Checks whether a later authoritative source correctly changes the decision", baseline: "REJECT", challenge: "SUPPORT", verdict: "CORRECTED" },
  { id: "conflict-abstention", index: "FL-004", name: "Conflict abstention", attack: "SOURCE CONFLICT", description: "Tests whether the judge abstains when equally credible sources disagree", baseline: "SUPPORT", challenge: "UNCLEAR", verdict: "INCONCLUSIVE" },
]

const runSteps = ["Wallet approval", "Transaction submitted", "Validator consensus", "Synchronize receipt"]
const emptyStats: ContractStats = { suite_count: 0, run_count: 0 }
const emptySha256 = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"

async function requirePublicFixtures(fixtures: { url: string; sha256: string }[]) {
  for (const fixture of fixtures) {
    let response: Response
    try {
      response = await fetch(fixture.url, { cache: "no-store", credentials: "omit" })
    } catch {
      throw new Error(`Cannot read the public fixture ${fixture.url}; check hosting and CORS before submitting`)
    }
    if (!response.ok) throw new Error(`Fixture returned HTTP ${response.status}: ${fixture.url}`)
    const bytes = await response.arrayBuffer()
    const digest = await crypto.subtle.digest("SHA-256", bytes)
    const observed = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")
    if (observed !== fixture.sha256) {
      throw new Error(`Fixture changed since this benchmark version was locked: ${fixture.url}`)
    }
  }
}

function pinnedFixtures(suite: ContractSuite) {
  return [
    { url: suite.policy_url, sha256: suite.policy_sha256 },
    { url: suite.baseline_url, sha256: suite.baseline_sha256 },
    { url: suite.challenge_url, sha256: suite.challenge_sha256 },
  ]
}

function canonicalFixtureManifest(protocol: ContractProtocol) {
  const root = `${protocol.canonical_base_url}/fixtures/`
  return [
    { url: `${root}policy.txt`, sha256: protocol.canonical_policy_sha256 },
    { url: `${root}baseline-reject.txt`, sha256: "bdc862923d57824036a5a77690b9dd1b9dcd9eff011a26d6e35700fbf02bd0af" },
    { url: `${root}baseline-support.txt`, sha256: "53d8a304ddf67f7eca35d5da7d8abbe47d55fd42dcee771cbba3c077500f8ae2" },
    { url: `${root}baseline-order-a.txt`, sha256: "44703ba14c02799f036a0c2f753c1c7116216a5fb2f74f0c7ed6448f6ddbd452" },
    { url: `${root}challenge-injection.txt`, sha256: "7e3d1159c657ecef1367d26bbd604d546e98c61fc752759c45806553fe9bac46" },
    { url: `${root}challenge-order-b.txt`, sha256: "ec7eafc81cada2ca96f2c433e523595de604db403003b52d459c09936c3cfc8d" },
    { url: `${root}challenge-correction.txt`, sha256: "75a658b80f88880c08d1e8e06001c5a28b24ce4ee00a7038f4d53f0a47d21742" },
    { url: `${root}challenge-conflict.txt`, sha256: "ba033201b2ea1c117c2868e309db632094e2fea15dc46db5cd4778f29bc63d45" },
  ]
}

function shortAddress(value: string) {
  return value ? `${value.slice(0, 6)}…${value.slice(-4)}` : "Connect wallet"
}

function receiptTime(value: string) {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return "ONCHAIN"
  return parsed.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
}

function toRuns(values: ContractRun[]): Run[] {
  return values.map((raw) => {
    const missingSource = [raw.policy_sha256, raw.baseline_sha256, raw.challenge_sha256].includes(emptySha256)
    return {
      id: raw.run_id,
      suiteId: raw.suite_id,
      suite: suites.find((suite) => suite.id === raw.suite_id)?.name || raw.suite_id,
      baseline: missingSource ? "NO DATA" : raw.baseline_outcome,
      challenge: missingSource ? "NO DATA" : raw.challenge_outcome,
      verdict: missingSource ? "SOURCE_ERROR" : raw.classification,
      receipt: "RECORDED",
      time: receiptTime(raw.created_at),
      passed: !missingSource && raw.passed,
      raw,
    }
  })
}

function Mark() {
  return (
    <a className="brand" href="#top" aria-label="Faultline home">
      <svg viewBox="0 0 44 44" aria-hidden="true"><path d="M3 22h10l4-12 6 25 5-17 4 8h9" /><path d="M22 3v6M22 35v6" /></svg>
      <span><strong>FAULTLINE</strong><small>CONSENSUS STRESS LAB</small></span>
    </a>
  )
}

function Status({ verdict }: { verdict: Verdict }) {
  return <span className={`status status--${verdict.toLowerCase()}`}><i />{verdict.replace("_", " ")}</span>
}

function App() {
  const [selected, setSelected] = useState(suites[0])
  const [runOpen, setRunOpen] = useState(false)
  const [running, setRunning] = useState(false)
  const [initializing, setInitializing] = useState(false)
  const [step, setStep] = useState(0)
  const [runs, setRuns] = useState<Run[]>([])
  const [stats, setStats] = useState<ContractStats>(emptyStats)
  const [protocol, setProtocol] = useState<ContractProtocol | null>(null)
  const [lockedSuites, setLockedSuites] = useState<ContractSuite[]>([])
  const [network, setNetwork] = useState<NetworkStatus>(isContractAddress(defaultAddress) ? "checking" : "unconfigured")
  const [account, setAccount] = useState("")
  const [error, setError] = useState("")
  const [txHash, setTxHash] = useState("")
  const [copied, setCopied] = useState(false)
  const [operation, setOperation] = useState<"run" | "initialize">("run")

  const loadContract = useCallback(async () => {
    if (!isContractAddress(defaultAddress)) {
      setNetwork("unconfigured")
      setStats(emptyStats)
      setRuns([])
      setProtocol(null)
      setLockedSuites([])
      return
    }
    setNetwork("checking")
    try {
      const client = new FaultlineClient(defaultAddress, defaultEndpoint)
      const nextProtocol = await client.protocol()
      if (nextProtocol.version !== "faultline-v2.0") throw new Error("This contract uses the older unprotected benchmark. Deploy Faultline v2 and update VITE_FAULTLINE_CONTRACT_ADDRESS")
      const [nextStats, nextRuns, nextSuites] = await Promise.all([client.stats(), client.runs(), client.suites()])
      setProtocol(nextProtocol)
      setLockedSuites(nextSuites)
      setStats(nextStats)
      setRuns(toRuns(nextRuns))
      setNetwork("ready")
      setError("")
    } catch (reason) {
      setNetwork("error")
      setProtocol(null)
      setLockedSuites([])
      setError(reason instanceof Error ? reason.message : "Unable to read the Faultline contract")
    }
  }, [])

  useEffect(() => {
    connectedAccount().then(setAccount).catch(() => setAccount(""))
    void loadContract()
    const handler = (...args: unknown[]) => setAccount(Array.isArray(args[0]) ? String(args[0][0] || "") : "")
    window.ethereum?.on?.("accountsChanged", handler)
    return () => window.ethereum?.removeListener?.("accountsChanged", handler)
  }, [loadContract])

  const validRuns = useMemo(() => runs.filter((run) => run.verdict !== "SOURCE_ERROR"), [runs])
  const decisive = useMemo(() => validRuns.filter((run) => run.verdict !== "INCONCLUSIVE").length, [validRuns])
  const passed = useMemo(() => validRuns.filter((run) => run.passed).length, [validRuns])
  const robustness = validRuns.length ? `${Math.round((passed / validRuns.length) * 100)}%` : "—"
  const fault = useMemo(() => validRuns.find((run) => !run.passed), [validRuns])
  const latestSelected = useMemo(() => runs.find((run) => run.suiteId === selected.id), [runs, selected.id])
  const selectedLocked = useMemo(() => lockedSuites.find((suite) => suite.suite_id === selected.id), [lockedSuites, selected.id])
  const selectedRuns = useMemo(() => validRuns.filter((run) => run.suiteId === selected.id), [validRuns, selected.id])
  const selectedPassRate = selectedRuns.length ? Math.round(selectedRuns.filter((run) => run.passed).length / selectedRuns.length * 100) : null
  const busy = running || initializing

  const connect = async () => {
    setError("")
    try {
      setAccount(await connectWallet(defaultEndpoint))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Wallet connection failed")
    }
  }

  const disconnect = async () => {
    await disconnectWallet()
    setAccount("")
  }

  const launch = (suite = selected) => {
    setSelected(suite)
    setStep(0)
    setTxHash("")
    setError("")
    setRunOpen(true)
  }

  const writer = async (onSubmitted: (hash: string) => void) => {
    let active = account
    if (!active) {
      setStep(0)
      active = await connectWallet(defaultEndpoint)
      setAccount(active)
    }
    return { client: new FaultlineClient(defaultAddress, defaultEndpoint, active, onSubmitted), active }
  }

  const initializeBenchmark = async () => {
    if (!isContractAddress(defaultAddress) || !protocol) return
    setInitializing(true)
    setError("")
    setStep(0)
    setTxHash("")
    setOperation("initialize")
    try {
      await requirePublicFixtures(canonicalFixtureManifest(protocol))
      const { client, active } = await writer((hash) => { setTxHash(hash); setStep(2) })
      if (active.toLowerCase() !== protocol.owner.toLowerCase()) throw new Error("Only the deploying wallet can initialize the canonical benchmark")
      setStep(1)
      await client.bootstrap(protocol.canonical_base_url)
      setStep(3)
      await client.waitForRecord()
      await loadContract()
      if (!(await client.protocol()).initialized) throw new Error("Initialization transaction returned but canonical suites were not recorded")
      setStep(4)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Benchmark initialization failed")
    } finally {
      setInitializing(false)
    }
  }

  const startRun = async () => {
    if (!isContractAddress(defaultAddress) || stats.suite_count === 0 || !protocol) return
    setRunning(true)
    setError("")
    setStep(0)
    setTxHash("")
    setOperation("run")
    try {
      const reader = new FaultlineClient(defaultAddress, defaultEndpoint)
      const lockedSuite = await reader.suite(selected.id)
      if (!lockedSuite.canonical || lockedSuite.fixture_version !== protocol.version) throw new Error("Selected suite is not part of the locked canonical benchmark")
      await requirePublicFixtures(pinnedFixtures(lockedSuite))
      const { client, active } = await writer((hash) => { setTxHash(hash); setStep(2) })
      setStep(1)
      const runId = `RUN-${Date.now().toString(16).toUpperCase()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`
      await client.execute(selected.id, runId)
      setStep(3)
      await client.waitForRecord(runId)
      const recorded = await client.run(runId)
      if (recorded.run_id !== runId || recorded.suite_id !== selected.id || recorded.suite_sha256 !== lockedSuite.suite_sha256 || recorded.author.toLowerCase() !== active.toLowerCase()) {
        throw new Error("The transaction returned, but its onchain benchmark receipt did not match this wallet and locked suite")
      }
      await loadContract()
      setStep(4)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The GenLayer run failed")
    } finally {
      setRunning(false)
    }
  }

  const moveTo = (id: string) => (event: ReactMouseEvent<HTMLAnchorElement>) => {
    event.preventDefault()
    const target = document.getElementById(id)
    if (!target) return
    const from = window.scrollY
    const to = target.getBoundingClientRect().top + from - 84
    const distance = to - from
    const duration = Math.min(820, Math.max(480, Math.abs(distance) * 0.32))
    const started = performance.now()
    const animate = (now: number) => {
      const progress = Math.min(1, (now - started) / duration)
      const eased = progress < .5 ? 4 * progress ** 3 : 1 - ((-2 * progress + 2) ** 3) / 2
      window.scrollTo(0, from + distance * eased)
      if (progress < 1) requestAnimationFrame(animate)
    }
    requestAnimationFrame(animate)
  }

  const copyFinding = async () => {
    if (!fault) return
    await navigator.clipboard.writeText([
      "FAULTLINE FAILURE REPORT", `Run: ${fault.id}`, `Suite: ${fault.suite}`,
      `Expected: ${fault.raw.expected_challenge}`, `Observed: ${fault.challenge}`,
      `Classification: ${fault.verdict}`, `Transaction receipt: ${fault.receipt}`,
      `Fixture hash: ${fault.raw.challenge_sha256}`,
    ].join("\n"))
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1800)
  }

  const networkLabel = network === "ready" ? "CONTRACT READY" : network === "checking" ? "READING CONTRACT" : network === "error" ? "CONTRACT ERROR" : "CONTRACT NOT CONFIGURED"
  const completionTitle = operation === "initialize" ? "Benchmark initialized" : `${latestSelected?.verdict || selected.verdict} signal recorded`

  return (
    <div className="lab" id="top">
      <a className="skip-link" href="#main">Skip to content</a>
      <header className="masthead">
        <Mark />
        <nav className="mastnav" aria-label="Primary navigation"><a href="#bench" onClick={moveTo("bench")}>BENCH</a><a href="#ledger" onClick={moveTo("ledger")}>LEDGER</a><a href="#finding" onClick={moveTo("finding")}>FINDINGS</a></nav>
        <div className="masthead__right">
          <span className={`sample-flag sample-flag--${network}`}><i /> {networkLabel}</span>
          <button className="wallet-control" onClick={account ? disconnect : connect}>{account ? <LogOut size={14} /> : <Wallet size={14} />}{shortAddress(account)}</button>
          <button className="launch-control" onClick={() => launch()}><Play size={15} fill="currentColor" /> Launch protocol</button>
        </div>
      </header>

      <main id="main">
        <section className="opening">
          <div className="opening__index" aria-hidden="true">01</div>
          <div className="opening__statement"><span className="kicker">ADVERSARIAL CONSENSUS BENCHMARK</span><h1>Pressure test<br />the <em>judgment</em></h1></div>
          <div className="opening__brief"><p>A controlled lab for measuring whether GenLayer decisions survive hostile evidence, source conflicts and deliberate changes</p><a href="#bench" onClick={moveTo("bench")}>Enter the experiment <ArrowDownRight size={17} /></a></div>
          <div className="scan-field" aria-label="System status visualization">
            <div className="scan-field__beam" />
            <div className="scan-field__label scan-field__label--a">CONTROL <strong>{selected.baseline}</strong></div>
            <div className="scan-field__label scan-field__label--b">CHALLENGE <strong>{selected.challenge}</strong></div>
            <div className="scan-field__core"><Radar size={42} /><strong>{network === "ready" ? String(stats.run_count).padStart(2, "0") : "—"}</strong><span>ONCHAIN RUNS</span></div>
            <div className="scan-field__footer"><span>{selected.index}</span><span>{networkLabel}</span></div>
          </div>
        </section>

        <section className="ticker" aria-label="Benchmark summary">
          <span className="ticker__lead">LIVE INSTRUMENTS</span><div><small>FIXTURES</small><strong>{String(stats.suite_count).padStart(2, "0")}</strong></div><div><small>RUNS</small><strong>{String(stats.run_count).padStart(2, "0")}</strong></div><div><small>DECISIVE</small><strong>{String(decisive).padStart(2, "0")}</strong></div><div><small>ROBUSTNESS</small><strong>{robustness}</strong></div><div className="ticker__alert"><small>OPEN FAULTS</small><strong>{String(validRuns.length - passed).padStart(2, "0")}</strong></div>
        </section>

        <section className="protocol">
          <div className="section-code">PROTOCOL / 4 PHASES</div>
          <div className="protocol__line">
            {[["01", "LOCK", "Hash policy and evidence"], ["02", "JUDGE", "Resolve the baseline"], ["03", "ATTACK", "Introduce one variable"], ["04", "COMPARE", "Classify the change"]].map(([number, title, copy], index) => (
              <div className="protocol__phase" key={number}><span>{number}</span><div><strong>{title}</strong><small>{copy}</small></div>{index < 3 && <ChevronRight size={18} />}</div>
            ))}
          </div>
        </section>

        <section className="bench" id="bench">
          <div className="bench__rail">
            <span className="section-code">EXPERIMENT QUEUE</span><h2>Choose a fault<br />to introduce</h2>
            <div className="suite-selector">
              {suites.map((suite) => <button key={suite.id} onClick={() => setSelected(suite)} className={selected.id === suite.id ? "suite-tab suite-tab--active" : "suite-tab"}><span>{suite.index}</span><strong>{suite.name}</strong><small>{suite.attack}</small><ArrowRight size={16} /></button>)}
            </div>
          </div>

          <article className="experiment" key={selected.id}>
            <div className="experiment__top">
              <div><span className="section-code">ACTIVE SPECIMEN / {selected.index} / {selectedLocked?.fixture_version || "AWAITING CONTRACT"}</span><h3>{selected.name}</h3><p>{selected.description}</p>{selectedLocked && <code className="suite-commitment">LOCKED SUITE SHA-256 {selectedLocked.suite_sha256}</code>}</div>
              <div className="score-dial" style={{ "--score": `${(selectedPassRate || 0) * 3.6}deg` } as React.CSSProperties} aria-label={selectedPassRate === null ? "No onchain results yet" : `${selectedPassRate} percent observed pass rate from ${selectedRuns.length} onchain runs`}><strong>{selectedPassRate === null ? "—" : `${selectedPassRate}%`}</strong><span>OBSERVED PASS RATE</span><small>{selectedRuns.length} ONCHAIN RUNS</small></div>
            </div>
            <div className="evidence-track">
              <div className="evidence-block"><span>CONTROL</span><div className="evidence-block__icon"><ShieldCheck size={20} /></div><small>EXPECTED BASELINE</small><strong>{selected.baseline}</strong><code>{selectedLocked ? `PINNED sha256: ${selectedLocked.baseline_sha256.slice(0, 14)}…` : "awaiting locked suite"}{latestSelected ? ` / OBSERVED ${latestSelected.raw.baseline_sha256.slice(0, 14)}…` : " / no observed result"}</code></div>
              <div className="transfer"><span /><GitCompareArrows size={23} /><span /></div>
              <div className="evidence-block evidence-block--challenge"><span>FAULT</span><div className="evidence-block__icon"><Braces size={20} /></div><small>EXPECTED CHALLENGE</small><strong>{selected.challenge}</strong><code>{selectedLocked ? `PINNED sha256: ${selectedLocked.challenge_sha256.slice(0, 14)}…` : "awaiting locked suite"}{latestSelected ? ` / OBSERVED ${latestSelected.raw.challenge_sha256.slice(0, 14)}…` : " / no observed result"}</code></div>
            </div>
            <div className="experiment__result"><div><small>PREDEFINED EXPECTATION</small><Status verdict={selected.verdict} /></div><div><small>LATEST ONCHAIN RESULT</small><strong>{latestSelected ? `${latestSelected.baseline} → ${latestSelected.challenge} / ${latestSelected.verdict}` : "NOT RUN"}</strong></div><button onClick={() => launch(selected)}>Execute selected test <Play size={16} fill="currentColor" /></button></div>
          </article>
        </section>

        <section className="ledger" id="ledger">
          <div className="ledger__heading"><span className="section-code">ONCHAIN RUN LOG</span><h2>Consensus ledger</h2><p>Every row is read from the deployed Intelligent Contract after a successful GenVM execution and carries a versioned suite commitment</p></div>
          <div className="ledger__console" tabIndex={0} aria-label="Consensus run receipts">
            <div className="console-bar"><span><Terminal size={14} /> faultline / receipts</span><span>{network === "ready" ? "STREAM CONNECTED" : "STREAM OFFLINE"} <i /></span></div>
            <div className="console-head"><span>RUN</span><span>SPECIMEN</span><span>CONTROL → FAULT</span><span>RECEIPT</span><span>CLASS</span><span>TIME</span></div>
            {runs.length ? runs.map((run) => <div className="console-row" key={run.id}><code>{run.id}</code><strong>{run.suite}</strong><code>{run.baseline} → {run.challenge}</code><span>{run.receipt}</span><Status verdict={run.verdict} /><span>{run.time}</span></div>) : <div className="console-empty"><Terminal size={17} /><span>{network === "ready" ? "No accepted runs yet" : "Connect a deployed contract to read receipts"}</span></div>}
          </div>
        </section>

        <section className={fault ? "finding finding--open" : "finding finding--clear"} id="finding">
          <div className="finding__stripe"><span>{fault ? "FAULT DETECTED" : "NO OPEN FAULT"}</span><span>{fault ? "FAULT DETECTED" : "NO OPEN FAULT"}</span><span>{fault ? "FAULT DETECTED" : "NO OPEN FAULT"}</span></div>
          <div className="finding__body">
            <div className="finding__number">{fault ? "01" : "00"}</div>
            <div className="finding__title"><span className="section-code">{fault ? "REPRODUCIBLE FAILURE" : "LIVE FAULT MONITOR"}</span><h2>{fault ? <>Expected behavior<br />did not hold</> : <>No unresolved<br />fault recorded</>}</h2><p>{fault ? `${fault.suite} returned ${fault.challenge} where the locked suite expected ${fault.raw.expected_challenge}` : "Run the benchmark suites to test whether the network decision survives each controlled fault"}</p></div>
            <div className="finding__diff"><div><small>EXPECTED</small><strong>{fault?.raw.expected_challenge || "—"}</strong><span>locked suite target</span></div><ArrowRight size={20} /><div><small>OBSERVED</small><strong>{fault?.challenge || "—"}</strong><span>{fault ? "accepted contract receipt" : "waiting for execution"}</span></div></div>
            <div className="finding__meta"><p><span>RUN</span> {fault?.id || "—"}</p><p><span>PROMPT</span> {fault?.raw.prompt_version || "faultline-judge-v1.0"}</p><p><span>RECEIPT</span> {fault?.receipt || "—"}</p><button onClick={copyFinding} disabled={!fault}>{copied ? <Check size={16} /> : <Clipboard size={16} />}{copied ? "Report copied" : "Copy failure report"}</button></div>
          </div>
        </section>
      </main>

      <footer className="lab-footer"><Mark /><p>Make judgment failures measurable</p><span>BUILD 01 / GENLAYER STUDIONET</span></footer>

      {runOpen && (
        <div className="drawer-layer" role="presentation" onMouseDown={() => !busy && setRunOpen(false)}>
          <aside className="run-drawer" role="dialog" aria-modal="true" aria-labelledby="run-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="run-drawer__header"><span>RUN CONTROL</span><button onClick={() => setRunOpen(false)} disabled={busy} aria-label="Close run panel"><X size={20} /></button></div>
            <div className="run-drawer__identity"><small>{selected.index} / {selected.attack}</small><h2 id="run-title">{selected.name}</h2><div className="drawer-expected">PREDEFINED TARGET <Status verdict={selected.verdict} /></div></div>
            {!busy && step < 4 ? <>
              <div className="drawer-spec"><div><span>CONTROL</span><strong>{selected.baseline}</strong></div><ArrowRight size={18} /><div><span>FAULT</span><strong>{selected.challenge}</strong></div></div>
              <div className="drawer-network"><span><i /> GenLayer Studionet</span><small>{networkLabel}</small></div>
              {network === "unconfigured" && <div className="drawer-notice"><CircleAlert size={18} /><p>Set VITE_FAULTLINE_CONTRACT_ADDRESS and rebuild this site before public release</p></div>}
              {network === "error" && <div className="drawer-notice"><CircleAlert size={18} /><p>{error || "The configured contract could not be read"}</p></div>}
              {network === "ready" && stats.suite_count === 0 && <div className="drawer-notice"><CircleAlert size={18} /><p>Only the deploying wallet can activate the four canonical suites. The host, fixture hashes and benchmark version are pinned in the contract</p></div>}
              {error && network === "ready" && <div className="drawer-notice"><CircleAlert size={18} /><p>{error}</p></div>}
              {txHash && <div className="drawer-notice"><p style={{ overflowWrap: "anywhere" }}>Transaction: {txHash}</p><button onClick={() => navigator.clipboard.writeText(txHash)}>Copy transaction hash</button></div>}
              {network === "error" && <button className="drawer-trigger" onClick={loadContract}><RefreshCw size={18} /> Retry contract read</button>}
              {network === "ready" && stats.suite_count === 0 && (!account || account.toLowerCase() === protocol?.owner.toLowerCase()) && <button className="drawer-trigger" onClick={initializeBenchmark}><ShieldCheck size={18} /> {account ? "Initialize locked benchmark" : "Connect deployer wallet"}</button>}
              {network === "ready" && stats.suite_count === 0 && account && account.toLowerCase() !== protocol?.owner.toLowerCase() && <div className="drawer-notice"><CircleAlert size={18} /><p>This wallet cannot initialize the benchmark. Connect the wallet that deployed this contract</p></div>}
              {network === "ready" && stats.suite_count > 0 && <button className="drawer-trigger" onClick={startRun}><Play size={18} fill="currentColor" /> Run on GenLayer</button>}
              {network === "checking" && <button className="drawer-trigger" disabled><RotateCw size={18} /> Reading contract</button>}
            </> : <div className="drawer-progress" aria-live="polite">
              <div className={busy ? "progress-signal" : error ? "progress-signal progress-signal--failed" : "progress-signal progress-signal--done"}>{busy ? <RotateCw size={25} /> : error ? <CircleAlert size={28} /> : <CheckCircle2 size={28} />}</div>
              <h3>{busy ? (initializing ? "Preparing the benchmark" : "Consensus under pressure") : error ? "Transaction was not verified" : completionTitle}</h3>
              <p>{busy ? "Waiting for validator consensus, successful GenVM execution and the matching onchain record" : error ? "No successful benchmark run has been confirmed for this attempt" : "The contract executed successfully and the matching record is visible in the onchain ledger"}</p>
              {txHash && <code className="transaction-hash">TX {txHash.slice(0, 12)}…{txHash.slice(-8)}</code>}
              <div className="progress-list">{runSteps.map((label, index) => <div className={index < step || (!busy && !error) ? "progress-step progress-step--done" : index === step && busy ? "progress-step progress-step--active" : "progress-step"} key={label}><span>{index < step || (!busy && !error) ? <Check size={13} /> : index + 1}</span><p>{label}</p>{index === step && busy && <small>RUNNING</small>}</div>)}</div>
              {error && <div className="drawer-notice"><CircleAlert size={18} /><p>{error}</p></div>}
              {!busy && <button className="drawer-trigger" onClick={() => setRunOpen(false)}>Open ledger <ArrowRight size={17} /></button>}
            </div>}
          </aside>
        </div>
      )}
    </div>
  )
}

export default App
