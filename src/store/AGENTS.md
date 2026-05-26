# Store Agent Guide

## Scope
Global providers, context state, and shared app state modules for auth, settings, toasts, and future cross-screen state.

## Rules
- Preserve storage keys, public context APIs, and provider ordering unless a migration is included.
- Keep service calls and persistence behavior explicit; do not hide high-risk wallet or NFC side effects in generic state helpers.
- Keep user-visible text behind locale keys when state changes surface messages.

## When Editing
- Update all providers, hooks, and consumers together when changing context shape.
- Prefer narrow state modules over a broad shared store.
- Add tests for new persistence, initialization, reducer, or context behavior where practical.

## Verify
- Run `yarn -s tsc --noEmit`.
- Run `yarn test` when state, storage, or provider behavior changes.
- Device/emulator check auth, settings, wallet, or toast flows affected by store changes.
