# WalletConnect Setup (Native App)

## Required env

Create/update `.env` in the native app root:

```env
WALLETCONNECT_PROJECT_ID=<your_walletconnect_cloud_project_id>
WALLETCONNECT_RELAY_URL=wss://relay.walletconnect.com
```

This project uses `react-native-dotenv` (Babel) to inject these values at bundle time.

If `WALLETCONNECT_PROJECT_ID` is missing, native wallet pairing is rejected with a runtime error.

## Supported pairing inputs

- `wc:` URI directly.
- Deep link containing `uri` query:
  - `chainora://wc?uri=<encoded_wc_uri>`
- WalletConnect QR payload that resolves to one of the above.

## Signing methods implemented

- `eth_requestAccounts`
- `eth_accounts`
- `eth_chainId`
- `personal_sign`
- `eth_signTypedData_v4` (EIP-712 hash path)
- `eth_sendTransaction`
- `wallet_switchEthereumChain`
