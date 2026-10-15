# Faultline

Faultline is an adversarial consensus benchmark for GenLayer judgment tasks

It executes a fixed policy against a control fixture and one controlled fault, then stores an immutable receipt that classifies the response as stable, corrected, fragile, inconclusive, or failed

- Live app: https://faultlined.netlify.app/
- Faultline v3 requires a new StudioNet contract deployment. The v2 address `0x089109838a3F31B376fE613CE604BE84bf3a3254` cannot be initialized by the project wallet and must not be used for the v3 frontend

## What v3 implements

- Four canonical suites: prompt injection, source order, authoritative correction, and source conflict
- A GenLayer Intelligent Contract that fetches public fixtures, asks validators to judge them independently, compares decision-critical fields, and stores accepted receipts
- GenLayerJS wallet, read, write, transaction, and receipt lifecycle
- Four canonical suites installed atomically in the contract constructor, with a fixed public fixture host and reserved canonical suite IDs; no initialization transaction or privileged deployer action is required
- Eight SHA-256 fixture commitments and a versioned suite digest fixed in the v3 contract; a changed file aborts execution without creating a run
- Real observed pass rates derived from contract receipts, with predefined expectations clearly labeled
- Strict transaction-success checks that require a successful GenVM return and a matching onchain run record
- Contract-backed ledger that survives refresh without browser storage
- Explicit loading, transaction hash, error, empty, and disconnected states

## Local development

```bash
npm install
npm run dev
```

Copy `.env.example` to `.env.local` after the contract is deployed

```text
VITE_FAULTLINE_CONTRACT_ADDRESS=0xYOUR_NEW_V3_CONTRACT_ADDRESS
VITE_GENLAYER_RPC_URL=https://studio.genlayer.com/api
VITE_GENLAYER_CHAIN_ID=61999
```

Without a valid v3 address, the interface deliberately shows an unconfigured or incompatible-contract state and never fabricates runs

## Contract interface

- The constructor installs all four canonical suites using only `https://faultlined.netlify.app`; no wallet can alter or reinitialize them
- `create_suite(...)` registers an additional suite with three mandatory SHA-256 commitments and cannot claim a canonical identifier
- `execute_suite(suite_id, run_id)` runs control and fault judgments through GenLayer consensus
- `get_suites()` returns registered suite specifications
- `get_runs()` returns accepted receipts
- `get_stats()` returns suite and run counts
- `get_protocol()` returns the benchmark version, deployer, pinned fixture host and initialization state

The contract stores the immutable suite digest, exact fetched-content hashes, exact supporting quotes, expected and observed outcomes, prompt and fixture versions, author, and timestamp. Each execution refuses source bytes that differ from the suite commitments

## Verification

```bash
npm run build
npm run preview
npm run test:e2e -- http://127.0.0.1:4173
```

The automated suite checks responsive layouts, navigation, truthful unconfigured states, accessibility, console errors, and overflow. Live writes require a deployed contract and a wallet, so the final transaction path is verified manually after deployment

See `DEPLOYMENT.md` for the v3 release sequence. The current `.env.production` intentionally has no contract address until a v3 address is verified

## Steward review evidence

`REVIEW_RESPONSE.md` maps every requested correction to source code and evidence. The v3 contract is prepared locally but still needs a StudioNet deployment and four live consensus runs. The offline regression suite proves constructor-installed canonical suites and tamper rejection under a GenLayer-shaped VM stub. It does **not** prove StudioNet consensus. Do not resubmit the review response as fully verified until the frontend points to the new v3 address and four successful live transaction hashes are recorded
