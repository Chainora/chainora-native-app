# Constants Agent Guide

## Scope
Static app values shared across features, including theme tokens, NFC messages, network defaults, and logo mappings.

## Rules
- Keep constants free of side effects, async work, and runtime storage access.
- Preserve public names and values that screens, services, or persisted data depend on unless the migration is included.
- Treat theme and network constants as app-wide contracts.

## When Editing
- Prefer small focused files over broad catch-all constants.
- Keep naming explicit and stable for imports.
- Do not move network-sensitive values between `src/constants/` and `src/config/` without updating call sites deliberately.

## Verify
- Run `yarn -s tsc --noEmit` when exports, types, or imports change.
- Device/emulator check network, wallet, or UI flows affected by changed constants.
