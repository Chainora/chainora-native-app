# Utils Agent Guide

## Scope
Generic utility helpers and pure functions.

## Prompt Update Rule
After utils changes, update this file with touched helpers and downstream usage notes.

## Fast Navigation
- Prefer pure, testable helpers with clear input/output behavior.

## Verify
- yarn -s tsc --noEmit
- Validate all call sites impacted by changed utility behavior.
