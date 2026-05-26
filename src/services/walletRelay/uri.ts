import type { WalletRelayPairingPayload } from './protocol';

const PAIRING_SCHEME = 'chainora-wallet:';
const LOG_PREFIX = '[wallet-relay][uri]';

const normalizeRelayBase = (relay: string): string => {
  const trimmed = relay.trim();
  if (!trimmed) {
    throw new Error('Pairing URI missing relay endpoint.');
  }
  if (!/^wss?:\/\//i.test(trimmed)) {
    throw new Error('Pairing URI relay endpoint must use ws/wss.');
  }
  return trimmed.replace(/\/+$/, '');
};

const tryDecodeURIComponent = (raw: string): string => {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
};

const buildError = (reason: string, context: Record<string, unknown>): Error => {
  const detail = JSON.stringify(context);
  return new Error(`${reason} | debug=${detail}`);
};

export const parseWalletRelayPairingUri = (raw: string): WalletRelayPairingPayload => {
  const initial = raw.trim();
  const content = initial.toLowerCase().startsWith(PAIRING_SCHEME)
    ? initial
    : tryDecodeURIComponent(initial);

  console.log(`${LOG_PREFIX} parse.start`, {
    rawLength: raw.length,
    normalizedLength: content.length,
    rawPreview: raw.slice(0, 180),
    normalizedPreview: content.slice(0, 180),
  });

  if (!content) {
    throw new Error('QR code is empty.');
  }
  if (!content.toLowerCase().startsWith(PAIRING_SCHEME)) {
    throw buildError('Unsupported QR. Expected chainora-wallet://pair URI.', {
      expectedScheme: PAIRING_SCHEME,
      contentPreview: content.slice(0, 180),
    });
  }

  let parsed: URL;
  try {
    parsed = new URL(content);
  } catch {
    throw buildError('Invalid pairing URI format.', {
      contentPreview: content.slice(0, 180),
    });
  }

  const hostAction = parsed.hostname.trim().toLowerCase();
  const pathSegments = parsed.pathname
    .split('/')
    .map(item => item.trim().toLowerCase())
    .filter(Boolean);
  const actionCandidates = [hostAction, ...pathSegments];

  const sessionId = (parsed.searchParams.get('sessionId') || '').trim();
  const token = (parsed.searchParams.get('token') || '').trim();
  const relayWsBase = normalizeRelayBase(parsed.searchParams.get('relay') || '');
  const chainId = (parsed.searchParams.get('chainId') || '').trim();
  const version = (parsed.searchParams.get('v') || '1').trim();
  const hasRequiredFields = Boolean(sessionId && token && chainId && relayWsBase);
  const hasPairAction = actionCandidates.includes('pair');

  if (!hasPairAction && !hasRequiredFields) {
    throw buildError('Unsupported pairing action.', {
      host: parsed.hostname,
      pathname: parsed.pathname,
      actionCandidates,
      hasRequiredFields,
      queryKeys: Array.from(parsed.searchParams.keys()),
    });
  }

  if (!sessionId || !token || !chainId || !relayWsBase) {
    throw buildError('Pairing URI is missing required fields.', {
      sessionIdPresent: Boolean(sessionId),
      tokenPresent: Boolean(token),
      chainIdPresent: Boolean(chainId),
      relayPresent: Boolean(relayWsBase),
      queryKeys: Array.from(parsed.searchParams.keys()),
    });
  }

  if (!hasPairAction && hasRequiredFields) {
    console.warn(`${LOG_PREFIX} parse.action_missing_but_required_fields_present`, {
      host: parsed.hostname,
      pathname: parsed.pathname,
      actionCandidates,
    });
  }

  console.log(`${LOG_PREFIX} parse.success`, {
    version,
    sessionIdPreview: `${sessionId.slice(0, 8)}...`,
    chainId,
    relayWsBase,
    actionCandidates,
  });

  return {
    version,
    sessionId,
    token,
    relayWsBase,
    chainId,
  };
};
