# Features Agent Guide

## Scope
Feature modules (auth, settings, wallet, nfc, toast, etc.).

## Prompt Update Rule
After changing feature logic, update this file with touched modules and state/storage effects.

## Fast Navigation
- Feature hooks and providers are organized by domain.
- Keep storage keys backward compatible unless migration is added.
- Wallet screen implementation is feature-owned under `src/features/wallet/{home,send,receive,manage}`.
- Shared wallet UI helpers live under `src/features/wallet/shared/{components,hooks,utils}`.
- `src/features/wallet/storage/walletHomePreferences.ts` stores `@chainora/walletHome/visibility` for asset toggles and `@chainora/walletHome/dailyTotals` for local day-over-day portfolio snapshots.
- Home + wallet flow screens depend on persisted wallet-home visibility state when rendering asset lists.

## Latest Update
- Wallet feature now owns Home, Send, Receive, Token Manage, QR Scanner, and Wallet Details implementations.
- Public compatibility shims remain at legacy `src/features/wallet/*` paths while callers migrate.

## Verify
- yarn -s tsc --noEmit
- Test impacted user flow end-to-end.
