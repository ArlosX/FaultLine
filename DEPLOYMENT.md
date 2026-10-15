# Faultline v3 release

The v2 contract at `0x089109838a3F31B376fE613CE604BE84bf3a3254` is permanently tied to an inaccessible deployer account. The replacement v3 contract is deployed at `0x8e2A3c4D95228c2bD13B3266Df15AfD3F2300EcA`

## 1. Publish and verify the canonical fixture host

The eight files under `public/fixtures` must remain publicly readable at `https://faultlined.netlify.app/fixtures/`. Their exact byte hashes are fixed in `contracts/faultline.py` and listed in `REVIEW_RESPONSE.md`. Do not change those files; any change requires a new contract version

## 2. Deploy the v3 contract

`contracts/faultline.py` was deployed to GenLayer StudioNet at `0x8e2A3c4D95228c2bD13B3266Df15AfD3F2300EcA`. The constructor installed all four canonical suites in the deployment transaction. No later initialization call or special wallet is needed. Record the deployment transaction hash for the steward submission

`npm run verify:deployment -- 0x8e2A3c4D95228c2bD13B3266Df15AfD3F2300EcA` confirmed `version=faultline-v3.0`, `initialized=true`, `canonical_base_url=https://faultlined.netlify.app`, `suite_count=4`, and `run_count=0`. The deployed code, four canonical IDs, suite digests, and fixture hashes match this repository

## 3. Build and publish the frontend

The verified v3 address is set in `.env.production`. Run `npm run build`. For a manual Netlify deploy, upload the complete `dist` directory; if using Git deploy, push the configuration change and let Netlify rebuild. A Netlify environment variable with the same name overrides the checked-in value, so update it as well. Never put a private key in a frontend variable

The app rejects all pre-v3 addresses. Confirm `CONTRACT READY`, `FIXTURES 04`, and the four locked suite digests on the public site

## 4. Run the four live cases

With any funded Studionet wallet, run each canonical case once. Copy each run ID and transaction hash. A valid run must be `ACCEPTED` or `FINALIZED`, have `FINISHED_WITH_RETURN`, and appear in the onchain ledger after refresh with its exact suite digest and fixture hashes

Run the read-only verifier from this repository:

```powershell
npm run verify:studionet -- 0xNEW_V3_CONTRACT RUN-...=0xTRANSACTION_1 RUN-...=0xTRANSACTION_2 RUN-...=0xTRANSACTION_3 RUN-...=0xTRANSACTION_4
```

The verifier fails if a suite is missing, hashes differ, outcomes are wrong, execution fails, or a transaction does not decode to its claimed run

## 5. Update the existing steward submission

Attach the new contract address, deployment transaction, verifier report, four run transactions, public app, and GitHub source to the existing Faultline submission before selecting **Resubmit**. The offline contract tests are useful supporting evidence but do not substitute for StudioNet transactions
