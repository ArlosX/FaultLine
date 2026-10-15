# Faultline

Faultline is an adversarial consensus benchmark for GenLayer judgment tasks

It executes a fixed policy against a control fixture and one controlled fault, then stores an immutable receipt that classifies the response as stable, corrected, fragile, inconclusive, or failed

- Live app: https://faultlined.netlify.app/
- GenLayer Studionet v2 contract: `0x089109838a3F31B376fE613CE604BE84bf3a3254`. The previous address `0xdD32cB20635515d8f3D5BeDC74c8b00472CD5221` is deliberately rejected by the v2 frontend because it lacks fixture commitments and protected initialization

## What v2 implements

- Four canonical suites: prompt injection, source order, authoritative correction, and source conflict
- A GenLayer Intelligent Contract that fetches public fixtures, asks validators to judge them independently, compares decision-critical fields, and stores accepted receipts
- GenLayerJS wallet, read, write, transaction, and receipt lifecycle
- Deployer-only, one-transaction benchmark initialization with a fixed public fixture host and reserved canonical suite IDs
- Eight SHA-256 fixture commitments and a versioned suite digest fixed in the v2 contract; a changed file aborts execution without creating a run
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
VITE_FAULTLINE_CONTRACT_ADDRESS=0x089109838a3F31B376fE613CE604BE84bf3a3254
VITE_GENLAYER_RPC_URL=https://studio.genlayer.com/api
VITE_GENLAYER_CHAIN_ID=61999
```

Without a valid v2 address, the interface deliberately shows an unconfigured or incompatible-contract state and never fabricates runs

## Contract interface

- `bootstrap_suites(base_url)` lets only the deploying wallet register all four canonical suites once, and accepts only `https://faultlined.netlify.app`
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

See `DEPLOYMENT.md` for the release sequence

## Steward review evidence

`REVIEW_RESPONSE.md` maps every requested correction to source code and evidence. The deployed v2 contract source was compared byte-for-byte with `contracts/faultline.py`, but initialization and four live consensus runs remain pending. The offline regression suite proves the access-control and tamper-rejection logic under a GenLayer-shaped VM stub. It does **not** prove StudioNet consensus. The review response must not be resubmitted as fully verified until the frontend points to v2 and four successful live transaction hashes are recorded
