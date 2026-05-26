# Services Agent Guide

## Scope
External effects and business logic, including storage, wallet relay, card/NFC, transaction, sync, balance, price, and Web3 clients.

## Rules
- Treat NFC/APDU, wallet relay, network config interactions, transaction signing, and storage behavior as high risk.
- Preserve storage keys, exported service APIs, request/response shapes, and error semantics unless migrations and callers are updated.
- Keep chain/network behavior consistent with `src/config/` and `src/constants/`.

## When Editing
- Keep wallet relay modules in `walletRelay/` and transaction signing/sending helpers in `transaction/`.
- Keep activity sync, card/NFC, balance, price, and Web3 client services focused; split only when a module grows beyond one responsibility.
- Add tests for parsing, storage, retry, signing, or request-building behavior changes where practical.

## Verify
- Run `yarn -s tsc --noEmit`.
- Run `yarn test` when logic, storage, parsing, or request behavior changes.
- Device/emulator check NFC, wallet, Web3, or transaction flows touched by service changes.
