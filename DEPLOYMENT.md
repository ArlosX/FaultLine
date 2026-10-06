# Faultline complete release

## 1. Publish the fixture host

Build and deploy the site once so every file under `/fixtures/` has a stable public HTTPS URL. The fixture URLs must open without Netlify authentication because GenLayer validators fetch them directly

```bash
npm ci
npm run build
```

Upload the contents of `dist` to Netlify or connect the repository with:

- Base directory: `faultline`
- Build command: `npm run build`
- Publish directory: `dist`
- Node version: `22`

## 2. Deploy the Intelligent Contract

Upload `contracts/faultline.py` in GenLayer Studio and deploy it to Studionet, or use:

```bash
npm run deploy:contract
```

The following Studionet contracts must not be used for the final benchmark. The first recorded empty evidence and the second reads `status_code` from an SDK response that exposes `status`. The corrected contract is deployed at `0xdD32cB20635515d8f3D5BeDC74c8b00472CD5221`:

```text
0x885f991bC856Ed4323dD49b8Acb1202Cb822a142 (superseded)
0xe57b2e9548e6D70e1ae6eC6e99Ba1759d99447fC (superseded)
```

## 3. Configure the frontend

Create `.env.local`:

```text
VITE_FAULTLINE_CONTRACT_ADDRESS=0xdD32cB20635515d8f3D5BeDC74c8b00472CD5221
VITE_GENLAYER_RPC_URL=https://studio.genlayer.com/api
VITE_GENLAYER_CHAIN_ID=61999
```

Rebuild and redeploy the contents of `dist`

## 4. Initialize once

1. Open the public site
2. Confirm the header shows `CONTRACT READY`
3. Connect an EVM-compatible wallet
4. Select `Launch protocol`
5. Select `Initialize benchmark`
6. Approve the transaction and wait for `Benchmark initialized`
7. Refresh and confirm `FIXTURES 04`

Initialization locks the public site origin into the four suite fixture URLs. Do not move the fixture host after this transaction

## 5. Final live verification

Run `Injection immunity` first. Confirm:

- The wallet asks for approval
- The drawer displays the submitted transaction hash
- The interface remains in validator consensus state until acceptance
- The new receipt appears in Consensus ledger
- Refreshing preserves the receipt because it is read from the contract
- No browser console error appears

After that check passes, the release is ready to make public
