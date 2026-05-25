# Features Agent Guide

## Scope
Feature modules (auth, settings, wallet, nfc, toast, etc.).

## Prompt Update Rule
After changing feature logic, update this file with touched modules and state/storage effects.

## Fast Navigation
- Feature hooks and providers are organized by domain.
- Keep storage keys backward compatible unless migration is added.
- `walletHomePreferences.ts` stores `@chainora/walletHome/visibility` for asset toggles and `@chainora/walletHome/dailyTotals` for local day-over-day portfolio snapshots.
- Home + wallet flow screens now depend on persisted wallet-home visibility state when rendering asset lists.

## Verify
- yarn -s tsc --noEmit
- Test impacted user flow end-to-end.
