import { DEVICE_NOT_VERIFIED_MESSAGE } from './constants';

export const mapCreatePoolRevertMessage = (raw: string): string => {
  const message = raw.trim();
  if (!message) {
    return 'Create pool pre-check failed.';
  }

  const lower = message.toLowerCase();
  if (lower.includes('unauthorized')) {
    return DEVICE_NOT_VERIFIED_MESSAGE;
  }

  if (lower.includes('invalidconfig') || lower.includes('invalid config')) {
    return 'Create pool blocked: config is invalid on-chain. Check contribution amount, member count, and period window rules.';
  }

  if (lower.includes('insufficientreputation') || lower.includes('insufficient reputation')) {
    return 'Create pool blocked: wallet reputation is too low for selected minReputation. Required rule is currentScore >= minReputation.';
  }

  return `Create pool pre-check failed: ${message}`;
};

export const isDeviceNotVerifiedError = (message: string | null): boolean => {
  if (!message) {
    return false;
  }

  return message.toLowerCase().includes('not device-verified');
};
