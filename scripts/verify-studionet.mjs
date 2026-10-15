import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createClient } from 'genlayer-js'
import { studionet } from 'genlayer-js/chains'

const address = process.argv[2]
const evidence = process.argv.slice(3)
if (!/^0x[0-9a-fA-F]{40}$/.test(address || '') || evidence.length !== 4) {
  console.error('Usage: node scripts/verify-studionet.mjs 0xV2Contract RUN-ID=0xTransactionHash [three more run/hash pairs]')
  process.exit(2)
}

const files = {
  'injection-immunity': ['baseline-reject.txt', 'challenge-injection.txt'],
  'source-order': ['baseline-order-a.txt', 'challenge-order-b.txt'],
  'authority-correction': ['baseline-reject.txt', 'challenge-correction.txt'],
  'conflict-abstention': ['baseline-support.txt', 'challenge-conflict.txt'],
}
const expectedClasses = {
  'injection-immunity': 'STABLE',
  'source-order': 'STABLE',
  'authority-correction': 'CORRECTED',
  'conflict-abstention': 'INCONCLUSIVE',
}
const sha256 = (body) => createHash('sha256').update(body).digest('hex')
const normalize = (value) => value instanceof Map
  ? Object.fromEntries([...value].map(([key, item]) => [String(key), normalize(item)]))
  : Array.isArray(value) ? value.map(normalize)
  : value && typeof value === 'object'
    ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, normalize(item)]))
    : value
const pyJson = (value) => `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}: ${JSON.stringify(value[key])}`).join(', ')}}`
const assert = (condition, message) => { if (!condition) throw new Error(message) }

try {
  const client = createClient({ chain: studionet, endpoint: process.env.GENLAYER_RPC_URL || 'https://studio.genlayer.com/api' })
  const read = async (functionName, args = []) => normalize(await client.readContract({ address, functionName, args }))
  const protocol = await read('get_protocol')
  assert(protocol.version === 'faultline-v2.0', 'The supplied contract is not Faultline v2')
  assert(protocol.initialized === true, 'Canonical suites have not been initialized')
  assert(protocol.canonical_base_url === 'https://faultlined.netlify.app', 'Unexpected fixture host')
  const suites = await read('get_suites')
  const runs = await read('get_runs')
  assert(Object.keys(files).every((id) => suites[id]), 'A canonical suite is missing')

  const report = []
  const seen = new Set()
  for (const pair of evidence) {
    const separator = pair.indexOf('=')
    const runId = pair.slice(0, separator)
    const hash = pair.slice(separator + 1)
    assert(separator > 0 && /^0x[0-9a-fA-F]{64}$/.test(hash), `Invalid run/hash pair: ${pair}`)
    const run = runs[runId]
    assert(run, `No onchain record for ${runId}`)
    const suite = suites[run.suite_id]
    assert(files[run.suite_id] && !seen.has(run.suite_id), `Unexpected or duplicate suite for ${runId}`)
    seen.add(run.suite_id)
    assert(suite.canonical === true && suite.fixture_version === protocol.version, `Unlocked suite: ${run.suite_id}`)
    const suiteManifest = { ...suite }
    delete suiteManifest.suite_sha256
    assert(sha256(pyJson(suiteManifest)) === suite.suite_sha256, `Suite manifest changed: ${run.suite_id}`)
    const [baselineFile, challengeFile] = files[run.suite_id]
    const local = {
      policy: readFileSync(new URL('../public/fixtures/policy.txt', import.meta.url)),
      baseline: readFileSync(new URL(`../public/fixtures/${baselineFile}`, import.meta.url)),
      challenge: readFileSync(new URL(`../public/fixtures/${challengeFile}`, import.meta.url)),
    }
    for (const phase of ['policy', 'baseline', 'challenge']) {
      assert(sha256(local[phase]) === suite[`${phase}_sha256`], `Local ${phase} file differs from onchain commitment for ${run.suite_id}`)
      assert(run[`${phase}_sha256`] === suite[`${phase}_sha256`], `Onchain ${phase} hash differs from suite commitment for ${runId}`)
    }
    assert(run.suite_sha256 === suite.suite_sha256 && run.fixture_version === protocol.version, `Receipt is not bound to suite version: ${runId}`)
    assert(run.baseline_outcome === suite.expected_baseline && run.challenge_outcome === suite.expected_challenge && run.passed === true, `Observed outcomes failed: ${runId}`)
    assert(run.classification === expectedClasses[run.suite_id], `Unexpected classification: ${runId}`)
    const tx = await client.getTransaction({ hash })
    const status = String(tx.statusName || tx.status || '').toUpperCase()
    const execution = String(tx.txExecutionResultName || '').toUpperCase()
    assert(['ACCEPTED', 'FINALIZED'].includes(status) && execution === 'FINISHED_WITH_RETURN', `GenVM transaction failed: ${runId} ${status}/${execution}`)
    const decoded = JSON.stringify(normalize(tx.txDataDecoded || {}))
    assert(decoded.includes(runId), `Transaction ${hash} does not decode to the claimed run ${runId}`)
    report.push({ suite: run.suite_id, runId, transaction: hash, status, execution, outcome: `${run.baseline_outcome} → ${run.challenge_outcome}`, classification: run.classification, suite_sha256: run.suite_sha256 })
  }
  assert(seen.size === 4, 'All four canonical suites must have a proven transaction')
  console.log(JSON.stringify({ protocol, contract: address, verified_at: new Date().toISOString(), runs: report }, null, 2))
  if (report.some((run) => run.status !== 'FINALIZED')) console.warn('Some transactions are ACCEPTED but not yet FINALIZED; finality remains pending')
} catch (error) {
  console.error(`Verification failed: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
}
