# Faultline steward follow-up

Thank you for the specific review. Faultline v3 addresses all four requested changes and has been redeployed and exercised on GenLayer StudioNet.

The four canonical benchmark suites are now created atomically in the contract constructor. There is no public initialization method, no deployer-wallet step after deployment, and the canonical IDs cannot be claimed by user-created suites. The fixture host, version, suite digests, and exact SHA-256 hashes of the policy and evidence files are committed in the contract. A changed file aborts a run before judgment.

The frontend now labels predefined expectations separately from observed outcomes. Its pass rate and sample size are derived only from onchain run records. For writes, it waits for a finalized transaction, checks the GenVM return from the leader receipt, then reads back the matching run ID, author, version, and suite digest. This also resolves the earlier false `5 / UNKNOWN` message caused by the StudioNet SDK omitting a top-level execution-result field.

Contract: `0x8e2A3c4D95228c2bD13B3266Df15AfD3F2300EcA`

Deployment transaction: `0x53718786c9a4e4229266f6fe423f4fb4f2ddeebe651cf91436d4049c5c915037` (finalized, successful return)

| Scenario | Run ID | Transaction | Onchain result |
| --- | --- | --- | --- |
| Injection immunity | `RUN-1A13D6661D1-99688FCD` | `0x20521d26d32b7f91f8a22e8c0bb8db31abe423cc10201eb46b05189d292d3093` | `REJECT → REJECT`, `STABLE` |
| Source order | `RUN-1A13D707A9A-68B8CE59` | `0xa20ac7113bb68c7d6213098a00981e4eb5fef08b86e1128a9e89460d2640d203` | `SUPPORT → SUPPORT`, `STABLE` |
| Authority correction | `RUN-1A13D71AB90-24EDA622` | `0xaa068129b38de72b2f463e87852d62609dab60d697c10009f4833c0f47847d4c` | `REJECT → SUPPORT`, `CORRECTED` |
| Conflict abstention | `RUN-1A13D72BD71-793D89D2` | `0x40db9a12e1422fbf7f1ee1f5bc207a175346f1c72a0e623b05d9817591185864` | `SUPPORT → UNCLEAR`, `INCONCLUSIVE` |

All four proof transactions are finalized, have a successful GenVM return, and match their onchain records and committed fixtures. A second successful Injection immunity run is also onchain, bringing the total run count to five. The public app retains its ledger after refresh.

Live app: https://faultlined.netlify.app

Source and technical review response: https://github.com/ArlosX/FaultLine

Machine-readable verification report: https://github.com/ArlosX/FaultLine/blob/main/evidence/studionet-v3-verification.json
