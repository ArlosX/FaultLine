# Faultline v3 release

The v2 contract at `0x089109838a3F31B376fE613CE604BE84bf3a3254` is permanently tied to an inaccessible deployer account. The replacement v3 contract is deployed at `0x8e2A3c4D95228c2bD13B3266Df15AfD3F2300EcA`

## 1. Published canonical fixture host

The v3 frontend was published at `https://faultlined.netlify.app` in Netlify deploy `6ad03c7c44f6657087f4889b` (`ready`). The Netlify deployed-file manifest confirms all eight files under `/fixtures/` are present and their SHA-1 hashes match the local files. Direct browser access to the site was blocked in this execution environment, so confirm public HTTP access from a normal browser before running cases. Their exact byte SHA-256 hashes are fixed in `contracts/faultline.py` and listed in `REVIEW_RESPONSE.md`. Do not change those files; any change requires a new contract version

## 2. Deploy the v3 contract

`contracts/faultline.py` was deployed to GenLayer StudioNet at `0x8e2A3c4D95228c2bD13B3266Df15AfD3F2300EcA`. The constructor installed all four canonical suites in the deployment transaction. No later initialization call or special wallet is needed. Record the deployment transaction hash for the steward submission

`npm run verify:deployment -- 0x8e2A3c4D95228c2bD13B3266Df15AfD3F2300EcA` confirmed `version=faultline-v3.0`, `initialized=true`, `canonical_base_url=https://faultlined.netlify.app`, and `suite_count=4`. The deployed code, four canonical IDs, suite digests, and fixture hashes match this repository. The first live run is now recorded; the run count will increase as further suites are executed

## 3. Published frontend

The verified v3 address is set in `.env.production`. `npm run build` passed, and the complete `dist` output was deployed to the existing Netlify site. The site is currently manually deployed and has no connected Git repository. For later builds, a Netlify environment variable with the same name would override the checked-in value. Never put a private key in a frontend variable

The app rejects all pre-v3 addresses. Confirm `CONTRACT READY`, `FIXTURES 04`, and the four locked suite digests on the public site. A StudioNet SDK 1.1.8 receipt may omit the top-level `txExecutionResultName`; this frontend waits for `FINALIZED`, checks a successful leader return, and reads back the matching onchain run before displaying success

## 4. Run the four live cases

With any funded Studionet wallet, run each canonical case once. Copy each run ID and transaction hash. A valid run must be `ACCEPTED` or `FINALIZED`, have `FINISHED_WITH_RETURN`, and appear in the onchain ledger after refresh with its exact suite digest and fixture hashes

Run the read-only verifier from this repository:

```powershell
npm run verify:studionet -- 0xNEW_V3_CONTRACT RUN-...=0xTRANSACTION_1 RUN-...=0xTRANSACTION_2 RUN-...=0xTRANSACTION_3 RUN-...=0xTRANSACTION_4
```

The verifier fails if a suite is missing, hashes differ, outcomes are wrong, execution fails, or a transaction does not decode to its claimed run

## 5. Update the existing steward submission

Attach the new contract address, deployment transaction, verifier report, four run transactions, public app, and GitHub source to the existing Faultline submission before selecting **Resubmit**. The offline contract tests are useful supporting evidence but do not substitute for StudioNet transactions
