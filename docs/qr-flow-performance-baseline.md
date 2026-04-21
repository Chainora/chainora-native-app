# QR Flow Performance Baseline

## Fast flows currently used as baseline

The following pool-action QR flows are considered fast and stable:

- `propose invite`
- `request to join`
- `leave group (forming phase)`

These flows feel fast because they use a short path:

1. Keep pre-check lightweight (short timeout, continue when RPC is slow).
2. Keep signing in one NFC session.
3. Submit transaction immediately after signing.
4. Handle nonce mismatch with fresh-nonce retry, instead of restarting the flow.
5. Poll receipt with short interval and clear progress statuses.

## Rules for slow-flow remediation

When a QR flow is slow, apply this order:

1. Remove redundant RPC round-trips before submit.
2. Add priority gas for the target action type.
3. Keep only nonce-recovery retry for submit errors (`incorrect account sequence`, nonce conflict).
4. Avoid long blocking fallback paths; prefer quick retry first.
5. Keep backend sync mandatory only where UI consistency depends on it (create-group listing).

## Parallel-first execution design (for current Chainora profile)

Chainora currently shows low median RPC latency but high tail spikes. The QR design should be:

1. Start read-only RPC warmups immediately:
   - pending nonce warmup
   - priority gas-price probe
   - action precheck probe (where available)
2. Keep these warmups outside NFC session whenever possible.
3. Enter NFC only after quick prechecks are done (or soft-timeout fallback is decided).
4. First submit should consume warmed nonce + warmed gas.
5. On nonce conflict, drop warmed nonce and retry with fresh nonce + replacement gas bump.
6. Never block user flow on long precheck RPC tails if the flow has safe fallback.

This minimizes the time users must keep card on device and reduces perceived delay.

## Applied in this patch

### Create group

- Keep nonce-recovery submit retry.
- Increase create-group gas priority boost to reduce confirm latency.
- Skip extra device-verification lookup when cache is unknown (fast path).
- Keep backend sync required before `create_pool_success` so dashboard can show the new group immediately.
- Warm priority gas + pending nonce in parallel before signing.
- Use warmed nonce on first submit to remove one RPC call from critical path.

### Membership acceptance (`accept invite`, `accept join request`)

- Treat acceptance actions as membership-priority actions.
- Apply priority gas for these actions.
- Use the same fresh-nonce recovery pattern as fast membership flows.
- Run membership precheck and pending-nonce warmup in parallel before NFC submit stage.

### Contribute (especially second contributor)

- Remove redundant approval preflight simulation round-trip.
- Apply priority gas to approval + contribute path.
- On nonce conflict after approval broadcast:
  - retry contribute quickly first,
  - only then wait short approval confirmation as fallback.

## Status contract between native and dapp

For pool actions and create-group:

- Success status is emitted only after the critical consistency step is completed:
  - `create_pool_success`: on-chain confirmed + backend group persisted
  - `pool_action_success`: on-chain confirmed

This keeps dapp refresh behavior deterministic.
