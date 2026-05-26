# Locales Agent Guide

## Scope
Translation dictionaries and locale-related text keys.

## Prompt Update Rule
After locale edits, update this file with added/removed keys and affected screens.

## Fast Navigation
- Keep key sets aligned across languages.
- Avoid hardcoded user-facing strings in UI code.

## Verify
- yarn -s tsc --noEmit
- Toggle language and verify updated text appears.

## Recent Locale Changes
- Added `sendTotalLabel` for Send review and TouchSign transaction summaries.
- Updated EcdhBackup copy for plain-language backup flow and added `ecdhStep1Label`-`ecdhStep4Label`, `ecdhIntroNeedPins`.
