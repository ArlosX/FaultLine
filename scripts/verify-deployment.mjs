import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createClient } from 'genlayer-js'
import { studionet } from 'genlayer-js/chains'

const address = process.argv[2]
if (!/^0x[0-9a-fA-F]{40}$/.test(address || '')) {
  console.error('Usage: node scripts/verify-deployment.mjs 0xV3Contract')
  process.exit(2)
}

const canonical = {
  'injection-immunity': ['baseline-reject.txt', 'challenge-injection.txt'],
  'source-order': ['baseline-order-a.txt', 'challenge-order-b.txt'],
  'authority-correction': ['baseline-reject.txt', 'challenge-correction.txt'],
  'conflict-abstention': ['baseline-support.txt', 'challenge-conflict.txt'],
}
const sha256 = (body) => createHash('sha256').update(body).digest('hex')
const normalize = (value) => value instanceof Map
  ? Object.fromEntries([...value].map(([key, item]) => [String(key), normalize(item)]))
  : Array.isArray(value) ? value.map(normalize)
  : value && typeof value === 'object'
    ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, normalize(item)]))
    : value
const pythonJson = (value) => `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}: ${JSON.stringify(value[key])}`).join(', ')}}`

try {
  const client = createClient({ chain: studionet, endpoint: process.env.GENLAYER_RPC_URL || 'https://studio.genlayer.com/api' })
  const read = async (method) => normalize(await client.readContract({ address, functionName: method, args: [] }))
  const [protocol, stats, suites, code] = await Promise.all([
    read('get_protocol'), read('get_stats'), read('get_suites'), client.getContractCode(address),
  ])

  assert.equal(protocol.version, 'faultline-v3.0')
  assert.equal(protocol.initialized, true)
  assert.equal(protocol.canonical_base_url, 'https://faultlined.netlify.app')
  assert.equal(Number(stats.suite_count), 4)
  assert.deepEqual(Object.keys(suites).sort(), Object.keys(canonical).sort())

  const localCode = readFileSync(new URL('../contracts/faultline.py', import.meta.url), 'utf8')
  const lineEndings = (value) => value.replace(/\r\n/g, '\n').trimEnd()
  assert.equal(lineEndings(code), lineEndings(localCode), 'Deployed source differs from contracts/faultline.py')

  for (const [id, [baselineFile, challengeFile]] of Object.entries(canonical)) {
    const suite = suites[id]
    assert.equal(suite.canonical, true, `${id}: canonical flag`)
    assert.equal(suite.fixture_version, protocol.version, `${id}: version`)
    const manifest = { ...suite }
    delete manifest.suite_sha256
    assert.equal(suite.suite_sha256, sha256(pythonJson(manifest)), `${id}: suite digest`)
    for (const [phase, file] of Object.entries({ policy: 'policy.txt', baseline: baselineFile, challenge: challengeFile })) {
      assert.equal(suite[`${phase}_url`], `${protocol.canonical_base_url}/fixtures/${file}`, `${id}: ${phase} URL`)
      const body = readFileSync(new URL(`../public/fixtures/${file}`, import.meta.url))
      assert.equal(suite[`${phase}_sha256`], sha256(body), `${id}: ${phase} hash`)
    }
  }

  console.log(JSON.stringify({ contract: address, version: protocol.version, initialized: protocol.initialized, suites: Object.keys(suites), run_count: Number(stats.run_count), source_matches: true, fixture_hashes_match: true }, null, 2))
} catch (error) {
  console.error(`Deployment verification failed: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
}
