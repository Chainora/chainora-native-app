# Chainora Mobile App — Setup & ADB Debug Guide

This document walks through preparing a development environment for the Chainora React Native app and using `adb` tooling to debug NFC flows on Android devices.

---

## 1. Prerequisites

- **Node.js 20+**
- **Yarn 1.22+** (commands below assume Yarn)
- **Java 17** (required by the Android Gradle build)
- **Android Studio** with the following components installed via the SDK Manager:
  - Android SDK Platform 36
  - Android SDK Build-Tools 36.0.0
  - Android NDK 27.1.12297006
  - Android Emulator (if you plan to use the emulator)
  - Google USB Driver (Windows only)
- **adb / Android platform-tools**
- **Watchman** (macOS optional, improves file watching)

On Windows PowerShell, the default SDK path is usually:

```powershell
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
```

You can generate `android/local.properties` automatically with:

```powershell
.\scripts\setup-android-sdk.ps1
```

---

## 2. Install Dependencies

From the `chainora-native-app/` directory:

```powershell
corepack yarn install
```

For iOS builds (on macOS):

```bash
(cd ios && bundle install && bundle exec pod install)
```

---

## 3. Start Metro

Metro bundles JavaScript for React Native. Keep it running in its own terminal:

```powershell
corepack yarn start
```

Use `r` (reload) or `shift + r` (hard reload) inside the Metro terminal to refresh the app during development.

---

## 4. Launch the Android App

With Metro running, open another terminal in `chainora/` and run:

```powershell
corepack yarn android
```

This builds the native project, installs it on the attached device/emulator, and launches the Chainora app. If Gradle fails, run again with `--stacktrace` to inspect the error:

```powershell
corepack yarn android --stacktrace
```

If more than one `adb` target is connected, set `ANDROID_SERIAL` before running `corepack yarn device` or `corepack yarn android`.
On Windows, `corepack yarn android` now prefers the Android Studio bundled JBR automatically when it is installed.

> **Tip:** For a clean build, run `cd android && ./gradlew clean` before invoking `yarn android`.

---

## 5. Verify `adb` Connectivity

Make sure a device or emulator is connected:

```sh
adb devices
```

Typical output:

```
List of devices attached
emulator-5554   device
```

If you see `unauthorized` for a physical device, accept the USB debugging prompt on the phone and rerun `adb devices`.

---

## 6. Capture Logs with `adb logcat`

To investigate NFC flows, Tail system logs in a dedicated terminal. Filter by the app’s `Chainora` tag and the React Native NfcManager logs:

```sh
adb logcat | grep -E "(NFC|Chainora|ReactNativeJS)"
```

Common filters:

- `adb logcat -s ReactNativeJS` — JavaScript console logs (`console.log`).
- `adb logcat -s Chainora` — Custom native logs (if any).
- `adb logcat -s "NfcService"` — Android platform messages about NFC state.

Press `Ctrl + C` to stop streaming logs.

### Save Logs to a File

```sh
adb logcat -v time | tee /tmp/chainora.log
```

Use this when collecting logs to share with teammates.

---

## 7. Reset the App Between Tests

To reset the JS bundle state without reinstalling:

```sh
adb shell am force-stop com.chainora
adb shell am start -n com.chainora/.MainActivity
```

If you changed native code or Gradle config, reinstall instead:

```sh
yarn android
```

---

## 8. NFC Debug Checklist

1. **Confirm NFC support**: Toggle NFC in Android settings, then run `adb logcat -s NfcService` to ensure the system reports the state change.
2. **Watch for APDU status words**: The app logs card responses, e.g. `statusWord: "9000"` for success. Non-`9000` values (like `6D00`, `6700`) point to APDU formatting or applet compatibility issues.
3. **Ensure IsoDep availability**: When calling the wallet, look for `[NFC] Wallet` logs confirming the app selected the Chainora applet. If you see `IsoDep handler unavailable`, reconnect the device or re-enable NFC.
4. **Clear lingering requests**: Use `adb logcat | grep "You can only issue one request"` to spot concurrency issues. Restart the app if requests stack up.

---

## 9. Updating the JavaCard Applet (Optional)

The mobile app expects the ChainoraWallet applet described in `chainora-applet/docs/apdu-command.md`. Flash the latest CAP to your Secure Element or test card to unlock the full feature set (PIN initialisation, verification, key management).

---

## 10. Useful `adb` Utilities

- **Forward Metro devtools to a device** — helpful when the phone and host are on different networks:

  ```sh
  adb reverse tcp:8081 tcp:8081
  ```

- **Screen recording for bug reports**:

  ```sh
  adb shell screenrecord /sdcard/chainora-demo.mp4
  adb pull /sdcard/chainora-demo.mp4 ./chainora-demo.mp4
  ```

- **Clear app storage** (reset local state):

  ```sh
  adb shell pm clear com.chainora
  ```

---

## 11. Troubleshooting Table

| Symptom | Suggested Fix |
| --- | --- |
| `app:installDebug FAILED` | Update Android SDK Build-Tools, ensure device has free storage, rerun `yarn android`. |
| `Execution failed for task ':app:processDebugMainManifest'` | Run `cd android && ./gradlew clean`, then rebuild. |
| `Metro is not running` message in app | Start Metro (`yarn start`) and ensure `adb reverse tcp:8081 tcp:8081` is active. |
| NFC stays disabled | Reboot phone, toggle Airplane Mode, or check if another app is monopolising the NFC adapter. |
| APDU response `6D00`/`6700` | Ensure the wallet applet supports the command set and confirm the APDU payload length matches the spec. |

---

## 12. Next Steps

- Update `chainora/src/services/cardService.ts` when the JavaCard applet gains new commands (e.g. signing transactions).
- Add integration tests or mock IsoDep sessions for regression coverage.
- Share collected logs via your team’s issue tracker to speed up triage.

Happy debugging!
