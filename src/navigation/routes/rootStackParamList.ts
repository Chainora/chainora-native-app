import type { ScanMode } from '../../components/ui/ScanDialog';

import { ROUTES } from './routes';

export type RootStackParamList = {
  [ROUTES.Welcome]: undefined;
  [ROUTES.LoginPin]: undefined;
  [ROUTES.ActivatePin]: undefined;
  [ROUTES.EcdhBackup]: undefined;
  [ROUTES.Settings]: undefined;
  [ROUTES.General]: undefined;
  [ROUTES.ChangePin]: undefined;
  [ROUTES.Home]: {
    ethAddress: string;
    publicKeyHex?: string;
    mode: ScanMode;
  };
  [ROUTES.QRScanner]: {
    ethAddress: string;
  };
  [ROUTES.ActivateSuccess]: {
    ethAddress: string;
    publicKeyHex?: string;
    mode: ScanMode;
  };
};
