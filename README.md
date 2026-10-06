# Faultline

Faultline is an adversarial consensus benchmark for GenLayer judgment tasks

It executes a fixed policy against a control fixture and one controlled fault, then stores an immutable receipt that classifies the response as stable, corrected, fragile, inconclusive, or failed

- Live app: https://faultlined.netlify.app/
- GenLayer Studionet contract: `0xdD32cB20635515d8f3D5BeDC74c8b00472CD5221`

## What is live

- Four canonical suites: prompt injection, source order, authoritative correction, and source conflict
- A GenLayer Intelligent Contract that fetches public fixtures, asks validators to judge them independently, compares decision-critical fields, and stores accepted receipts
- GenLayerJS wallet, read, write, transaction, and receipt lifecycle
- One-transaction benchmark initialization
- Contract-backed ledger that survives refresh without browser storage
- Explicit loading, transaction hash, error, empty, and disconnected states

## Local development

```bash
npm install
npm run dev
```

Copy `.env.example` to `.env.local` after the contract is deployed

```text
VITE_FAULTLINE_CONTRACT_ADDRESS=0xdD32cB20635515d8f3D5BeDC74c8b00472CD5221
VITE_GENLAYER_RPC_URL=https://studio.genlayer.com/api
VITE_GENLAYER_CHAIN_ID=61999
```

Without a valid address, the interface deliberately shows `CONTRACT NOT CONFIGURED` and never fabricates runs

## Contract interface

- `bootstrap_suites(base_url)` registers all four canonical suites once
- `create_suite(...)` registers an additional suite
- `execute_suite(suite_id, run_id)` runs control and fault judgments through GenLayer consensus
- `get_suites()` returns registered suite specifications
- `get_runs()` returns accepted receipts
- `get_stats()` returns suite and run counts

The contract stores exact fetched-content hashes, exact supporting quotes, expected and observed outcomes, prompt version, author, and timestamp

## Verification

```bash
npm run build
npm run preview
npm run test:e2e -- http://127.0.0.1:4173
```

The automated suite checks responsive layouts, navigation, truthful unconfigured states, accessibility, console errors, and overflow. Live writes require a deployed contract and a wallet, so the final transaction path is verified manually after deployment

See `DEPLOYMENT.md` for the release sequence
