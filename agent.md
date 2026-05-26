# Chainora Native Agent Guide

## Scope
React Native wallet app in this folder.

## Prompt Update Rule
After every prompt that changes this folder, update this `agent.md`.
Keep updates short and focused on: changed areas, verification commands, and caveats.

## Agent Skill
- Custom agent: `.github/agents/chainora-native.agent.md`
- Skill: `.github/skills/chainora-native/SKILL.md`

## Fast Navigation
- `src/screens/`: screen-level flows
- `src/components/`: reusable UI components
- `src/services/`: card, transaction, sync services, side-effect storage
- `src/store/`: auth/settings/toast providers
- `src/hooks/`: app-wide consumer hooks and wallet flow hooks
- `src/utils/`: pure wallet/encoding helpers
- `src/features/`: reserved for future isolated modules; no runtime code after the global-layer migration
- Wallet UI implementation lives in PascalCase `src/screens/*` entries, `src/components/wallet`, `src/hooks`, `src/services/storage`, and `src/utils`.
- `src/navigation/`: route names and stack params
- `src/locales/`: translation keys

## Verify
- `yarn -s tsc --noEmit`
- `yarn start`
- `yarn android`

## Session 2026-05-26 metro-alias-resolver
Summary: Added explicit Metro alias resolution for the same global import prefixes used by TypeScript/Babel so runtime bundling resolves imports such as `@hooks/useSettings`.
Changed files: metro.config.js, agent.md.
Validation: `yarn -s tsc --noEmit` passed; `yarn lint` passed with 13 existing warnings; `yarn test --runInBand` passed; `yarn react-native bundle --platform android --dev false --entry-file index.js --bundle-output .tmp\metro-verify\index.android.bundle --assets-dest .tmp\metro-verify\assets --reset-cache` passed.
Next steps: Restart Metro with reset cache if an old server is still running.

