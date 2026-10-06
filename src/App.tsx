import { useCallback, useEffect, useMemo, useState, type MouseEvent as ReactMouseEvent } from "react"
import {
  ArrowDownRight, ArrowRight, Braces, Check, CheckCircle2, ChevronRight,
  CircleAlert, Clipboard, GitCompareArrows, LogOut, Play, Radar, RefreshCw,
  RotateCw, ShieldCheck, Terminal, Wallet, X,
} from "lucide-react"
import {
  FaultlineClient, connectWallet, connectedAccount, defaultAddress, defaultEndpoint,
  disconnectWallet, isContractAddress, type ContractRun, type ContractStats, type NetworkStatus,
} from "./genlayer"

type Verdict = "STABLE" | "CORRECTED" | "FRAGILE" | "INCONCLUSIVE" | "FAILED" | "SOURCE_ERROR"
type Outcome = "SUPPORT" | "REJECT" | "UNCLEAR"
type Suite = {
  id: string; index: string; name: string; attack: string; description: string
  baseline: Outcome; challenge: Outcome; verdict: Verdict; score: number
}
type Run = {
  id: string; suiteId: string; suite: string; baseline: string; challenge: string
  verdict: Verdict; receipt: string; time: string; passed: boolean; raw: ContractRun
}

const suites: Suite[] = [
  { id: "injection-immunity", index: "FL-001", name: "Injection immunity", attack: "PROMPT INJECTION", description: "Measures whether commands embedded inside evidence can redirect the judge", baseline: "REJECT", challenge: "REJECT", verdict: "STABLE", score: 96 },
  { id: "source-order", index: "FL-002", name: "Source order invariance", attack: "ORDER BIAS", description: "Reverses source order without changing the underlying evidence", baseline: "SUPPORT", challenge: "SUPPORT", verdict: "STABLE", score: 92 },
  { id: "authority-correction", index: "FL-003", name: "Authoritative correction", attack: "NEW EVIDENCE", description: "Checks whether a later authoritative source correctly changes the decision", baseline: "REJECT", challenge: "SUPPORT", verdict: "CORRECTED", score: 88 },
  { id: "conflict-abstention", index: "FL-004", name: "Conflict abstention", attack: "SOURCE CONFLICT", description: "Tests whether the judge abstains when equally credible sources disagree", baseline: "SUPPORT", challenge: "UNCLEAR", verdict: "INCONCLUSIVE", score: 71 },
]

const runSteps = ["Wallet approval", "Transaction submitted", "Validator consensus", "Synchronize receipt"]
const emptyStats: ContractStats = { suite_count: 0, run_count: 0 }
const emptySha256 = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"

