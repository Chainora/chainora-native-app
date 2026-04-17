# Services Agent Guide

## Scope
Business logic and external interactions (card, transaction, sync, network clients).

## Prompt Update Rule
After service edits, update this file with changed APIs, behavior, and error-handling notes.

## Fast Navigation
- Transaction signing/sending and activity sync live here.
- Keep chain/network behavior consistent with config.

## Latest Update
- Added QR feature support for `chainora-native-wallet:create-pool` in `qrLoginService`.
- New flow: parse create-pool contract variables from QR, sign+broadcast factory `createPool`, decode `ChainoraPoolCreated`, and optionally persist group to backend when `authToken` is present in QR payload.
- `QrLoginPayload.sessionId` is now optional to support non-auth QR features.

## Verify
- yarn -s tsc --noEmit
- Validate the exact runtime flow affected by the service change.
