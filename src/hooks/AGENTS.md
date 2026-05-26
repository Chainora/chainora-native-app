# Hooks Agent Guide

## Scope
App-wide React hooks that coordinate state, services, lifecycle events, polling, and screen-facing behavior.

## Rules
- Keep hooks focused on React orchestration; put reusable pure logic in `src/utils/` or `src/lib/`.
- Keep side effects contained and cleanup explicit, especially polling, NFC, relay, wallet, and storage flows.
- Preserve hook return shapes used by screens unless all consumers are updated.

## When Editing
- Follow existing hook naming with `use*` camelCase files.
- Avoid embedding screen-only UI decisions in shared hooks.
- Add or update colocated tests where hook behavior, parsing, state transitions, or error handling changes.

## Verify
- Run `yarn -s tsc --noEmit`.
- Run `yarn test` when logic/state behavior changes.
- Device/emulator check NFC, wallet, Web3, or UI flows touched by hook changes.
