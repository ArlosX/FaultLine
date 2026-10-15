# Faultline response to GenLayer steward

Faultline v3 addresses the four issues in the steward's action request. The new contract and canonical suites are verified on StudioNet. One of the four canonical live runs is finalized; the other three are still required before claiming the consensus portion is complete

| Steward concern | v3 correction | Evidence |
| --- | --- | --- |
| Any wallet can initialize canonical suites with an arbitrary fixture host | All four canonical suites are installed inside the constructor, in the deployment transaction. There is no public initializer or owner-only operation. The source host is a contract constant and canonical IDs are reserved against `create_suite` | `contracts/faultline.py`, tests `test_canonical_suites_exist_at_deployment_with_any_deployer`, `test_canonical_bootstrap_cannot_be_called_after_deployment`, `test_canonical_host_cannot_be_substituted`, `test_canonical_identifiers_cannot_be_squatted` |
| Policy or evidence URL can change without immutable commitments | Every canonical file has an exact byte-level SHA-256 committed in the contract before the first run; custom suites must provide the same three commitments; a changed source aborts with a contract error and no run; suites and receipts carry `suite_sha256` and `fixture_version` | `contracts/faultline.py`, `test_changed_policy_or_evidence_cannot_create_a_receipt`, `test_canonical_manifest_is_versioned_and_committed` |
| Predefined stress index could be mistaken for measured performance | Fixed 96/92/88/71 values were removed. The dial now shows `OBSERVED PASS RATE` calculated exclusively from accepted onchain runs for the selected suite, with sample size. Expected outcomes are labeled `PREDEFINED EXPECTATION`, while the last actual run is labeled `LATEST ONCHAIN RESULT` | `src/App.tsx` |
| Transaction status and reproducible evidence were insufficient | The frontend waits for `FINALIZED`, checks an actual successful GenVM return in the leader receipt (or top-level execution result when supplied), then reads back the exact run and checks author, ID, suite digest and version. The contract validates quotes against independently fetched evidence. Offline adversarial tests cover failure paths and all four suites. `scripts/verify-studionet.mjs` is a read-only verifier for four live run IDs and transaction hashes | `src/genlayer.ts`, `src/App.tsx`, `tests/contract_regression.py`, `scripts/verify-studionet.mjs` |

## Canonical fixture commitments

The authoritative commitments are embedded in `contracts/faultline.py`. They cover the exact UTF-8 bytes, including line endings, and are checked before any LLM call

| File | SHA-256 |
| --- | --- |
| `policy.txt` | `5e54fe9c304e44f8f7fbfac733a9c6db73a55e01dd682891f5d645e4b414f79e` |
| `baseline-reject.txt` | `bdc862923d57824036a5a77690b9dd1b9dcd9eff011a26d6e35700fbf02bd0af` |
| `baseline-support.txt` | `53d8a304ddf67f7eca35d5da7d8abbe47d55fd42dcee771cbba3c077500f8ae2` |
| `baseline-order-a.txt` | `44703ba14c02799f036a0c2f753c1c7116216a5fb2f74f0c7ed6448f6ddbd452` |
| `challenge-injection.txt` | `7e3d1159c657ecef1367d26bbd604d546e98c61fc752759c45806553fe9bac46` |
| `challenge-order-b.txt` | `ec7eafc81cada2ca96f2c433e523595de604db403003b52d459c09936c3cfc8d` |
| `challenge-correction.txt` | `75a658b80f88880c08d1e8e06001c5a28b24ce4ee00a7038f4d53f0a47d21742` |
| `challenge-conflict.txt` | `ba033201b2ea1c117c2868e309db632094e2fea15dc46db5cd4778f29bc63d45` |

## Verification status

Local contract regression: **22 tests passed** using a GenLayer-shaped VM stub, including constructor installation, mutation of every canonical fixture, quote forgery, validator disagreement and all four scenarios

Production frontend build: passed after v3 UI integration

Production site: `https://faultlined.netlify.app`, Netlify deploy `6ad03c7c44f6657087f4889b` is `ready` and published. The Netlify file manifest includes all eight canonical fixtures with SHA-1 values matching the local files. Public browser access must still be confirmed from the user's connection

Headless browser smoke check for v3: 17 checks passed; 4 checks dependent on the live RPC could not complete in this execution environment because Chromium received `ERR_CONNECTION_RESET` from the GenLayer endpoint. The contract itself was verified independently via the Studionet API. Repeat the full browser check from the published site before resubmission

New v3 Studionet contract address: `0x8e2A3c4D95228c2bD13B3266Df15AfD3F2300EcA`. The read-only deployment verifier confirmed deployed source equality, all four canonical suites, exact fixture hashes, and `initialized=true`; `get_stats()` currently reports four suites and one run

First live run: `RUN-1A13D6661D1-99688FCD`, transaction `0x20521d26d32b7f91f8a22e8c0bb8db31abe423cc10201eb46b05189d292d3093`. StudioNet reports `FINALIZED`, majority agreement and a successful leader return. The onchain record exists, is authored by `0x04eB0c501Adcf053901E2910862C89803E7b5552`, and records `injection-immunity`, `REJECT → REJECT`, `STABLE`, `passed=true`, and the committed fixture hashes. The original frontend displayed `5 / UNKNOWN` because SDK 1.1.8 omits the top-level execution-result field on this StudioNet receipt; the frontend and verifier now use the actual leader receipt and wait for finality

Initialization transaction: **not applicable** — the four suites are installed in the v3 constructor

Remaining live run transaction hashes: **three not yet submitted**

No live GenLayer outcome is asserted by the offline tests. The three remaining live transactions and the complete read-only verification report must be added here before resubmitting to the steward
