import { useMemo } from 'react';

import {
  initialisePinAndPrepareBackupDestination,
  performBackupExport,
  performBackupImport,
  signInWallet,
} from '@services/cardService';

export const useEcdhBackupActions = () =>
  useMemo(
    () => ({
      initialisePinAndPrepareBackupDestination,
      performBackupExport,
      performBackupImport,
      signInWallet,
    }),
    [],
  );
