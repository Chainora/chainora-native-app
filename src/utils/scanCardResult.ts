import type { LocaleKey } from '@locales';
import type { ScanMode, WalletActionCode, WalletActionResult } from '@app-types/wallet';

type TranslateFn = (key: LocaleKey) => string;

const suggestionForCode = (
  code: WalletActionCode | undefined,
  translate: TranslateFn,
): string | null => {
  switch (code) {
    case 'PIN_ALREADY_INITIALISED':
      return translate('scanHintSwitchToSignin');
    case 'PIN_NOT_INITIALISED':
      return translate('scanHintRunInitFirst');
    case 'PIN_INVALID':
      return translate('scanHintPinInvalid');
    case 'TRANSPORT_ERROR':
      return translate('scanHintKeepCardClose');
    default:
      return null;
  }
};

export const toFriendlyMessage = (raw: string, fallback: string): string => {
  const message = String(raw ?? '').trim();
  if (!message) {
    return fallback;
  }

  const lower = message.toLowerCase();
  if (
    lower.includes('session')
    || lower.includes('payload')
    || lower.includes('selector')
    || lower.includes('nonce')
    || lower.includes('rpc')
    || lower.includes('sequence')
    || lower.includes('status word')
    || lower.includes('sw:')
    || lower.includes('eth_sendrawtransaction')
    || lower.includes('tx ')
    || /0x[a-f0-9]{10,}/i.test(message)
  ) {
    return fallback;
  }

  return message.length > 140 ? fallback : message;
};

export const resolveScanResultMessage = (
  mode: ScanMode,
  result: WalletActionResult,
  translate: TranslateFn,
): string => {
  if (result.ok) {
    return toFriendlyMessage(result.message, translate('scanStatusGenericSuccess'));
  }

  const hint = suggestionForCode(result.code, translate);
  if (hint) {
    return hint;
  }

  return toFriendlyMessage(result.message, translate('scanErrorGeneric'));
};
