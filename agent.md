# Chainora Native Agent Guide

## Scope
React Native wallet app in this folder.

## Prompt Update Rule
After every prompt that changes this folder, update this `agent.md`.
Keep updates short and focused on: changed areas, verification commands, and caveats.

## Agent Skill
- Custom agent: `.github/agents/chainora-native.agent.md`
- Skill: `.github/skills/chainora-native/SKILL.md`

## Fast Navigation
- `src/screens/`: screen-level flows
- `src/components/`: reusable UI components
- `src/services/`: card, transaction, sync services
- `src/features/`: settings/auth/nfc/domain hooks
- `src/navigation/`: route names and stack params
- `src/locales/`: translation keys

## Verify
- `yarn -s tsc --noEmit`
- `yarn start`
- `yarn android`
