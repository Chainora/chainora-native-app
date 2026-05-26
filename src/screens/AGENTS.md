# Screens Agent Guide

## Scope
Screen-level UI and flow orchestration.

## Rules
- Keep screens focused on rendering and coordinating hooks, dialogs, and navigation.
- Do not import `@services/*`, native SDKs, direct storage, or deep parent chains from screens.
- Preserve route params, callbacks, service call order, translation keys, safe areas, keyboard behavior, scroll reachability, and sticky/bottom CTA visibility.

## When Editing
- Change only the named screen and the smallest required supporting pieces for UI-only requests.
- Match adjacent visual language and reuse existing primitives/tokens before adding new styles.
- Keep top-level screens in PascalCase folders: `src/screens/<Screen>/index.tsx` for orchestration and `src/screens/<Screen>/<Screen>.styles.ts` for styles.
- Keep user-visible copy behind existing `t('...')` keys unless locale files are updated in the same change.

## Verify
- Run `yarn -s tsc --noEmit`.
- Device/emulator check changed UI, NFC, wallet, or Web3 flows.
