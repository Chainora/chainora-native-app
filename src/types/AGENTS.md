# Types Agent Guide

## Scope
Shared TypeScript types and interfaces.

## Prompt Update Rule
After type changes, update this file with renamed/added/removed types and impacted consumers.

## Fast Navigation
- Keep exported types stable where possible.

## Verify
- yarn -s tsc --noEmit

## Recent Type Changes
- `ScanCardFlowConfig` includes optional `onFailure(message)` and `closeOnFailure` for flow screens that need to surface scan/sign failures outside `ScanCard`.
