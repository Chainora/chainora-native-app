---
name: chainora-native
description: "Implement and refactor chainora-native-app features with high exactness and prompt saveability. Use for UI flow updates, localization-safe edits, performance-safe refactors, and requirement-to-code traceable delivery. Keywords: exact flow, preserve logic, safe refactor, prompt contract, verification checklist."
argument-hint: "Task goal, non-negotiable constraints, target files, and acceptance criteria"
user-invocable: true
---

# Chainora Native Exactness Skill

Use this skill when a task needs precise requirement execution and durable prompt-to-code traceability.

## When To Use
- UI flow changes where logic/order must stay intact.
- Refactors that must avoid behavior regressions.
- Tasks requiring clear mapping from prompt requirements to edits.
- Multi-file changes that need a repeatable verification checklist.

## Procedure
1. Create a requirement contract using [prompt contract template](./assets/prompt-contract-template.md).
2. Identify invariant-sensitive code paths (navigation params, service call order, persistence keys, i18n keys).
3. Apply minimal, focused edits only in necessary files.
4. Run validation from [verification checklist](./assets/verification-checklist.md).
5. Report requirement coverage explicitly in the final response.

## Chainora-Specific Guardrails
- Keep JavaCard interaction sequence unchanged unless explicitly requested.
- Preserve existing translation key usage (`t('...')`) and theme tokens.
- Keep wallet/activity storage keys backward compatible unless migration is included.
- Avoid introducing polling/storage-heavy logic without batching or throttling.

## Output Requirements
- Requirement Coverage: each user requirement mapped to file-level changes.
- Validation Results: exact command(s) executed.
- Follow-up Risks: only if relevant.
