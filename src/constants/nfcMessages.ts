export const NfcScanCopy = {
  title: 'Chainora NFC',
  scanButton: 'Scan NFC',
  scanningLabel: 'Scanning...',
  resetButton: 'Reset Card',
  resettingLabel: 'Resetting...',
} as const;

export const NfcAlerts = {
  nfcRequired: {
    title: 'NFC Required',
    message: 'Please turn on NFC mode.',
    confirmLabel: 'OK',
    cancelLabel: 'Cancel',
  },
  resetConfirmation: {
    title: 'Reset Chainora Card',
    message:
      'This clears the wallet information from your Chainora card. You will need to initialise it again afterwards.',
    confirmLabel: 'Reset',
    cancelLabel: 'Cancel',
  },
} as const;

export const NfcToastMessages = {
  nfcSettingsFailure: 'Unable to open NFC settings',
  addressDeriveFailure: 'Unable to derive Ethereum address from the card.',
  resetFailurePrefix: 'Failed to reset card: ',
} as const;