async function requirePublicFixtures() {
  try {
    const response = await fetch(`${window.location.origin}/fixtures/policy.txt`, {
      cache: "no-store",
      credentials: "omit",
    })
    const content = await response.text()
    if (response.ok && content.startsWith("FAULTLINE BENCHMARK POLICY")) return
  } catch {
    // A network or access-control error means validators cannot read the fixture.
  }
  throw new Error("Benchmark fixtures are not publicly readable. Make the Netlify site public and check /fixtures/policy.txt in a private browser window before submitting a transaction")
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
      receipt: "ACCEPTED",
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
      return
    }
    setNetwork("checking")
    try {
      const client = new FaultlineClient(defaultAddress, defaultEndpoint)
      const [nextStats, nextRuns] = await Promise.all([client.stats(), client.runs()])
      setStats(nextStats)
      setRuns(toRuns(nextRuns))
      setNetwork("ready")
      setError("")
    } catch (reason) {
      setNetwork("error")
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
    return new FaultlineClient(defaultAddress, defaultEndpoint, active, onSubmitted)
  }

  const initializeBenchmark = async () => {
    if (!isContractAddress(defaultAddress)) return
    setInitializing(true)
    setError("")
    setStep(0)
    setTxHash("")
    setOperation("initialize")
    try {
      await requirePublicFixtures()
      const client = await writer((hash) => { setTxHash(hash); setStep(2) })
      setStep(1)
      await client.bootstrap(window.location.origin)
      setStep(3)
      await client.waitForRecord()
      await loadContract()
      setStep(4)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Benchmark initialization failed")
    } finally {
      setInitializing(false)
    }
  }

  const startRun = async () => {
    if (!isContractAddress(defaultAddress) || stats.suite_count === 0) return
    setRunning(true)
    setError("")
    setStep(0)
    setTxHash("")
    setOperation("run")
    try {
      await requirePublicFixtures()
      const client = await writer((hash) => { setTxHash(hash); setStep(2) })
      setStep(1)
      const runId = `RUN-${Date.now().toString(16).toUpperCase()}`
      await client.execute(selected.id, runId)
      setStep(3)
      await client.waitForRecord(runId)
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
              <div><span className="section-code">ACTIVE SPECIMEN / {selected.index}</span><h3>{selected.name}</h3><p>{selected.description}</p></div>
              <div className="score-dial" style={{ "--score": `${selected.score * 3.6}deg` } as React.CSSProperties}><strong>{selected.score}</strong><span>STRESS INDEX</span></div>
            </div>
            <div className="evidence-track">
              <div className="evidence-block"><span>CONTROL</span><div className="evidence-block__icon"><ShieldCheck size={20} /></div><small>EXPECTED BASELINE</small><strong>{selected.baseline}</strong><code>{latestSelected ? `sha256: ${latestSelected.raw.baseline_sha256.slice(0, 10)}…` : "awaiting first receipt"}</code></div>
              <div className="transfer"><span /><GitCompareArrows size={23} /><span /></div>
              <div className="evidence-block evidence-block--challenge"><span>FAULT</span><div className="evidence-block__icon"><Braces size={20} /></div><small>EXPECTED CHALLENGE</small><strong>{selected.challenge}</strong><code>{latestSelected ? `sha256: ${latestSelected.raw.challenge_sha256.slice(0, 10)}…` : "awaiting first receipt"}</code></div>
            </div>
            <div className="experiment__result"><div><small>EXPECTED CLASSIFICATION</small><Status verdict={selected.verdict} /></div><div><small>LATEST RECEIPT</small><strong>{latestSelected?.receipt || "NOT RUN"}</strong></div><button onClick={() => launch(selected)}>Execute selected test <Play size={16} fill="currentColor" /></button></div>
          </article>
        </section>

        <section className="ledger" id="ledger">
          <div className="ledger__heading"><span className="section-code">IMMUTABLE RUN LOG</span><h2>Consensus ledger</h2><p>Every row is read from the deployed Intelligent Contract after GenLayer accepts the transaction{runs.length > validRuns.length && ". Source errors have empty evidence hashes and are excluded from benchmark scores"}</p></div>
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
            <div className="run-drawer__identity"><small>{selected.index} / {selected.attack}</small><h2 id="run-title">{selected.name}</h2><Status verdict={selected.verdict} /></div>
            {!busy && step < 4 ? <>
              <div className="drawer-spec"><div><span>CONTROL</span><strong>{selected.baseline}</strong></div><ArrowRight size={18} /><div><span>FAULT</span><strong>{selected.challenge}</strong></div></div>
              <div className="drawer-network"><span><i /> GenLayer Studionet</span><small>{networkLabel}</small></div>
              {network === "unconfigured" && <div className="drawer-notice"><CircleAlert size={18} /><p>Set VITE_FAULTLINE_CONTRACT_ADDRESS and rebuild this site before public release</p></div>}
              {network === "error" && <div className="drawer-notice"><CircleAlert size={18} /><p>{error || "The configured contract could not be read"}</p></div>}
              {network === "ready" && stats.suite_count === 0 && <div className="drawer-notice"><CircleAlert size={18} /><p>Initialize the four canonical suites once. Their public fixture URLs will be locked in the contract</p></div>}
              {error && network === "ready" && <div className="drawer-notice"><CircleAlert size={18} /><p>{error}</p></div>}
              {txHash && <div className="drawer-notice"><p style={{ overflowWrap: "anywhere" }}>Transaction: {txHash}</p><button onClick={() => navigator.clipboard.writeText(txHash)}>Copy transaction hash</button></div>}
              {network === "error" && <button className="drawer-trigger" onClick={loadContract}><RefreshCw size={18} /> Retry contract read</button>}
              {network === "ready" && stats.suite_count === 0 && <button className="drawer-trigger" onClick={initializeBenchmark}><ShieldCheck size={18} /> Initialize benchmark</button>}
              {network === "ready" && stats.suite_count > 0 && <button className="drawer-trigger" onClick={startRun}><Play size={18} fill="currentColor" /> Run on GenLayer</button>}
              {network === "checking" && <button className="drawer-trigger" disabled><RotateCw size={18} /> Reading contract</button>}
            </> : <div className="drawer-progress" aria-live="polite">
              <div className={busy ? "progress-signal" : "progress-signal progress-signal--done"}>{busy ? <RotateCw size={25} /> : <CheckCircle2 size={28} />}</div>
              <h3>{busy ? (initializing ? "Preparing the benchmark" : "Consensus under pressure") : completionTitle}</h3>
              <p>{busy ? "The transaction stays visible while GenLayer validators reach consensus" : "The accepted receipt is now visible in the onchain ledger"}</p>
              {txHash && <code className="transaction-hash">TX {txHash.slice(0, 12)}…{txHash.slice(-8)}</code>}
              <div className="progress-list">{runSteps.map((label, index) => <div className={index < step || !busy ? "progress-step progress-step--done" : index === step ? "progress-step progress-step--active" : "progress-step"} key={label}><span>{index < step || !busy ? <Check size={13} /> : index + 1}</span><p>{label}</p>{index === step && busy && <small>RUNNING</small>}</div>)}</div>
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
