# Services Agent Guide

## Scope
Business logic and external interactions (card, transaction, sync, network clients).

## Prompt Update Rule
After service edits, update this file with changed APIs, behavior, and error-handling notes.

## Fast Navigation
- Wallet relay modules live in `walletRelay/`.
- Transaction signing/sending helpers live in `transaction/`.
- Activity sync, card/NFC, balance, price, and web3 client services remain top-level until they grow beyond one focused module.
- Keep chain/network behavior consistent with config.

## Latest Update
- Grouped wallet relay modules under `walletRelay/` and moved `transactionService.ts` into `transaction/` beside signature utilities.
- No service API behavior changed; call sites now import from the grouped paths.

## Verify
- yarn -s tsc --noEmit
- Validate the exact runtime flow affected by the service change.
