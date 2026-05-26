# Config Agent Guide

## Scope
Runtime app configuration (network and app-level constants).

## Prompt Update Rule
After config changes, update this file with changed keys/defaults and migration notes if behavior changes.

## Fast Navigation
- Network list/default and chain parameters are defined here.
- Network source of truth is the fixed Home set: Ethereum, BNB Smart Chain, Polygon, Arbitrum, and Optimism.
- The default active network is `ethMainnet`; legacy stored network keys should fall back to Ethereum.
- Use `getNetworkConfigByChainId` to resolve the fixed built-in EVM networks from QR payloads.

## Verify
- yarn -s tsc --noEmit
- Validate app startup and network-dependent features.
