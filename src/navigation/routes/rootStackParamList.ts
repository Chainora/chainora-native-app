import type { ScanMode } from '../../components/ui/ScanDialog';

import { ROUTES } from './routes';

export type RootStackParamList = {
  [ROUTES.NfcScan]: undefined;
  [ROUTES.Home]: {
    ethAddress: string;
    publicKeyHex?: string;
    mode: ScanMode;
  };
};
