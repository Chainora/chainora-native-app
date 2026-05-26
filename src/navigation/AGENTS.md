# Navigation Agent Guide

## Scope
Route names, param types, and navigator setup.

## Prompt Update Rule
After navigation changes, update this file with route additions/removals and param updates.

## Fast Navigation
- Keep route constants and RootStackParamList in sync.
- `QRScanner` accepts wallet/public key context plus an optional fallback wallet network for receive QR scans.
- `Send` accepts optional `initialRecipient` for QR-prefilled recipient flows.

## Verify
- yarn -s tsc --noEmit
- Validate navigation to changed screens.
