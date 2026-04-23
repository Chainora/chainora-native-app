# Chainora Native App

React Native wallet and QR/NFC companion app for Chainora.

## Local Development Baseline

- Node `20 LTS`
- Yarn `1.22.x`
- Java `17`
- Android SDK `36`
- Android Build Tools `36.0.0`
- Android NDK `27.1.12297006`
- `adb` in `PATH`

Android is the primary local target on Windows. iOS remains macOS-only.

## Setup

### 1. Install dependencies

```powershell
corepack yarn install
```

### 2. Create the local env file

Copy `.env.example` to `.env` and replace `WALLETCONNECT_PROJECT_ID=__TODO__` with a real WalletConnect Cloud project id.

### 3. Create `android/local.properties`

PowerShell:

```powershell
.\scripts\setup-android-sdk.ps1
```

This writes the detected Android SDK path into `android/local.properties`.

### 4. Start Metro

```powershell
corepack yarn start
```

Use `corepack yarn start:reset` when the Metro cache needs to be cleared.

### 5. Prepare Android port forwarding

```powershell
corepack yarn device
```

This reverses ports `8545`, `8546`, `8547`, and `9090` through `adb`.
If more than one device is connected, set `ANDROID_SERIAL` first.

### 6. Run the app

```powershell
corepack yarn android
```

On Windows, this script automatically prefers the Android Studio bundled JBR when available to avoid Gradle/CMake issues with newer system JDKs.

## iOS

iOS requires macOS, Xcode, Ruby `>= 2.6.10`, and CocoaPods. When working on macOS:

```bash
bundle install
cd ios
bundle exec pod install
```

Then run `corepack yarn ios`.

## Validation

```powershell
corepack yarn lint
corepack yarn test
corepack yarn -s tsc --noEmit
```

## QR and NFC Notes

- QR payloads embed the backend `apiBase`; on a real phone this must use your laptop LAN IP, not `localhost`.
- Full NFC testing requires a real NFC-capable device and the Chainora card/applet.
- WalletConnect pairing reads values from `.env` first and rejects the placeholder project id.
