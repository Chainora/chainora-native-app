# Services Agent Guide

## Scope
Business logic and external interactions (card, transaction, sync, network clients).

## Prompt Update Rule
After service edits, update this file with changed APIs, behavior, and error-handling notes.

## Fast Navigation
- Transaction signing/sending and activity sync live here.
- Keep chain/network behavior consistent with config.

## Verify
- yarn -s tsc --noEmit
- Validate the exact runtime flow affected by the service change.