## Session 2026-05-26 screen-folder-normalization
Summary: Flattened legacy lowercase auth/relay/wallet screen groups into top-level PascalCase screen folders. Split the wallet flow monolith into route entries for SendPick, Send, Receive, TouchSign, TokenManage, and AddToken with shared wallet flow styles.
Changed files: src/navigation/AppNavigator.tsx, src/screens/**, src/features/agent.md, src/screens/agent.md, agent.md.
Validation: `yarn -s tsc --noEmit` passed; `yarn lint` passed with 13 existing warnings; `yarn test --runInBand` passed; grouped screen path and boundary scans returned no matches.
Next steps: Run typecheck/lint/test and manually verify auth NFC, relay signing, send/receive/manage wallet flows on device/emulator.

## Session 2026-05-26 strict-screen-boundaries
Summary: Removed direct service/native imports from legacy grouped auth/relay/wallet screens, plus Home/ChangePin. Moved auth shell/state/NFC/result support to global `src/components/auth`, `src/hooks`, and `src/utils`; added hook facades for scan-card registration, ECDH backup, wallet relay, Home preferences/relay account, send gas/transaction flow, token prices, and imported-network saves. Promoted screen service-boundary ESLint rule from warning to error and added SDK/deep-parent import guards.
Changed files: .eslintrc.js, src/types/wallet.ts, src/services/cardService.ts, src/services/scanCardFlowRegistry.ts, src/services/walletRelaySessionManager.ts, src/components/auth/**, src/hooks/**, src/utils/scanCardResult.ts, src/screens/**, src/screens/Home/index.tsx, src/screens/ChangePin/index.tsx, src/screens/agent.md.
Validation: `yarn -s tsc --noEmit` passed; `yarn lint` passed with 13 pre-existing warnings; `yarn test --runInBand` passed.
Next steps: Manual device/emulator pass for auth NFC, relay signing, send/touch-sign, and add-network flows.

## Session 2026-05-26 global-layer restructure
Summary: Added absolute import aliases, moved auth/settings/toast providers to `src/store`, moved consumer/wallet/NFC hooks to `src/hooks`, moved wallet storage services to `src/services/storage`, moved wallet UI helpers/components to global `src/utils` and `src/components/wallet`, and moved Home/Settings/wallet route implementations out of `src/features`.
Changed files: tsconfig.json, babel.config.js, jest.config.js, .eslintrc.js, App.tsx, src/store/**, src/hooks/**, src/services/storage/**, src/components/wallet/**, src/screens/**, src/utils/**, src/types/wallet.ts, docs.
Validation: `yarn -s tsc --noEmit` passed; `yarn test --runInBand` passed; `yarn lint` passed with warnings for legacy service imports and existing style/bitwise/no-void rules.
Next steps: Continue extracting legacy screen service calls behind hooks, then promote the screen import-boundary rule from warning to error.

## Session 2026-05-26 wallet-feature-ownership refactor
Summary: Moved wallet home/send/receive/manage screen implementation under the old feature-first wallet structure, kept thin route wrappers, extracted shared wallet hooks/utils/components, and moved `ToastType` out of the UI component module.
Changed files: src/features/wallet/**, src/screens/**, src/components/Toast.tsx, src/features/toast/**, src/services/scanCardFlowRegistry.ts
Validation: `yarn -s tsc --noEmit` passed; `yarn test` passed; `yarn lint` still fails on pre-existing unrelated issues in `src/lib/nfc/isoDepClient.ts`, `src/services/transaction/signatureUtils.ts`, and `src/utils/encoding.ts`.
Next steps: Manually verify wallet home/activity, send, receive, token-manage, and add-network flows on device/emulator.

## Session 2026-05-24 agent-doc ui exactness guardrail
Summary: Tightened agent instructions so UI/screen-only requests stay scoped to the named screen, preserve flow/business invariants, reuse existing design tokens/primitives, and avoid off-pattern redesigns or hardcoded copy changes.
Changed files: AGENTS.md; agent.md
Validation: Documentation update only (no code/test run).
Next steps: Apply these guardrails on future screen refreshes; when UI requests are ambiguous, choose the smallest visual diff that satisfies the prompt.

## Session 2026-04-15 createpool-hotfix
Summary: Added createPool ABI minReputation support, auto card-attestation verify attempt on device-not-verified precheck, clearer on-chain verification error, and SafeAreaView migration.
Changed files: chainora-dapp/.env.contracts.example, chainora-dapp/.env.local, chainora-dapp/src/contract/chainoraAbis.ts, chainora-dapp/src/contract/chainoraProtocol.ts, chainora-dapp/src/pages/create-group.tsx, chainora-dapp/src/pages/dashboard.tsx, chainora-native-app/src/services/qrLoginService.ts, chainora-native-app/src/screens/QRScannerScreen.tsx
Validation: dapp yarn typecheck + yarn build passed; native npx tsc --noEmit passed
Next steps: Run mobile QR->NFC createPool on deployed contracts and confirm device adapter verification status for wallet

## Session 2026-04-15 create-pool onchain device verification
Summary: Added automatic on-chain device attestation submit flow before createPool retry (request backend attestation + submitVerification tx).
Changed files: chainora-api/src/rest/handler/card_handler.go, chainora-api/src/rest/routers/routes.go, chainora-api/src/rest/bootstrap/bootstrap.go, chainora-api/src/rest/config/config.go, chainora-api/src/rest/config/config.yaml, chainora-api/src/rest/config/config.yaml.example, chainora-api/src/rest/properties/properties.go, chainora-native-app/src/services/qrLoginService.ts
Validation: go test ./... (rest) passed; npx tsc --noEmit (native) passed; yarn typecheck (dapp) passed
Next steps: Set CARD_DEVICE_VERIFIER_PRIVATE_KEY and trust its address on ChainoraDeviceAdapter, then run QR+NFC createPool E2E

## Session 2026-04-15 create-pool session lock + status sync
Summary: Create-pool flow now emits session progress statuses, parses sessionId from QR payload, softens post-verification recheck race, and aligns reputation gate diagnostics to >= minReputation.
Changed files: chainora-dapp/src/pages/create-group.tsx, chainora-dapp/.env.contracts.example, chainora-dapp/.env.local, chainora-native-app/src/services/qrLoginService.ts, chainora-native-app/src/screens/QRScannerScreen.tsx
Validation: native npx tsc --noEmit passed; dapp yarn typecheck passed
Next steps: Restart dapp/native/api, verify one-scan create-pool UX and confirm registry points to new factory dependencies

## Session 2026-04-15 precheck latency analysis
Summary: No module code changes. Confirmed create-pool precheck executes simulateContract plus diagnostic/read flows and optional device-attestation path; RPC timeout/retry amplifies latency.
Changed files: none
Validation: Code inspection only (no build/test run).
Next steps: Optionally tune viem transport retry/timeout and trim duplicate on-chain diagnostics to reduce precheck wait time.

## Session 2026-04-15 create-pool precheck latency optimization
Summary: Optimized create-pool responsiveness by reducing viem transport retry depth, adding timeout-aware fail-fast in precheck, parallelizing registry diagnostics, skipping reputation reads when minReputation is zero, and pausing background activity sync during create-pool scan flow.
Changed files: chainora-native-app/src/services/web3Client.ts; chainora-native-app/src/services/qrLoginService.ts; chainora-native-app/src/services/activitySyncService.ts; chainora-native-app/src/screens/QRScannerScreen.tsx
Validation: cd chainora-native-app && npx tsc --noEmit (pass)
Next steps: Measure median create_pool_precheck duration from scan to signing stage; if still high, add dedicated fast RPC endpoint for precheck-only reads.

## Session 2026-04-15 login-session device verification warmup
Summary: Auth login flow now performs best-effort on-chain device verification warmup using login session context, so verified wallets can skip expensive device-verification branch later in create-pool/invite flows. Added parser support for login payload device verification metadata and login-specific websocket progress status mapping.
Changed files: chainora-dapp/src/services/authQrFlow.ts; chainora-dapp/src/components/auth/HeaderLoginButton.tsx; chainora-native-app/src/services/qrLoginService.ts; chainora-native-app/src/screens/QRScannerScreen.tsx
Validation: cd chainora-native-app && npx tsc --noEmit (pass); cd chainora-dapp && yarn typecheck (pass)
Next steps: Test one full login scan on mobile with stable RPC and verify ws statuses login_device_* then check create-pool precheck bypasses device adapter verification path.

## Session 2026-04-15 precheck-timeout bypass and new pool implementation config
Summary: Adjusted create-pool path to avoid hard-fail on RPC timeout during precheck/re-precheck: now emits create_pool_precheck_timeout_continue and proceeds to signing/submit flow. This mitigates slow-RPC precheck blockers while preserving adapter/reputation diagnostics when RPC responds.
Changed files: chainora-native-app/src/services/qrLoginService.ts; chainora-dapp/src/pages/create-group.tsx; chainora-dapp/.env.local; chainora-dapp/.env.contracts.example
Validation: cd chainora-native-app && npx tsc --noEmit (pass); cd chainora-dapp && yarn typecheck (pass)
Next steps: Restart dapp/native to reload env and flow logic, then test create-pool after login warmup; if tx still stalls, switch Chainora RPC endpoint to a healthier node.

## Session 2026-04-15 login/create-pool smoothness speed pass
Summary: Improved UX smoothness by making login on-chain warmup non-blocking (background, no session progress lock), adding soft-timeout precheck for create-pool simulation (continues to signing when RPC is slow), and adding soft-timeout gas estimation fallback for faster tx preparation under unstable RPC.
Changed files: chainora-native-app/src/screens/QRScannerScreen.tsx; chainora-native-app/src/services/qrLoginService.ts; chainora-native-app/src/services/transactionService.ts
Validation: cd chainora-native-app && npx tsc --noEmit (pass); cd chainora-dapp && yarn typecheck (pass)
Next steps: Restart Metro/native app and dapp dev server; then verify login closes promptly after auth verify and create-pool reaches signing stage even when precheck RPC is sluggish.

## Session 2026-04-15 10:45
Summary: No module code changes this session.
Changed files: chainora-api/src/rest/handler/group_handler.go, chainora-dapp/src/services/groupsService.ts, chainora-dapp/src/pages/dashboard.tsx
Validation: GOCACHE=/tmp/go-build-cache go test ./... (chainora-api/src/rest) passed; yarn typecheck (chainora-dapp) passed
Next steps: Configure worker username_sync.addresses from DB-derived wallet list and restart worker/api services.
