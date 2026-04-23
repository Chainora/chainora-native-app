# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Start Metro bundler
yarn start

# Run on Android / iOS
yarn android
yarn ios

# Lint & format check
yarn lint

# Run tests
yarn test

# Run a single test file
yarn test path/to/file.test.ts

# ADB reverse proxies for local blockchain RPC + Reactotron
yarn device   # ports 8545, 8546, 8547, 9090
yarn tron     # Reactotron only (port 9090)
```

> Requires Node >= 20 and Yarn 1.x (`yarn` not `npm`).

## Architecture Overview

### Provider Tree

`App.tsx` wraps everything in this order:
```
SafeAreaProvider
  └── SettingsProvider      (language, theme, currency, network)
        └── AuthProvider    (wallet session, address, TTL)
              └── WalletConnectProvider  (WC sessions, peer info, request approval)
                    └── ToastProvider
                          └── AppNavigator
```

No Redux or MobX — all global state is React Context backed by AsyncStorage.

### Feature Modules (`src/features/`)

Each feature exports a context provider + hook pair:

| Feature | Key State | Persistence |
|---|---|---|
| `auth` | address, isAuthenticated | AsyncStorage (10 min pending, 24 h active) |
| `settings` | language, theme, currency, network | AsyncStorage |
| `toast` | message, type | in-memory only |
| `nfc` | NFC enabled check | device hardware |
| `wallet` | recent activity | AsyncStorage |
| `walletconnect` | sessions, peer info, pending requests | in-memory (WC SDK) |

### Navigation (`src/navigation/`)

Single `@react-navigation/native-stack`. All route names are string constants in `src/navigation/routes/routes.ts`. Type-safe params via `RootStackParamList`. Initial route: **Welcome**.

### Services (`src/services/`)

Business logic layer — no UI concerns here:

**Core services:**
- **`web3Client.ts`** — viem public client with fallback RPC (2 retries, 450 ms delay, 12 s timeout). Supports ETH, Polygon, BNB, Chainora Testnet.
- **`balanceService.ts`** — Fetches native or Chainora stablecoin balance; returns string formatted to 4 dp.
- **`activitySyncService.ts`** — Cursor-based blockchain scan (40-block init, 20-block overlap). Stores up to 30 recent txs. Has `pause()`/`resume()`.
- **`cardService.ts`** — APDU command sequences for smart card operations (PIN init/verify/change, key gen, signing).
- **`transactionService.ts`** — Constructs and broadcasts signed transactions. Sub-utilities in `transaction/`.
- **`qrPayloadParserService.ts`** — Parses QR scan payloads and dispatches to the correct flow (auth, group creation, pool actions).

**QR flow services (`src/services/qr*`):**
- **`qrAuthFlowService.ts`** / **`qrAuthDeviceVerificationService.ts`** / **`qrAuthProofService.ts`** — Multi-step QR authentication with device verification.
- **`qrLoginService.ts`** — Orchestrates QR login session lifecycle.
- **`qrSessionProgressService.ts`** — Tracks and publishes QR session state.
- **`qrCreateGroupFlowService.ts`** / **`qrCreateGroupDeviceVerificationService.ts`** / **`qrCreateGroupPrecheckService.ts`** — Group creation via QR scan.
- **`qrPoolActionFlowService.ts`** / **`qrPoolActionBiddingPrecheckService.ts`** / **`qrPoolActionCollectingPrecheckService.ts`** / **`qrPoolActionFormingPrecheckService.ts`** / **`qrPoolActionHelpers.ts`** — Pool action flows (bidding, collecting, forming).
- **`qrUsernameFlowService.ts`** — Username registration flow via QR.
- **`qrFlowCommonService.ts`** — Shared utilities across all QR flows.
- **`qrTypes.ts`** — Shared type definitions for all QR services.
- **`qr-login/`** — Sub-utilities: crypto, RPC, precheck, device verification cache, error handling, status publisher.

**WalletConnect services (`src/services/walletconnect/`):**
- Session management, EVM request handling, and WC runtime wiring.

### Smart Card Layer (`src/lib/`)

```
lib/apdu/        — raw APDU byte builders
lib/nfc/         — ISO-DEP transport (isoDepClient.ts)
lib/crypto/      — secp256k1 / Noble hashes wrappers
```

Card communication: NFC ISO-DEP → `isoDepClient` → `apdu/` builders → `cardService` flows.

### Network Config (`src/config/network.ts`)

Hardcoded RPC endpoints — no `.env` files. For local dev, the app probes `10.0.2.2` (Android emulator), `10.0.3.2` (Genymotion), and `localhost`. Remote Chainora testnet: `157.66.100.120:8545`.

Chainora stablecoin address: `0x79abce4dc09dce832361090d35ba8ae051cd1fd6` (18 decimals, chain ID `1123337227327254`).

### Localization (`src/locales/`)

English and Vietnamese. Language set via `SettingsProvider`. Use the `t()` function from `useSettings()` hook. Add new keys to both `en.ts` and `vi.ts`.

## Key Patterns

- **Mount-tracking refs** (`isMountedRef`) guard all async callbacks to prevent state updates after unmount.
- **BigInt** is used for all on-chain amount arithmetic — never `number` or `parseFloat` for token values.
- **Debouncing** on balance polling; post-send refresh waits intentionally before re-fetching.
- **Signature-based deduplication** in activity sync — don't remove it when refactoring.
- Screen components live in `src/screens/`, reusable UI pieces in `src/components/ui/`.
