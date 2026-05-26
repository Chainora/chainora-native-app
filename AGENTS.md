# Repository Guidelines

## Project Structure & Module Organization
`src/` holds all app code. Keep screen flows in `src/screens/`, reusable UI in `src/components/`, app-wide React hooks in `src/hooks/`, global providers/state in `src/store/`, external integrations and side-effect storage in `src/services/`, navigation types/routes in `src/navigation/`, shared config in `src/config/`, constants in `src/constants/`, shared types in `src/types/`, and pure helpers in `src/lib/` or `src/utils/`. `src/features/` is reserved for future isolated modules only. Assets and fonts live under `src/assets/`. Native platform projects stay in `android/` and `ios/`. Utility scripts such as `scripts/deploy-android.sh` and `scripts/setup-android-sdk.sh` are for local/devops tasks, not runtime logic.

## Build, Test, and Development Commands
Use Yarn 1 with Node 20+.

- `yarn start` starts Metro.
- `yarn android` builds and launches the Android app.
- `yarn ios` builds and launches the iOS app.
- `yarn lint` runs ESLint with the React Native preset.
- `yarn test` runs Jest.
- `yarn -s tsc --noEmit` performs the TypeScript check used in recent changes.
- `yarn tron` or `yarn device` sets up `adb reverse` for local RPC and port `9090`.

## Coding Style & Naming Conventions
Write TypeScript with 2-space indentation, single quotes, trailing commas, and omitted arrow parens when possible; `.prettierrc.js` is the source of truth. Follow `@react-native/eslint-config`. Use PascalCase for components/screens (`HomeScreen.tsx`), camelCase for hooks/utilities (`useWalletBalance.ts`, `recentActivityStorage.ts`), and keep route/type names explicit. Prefer small focused modules over broad shared files.

## UI Screen Update Rules
When the request is a screen/UI update, change only the named screen and the smallest required supporting components. Do not redesign unrelated screens, shared primitives, navigation flow, or service logic unless the prompt explicitly asks for it. Treat route params, callbacks, service call order, translation keys, theme tokens, and storage keys as invariants for UI-only work.

Match the visual language already used by the touched flow. Reuse existing primitives and tokens such as `src/components/ui/*`, `WALLET_COLORS`, `buildWalletScreenStyles`, and current typography choices before introducing new styles. Avoid one-off palettes, fonts, spacing systems, or "full redesign" passes that make a single screen drift from adjacent screens.

Keep user-visible copy behind existing `t('...')` keys whenever possible. Do not hardcode new English UI text, rename translation keys, or change tone/labels unless the task explicitly includes copy updates and the locale files are patched in the same change.

Preserve layout behavior, not just appearance: safe areas, keyboard avoidance, scroll reachability, sticky/bottom CTA visibility, and Android/iOS spacing should stay intact after the edit. For ambiguous design requests, default to the minimal diff that satisfies the requirement instead of broad visual experimentation.

## Testing Guidelines
Jest uses the `react-native` preset, and tests should be colocated as `*.test.ts` or `*.test.tsx`. Coverage is currently light, so add tests for new logic in `src/services/`, `src/hooks/`, `src/utils/`, and parsing/storage helpers when behavior changes. For sensitive NFC, wallet, or Web3 flows, pair `yarn test` with `yarn -s tsc --noEmit` and at least one device/emulator verification.

## Commit & Pull Request Guidelines
Recent history shows `feat:`, `fix:`, and `chore:` prefixes alongside a few informal messages. Standardize on short imperative Conventional Commit style, for example `fix: tighten wallet relay timeout`. PRs should include scope, risk areas, commands run, linked issue/task, and screenshots or recordings for UI changes.

## Security & Agent Notes
Do not commit real secrets from `.env`. Treat NFC/APDU, wallet relay, and network config changes in `src/services/` and `src/config/network.ts` as high risk; preserve storage keys and translation keys unless a migration is included. If you also maintain agent docs, keep the root `agent.md` in sync after repository-changing prompts.
