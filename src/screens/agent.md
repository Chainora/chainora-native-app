# Screens Agent Guide

## Scope
Screen-level UI and flow orchestration.

## Prompt Update Rule
After screen changes, update this file with affected screens, user flows, and side effects.

## Fast Navigation
- Screen components render and coordinate hooks/dialogs. They must not import `@services/*`, native SDKs, direct storage, or deep parent chains.

## Latest Update
- Legacy lowercase auth/relay/wallet groups were flattened into top-level PascalCase screen folders.
- Auth, relay, and wallet screens route service/native side effects through global hooks. Auth support code lives in `src/components/auth`, `src/hooks`, and `src/utils`.
- Home and ChangePin also use hook facades for storage/relay/card scan flows.
- Wallet route implementations now live under `src/screens/Home`, `src/screens/SendPick`, `src/screens/Send`, `src/screens/Receive`, `src/screens/TouchSign`, `src/screens/TokenManage`, `src/screens/AddToken`, `src/screens/QRScanner`, and `src/screens/WalletDetails`; shared wallet hooks/services/components live in global layers.
- `QRScannerScreen` now supports create-pool QR signing flow (`chainora-native-wallet:create-pool`) in addition to auth/username flows.
- Added scanned payload details rendering for create-pool variables and dynamic success messaging.
- Reset/progress logic now guards optional `sessionId` to avoid invalid auth-progress calls for non-auth QR features.

## Verify
- yarn -s tsc --noEmit
- Manually test the changed user paths on device/emulator.
