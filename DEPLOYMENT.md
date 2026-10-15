# Faultline v2 release and steward evidence

The v1 Studionet contract at `0xdD32cB20635515d8f3D5BeDC74c8b00472CD5221` cannot be upgraded by changing the frontend. It permits arbitrary canonical initialization and does not pin fixture hashes. Deploy `contracts/faultline.py` as a **new contract** before publishing this v2 frontend

## 1. Publish the fixture host first

Deploy this repository's `faultline` directory to the public `https://faultlined.netlify.app` site. The canonical host is fixed in the contract. Build settings:

```text
Base directory: faultline
Build command: npm run build
Publish directory: dist
Node version: 22
```

Verify each of the eight URLs in `public/fixtures` is publicly readable without a login and has the exact SHA-256 shown in `REVIEW_RESPONSE.md`. A changed fixture is intentionally rejected by the contract, so do not edit these files after deployment. Changes require a new benchmark version and a new contract

## 2. Verify the deployed v2 Intelligent Contract

The v2 contract is deployed on Studionet at `0x089109838a3F31B376fE613CE604BE84bf3a3254`. A read-only call to `get_protocol()` confirmed version `faultline-v2.0`, canonical host `https://faultlined.netlify.app`, the committed policy digest, owner `0x4F7f0fA81fEF3bf7e9706ee20111b76527d02454`, and `initialized=false`. The deployed source was compared byte-for-byte with `contracts/faultline.py`. Record the deployment transaction hash for the steward package. The v1 address must not be reused

The source includes a fixed host, eight fixture digests, a version marker, reserved canonical IDs, and an `owner` field set to the deploying wallet. The deployer is the only account allowed to call `bootstrap_suites`

## 3. Configure and publish the frontend

Set `VITE_FAULTLINE_CONTRACT_ADDRESS=0x089109838a3F31B376fE613CE604BE84bf3a3254` in the Netlify build environment, then rebuild and publish. The checked-in `.env.production` has this address, but a Netlify environment variable can override it. `VITE_GENLAYER_RPC_URL=https://studio.genlayer.com/api` and `VITE_GENLAYER_CHAIN_ID=61999` are the expected Studionet settings. Do not put private keys in frontend variables

The app explicitly rejects a contract without `get_protocol().version == faultline-v2.0`. On a preview domain the app still reads and pins fixture bytes from `faultlined.netlify.app`; public CORS for those fixtures is configured in `public/_headers`

## 4. Initialize with the deploying wallet

Open the published site, connect the wallet used for contract deployment, select **Launch protocol**, then **Initialize locked benchmark**. Record the transaction hash. The app must display successful GenVM execution and read back four canonical suites. Another wallet must see a message that it cannot initialize, and a direct onchain call by that wallet must be rejected

## 5. Run and prove all four cases

Run each canonical case once with the public site. Copy the four run IDs and their transaction hashes. For each transaction, confirm `ACCEPTED` or `FINALIZED`, `FINISHED_WITH_RETURN`, the expected baseline and challenge results, a stored `suite_sha256`, and three observed hashes equal to the commitments in the suite. Only successful writes with matching stored records count as evidence

Use the read-only verifier to produce a machine-readable report:

```powershell
npm run verify:studionet -- 0xNEW_V2_CONTRACT RUN-...=0xTRANSACTION_1 RUN-...=0xTRANSACTION_2 RUN-...=0xTRANSACTION_3 RUN-...=0xTRANSACTION_4
```

The verifier fails if a suite is missing, hashes differ, the observed outcome is wrong, a transaction reports an execution error, or a transaction does not decode to its claimed run. It labels accepted transactions whose finality is still pending

## 6. Adversarial evidence and resubmission

Run `python -m unittest discover -s tests -p contract_regression.py -v` with Python 3. The suite covers unauthorized initialization, wrong host, ID squatting, source mutation, fabricated quotes, source errors, validator disagreement, and all four canonical scenarios. These are offline contract tests, not substitutes for the four StudioNet transactions

Attach the new contract address, the verifier report, the four transaction links, GitHub source, and public app to the existing Faultline submission, then select **Resubmit**. `REVIEW_RESPONSE.md` contains the source-to-request mapping
