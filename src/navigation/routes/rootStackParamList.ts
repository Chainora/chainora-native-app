import type { ScanMode } from '../../components/ui/ScanDialog';

import { ROUTES } from './routes';

export type RootStackParamList = {
  [ROUTES.Welcome]: undefined;
  [ROUTES.LoginPin]: undefined;
  [ROUTES.ActivatePin]: undefined;
  [ROUTES.NfcScan]:
    | {
        initialMode?: ScanMode;
        pin?: string;
      }
    | undefined;
  [ROUTES.Home]: {
    ethAddress: string;
    publicKeyHex?: string;
    mode: ScanMode;
  };
  [ROUTES.ActivateSuccess]: {
    ethAddress: string;
    publicKeyHex?: string;
    mode: ScanMode;
  };
};
