# Config Agent Guide

## Scope
Runtime app configuration (network and app-level constants).

## Prompt Update Rule
After config changes, update this file with changed keys/defaults and migration notes if behavior changes.

## Fast Navigation
- Network list/default and chain parameters are defined here.
- Use `getNetworkConfigByChainId` to resolve built-in or imported networks from EVM QR payloads.

## Verify
- yarn -s tsc --noEmit
- Validate app startup and network-dependent features.
