import type { ScanMode } from '../../services/scanCardFlowRegistry';

import { ROUTES } from './routes';

export type RootStackParamList = {
  [ROUTES.Welcome]: undefined;
  [ROUTES.LoginPin]: undefined;
  [ROUTES.ActivatePin]: undefined;
  [ROUTES.ScanCard]: {
    flowId: string;
  };
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
    ethAddress?: string;
  };
  [ROUTES.ActivateSuccess]: {
    ethAddress: string;
    publicKeyHex?: string;
    mode: ScanMode;
  };
  [ROUTES.SendTransaction]: {
    fromAddress: string;
    availableAmount: string;
  };
  [ROUTES.WalletDetails]: {
    address: string;
    publicKeyHex?: string;
    networkName: string;
  };
  [ROUTES.WalletRelayRequest]: undefined;
  [ROUTES.SendPick]: undefined;
  [ROUTES.SendBtc]: undefined;
  [ROUTES.Receive]: undefined;
  [ROUTES.TouchSign]: undefined;
  [ROUTES.TokenManage]: undefined;
  [ROUTES.AddToken]: undefined;
};
