# Screens Agent Guide

## Scope
Screen-level UI and flow orchestration.

## Prompt Update Rule
After screen changes, update this file with affected screens, user flows, and side effects.

## Fast Navigation
- Screen components coordinate feature hooks, services, and dialogs.

## Latest Update
- `QRScannerScreen` now supports create-pool QR signing flow (`chainora-native-wallet:create-pool`) in addition to auth/username flows.
- Added scanned payload details rendering for create-pool variables and dynamic success messaging.
- Reset/progress logic now guards optional `sessionId` to avoid invalid auth-progress calls for non-auth QR features.

## Verify
- yarn -s tsc --noEmit
- Manually test the changed user paths on device/emulator.
