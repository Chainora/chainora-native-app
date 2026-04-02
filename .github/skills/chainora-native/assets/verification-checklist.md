# Verification Checklist

## Pre-Edit
- Identify behavior-sensitive paths (auth, NFC, transaction, backup, storage).
- Confirm constraints that must not change.

## Post-Edit
- Run targeted file diagnostics.
- Run project check: `yarn -s tsc --noEmit`.
- Verify requirement-to-edit mapping is complete.

## For UI Flow Changes
- Verify each step transition in order.
- Verify button enable/disable state.
- Verify localized text is still from translation keys.

## For Data/Sync Changes
- Verify cache clear behavior.
- Verify no duplicate activity writes.
- Verify polling interval impact is acceptable.
