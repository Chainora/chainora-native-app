import type { ScanMode } from '@services/scanCardFlowRegistry';
import type { WalletHomeNetworkKey } from '@config/network';

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
  [ROUTES.LanguageSettings]: undefined;
  [ROUTES.CurrencySettings]: undefined;
  [ROUTES.ChangePin]: undefined;
  [ROUTES.Home]: {
    ethAddress: string;
    publicKeyHex?: string;
    mode: ScanMode;
  };
  [ROUTES.QRScanner]: {
    walletAddress?: string;
    publicKeyHex?: string;
    fallbackChainKey?: WalletHomeNetworkKey;
  };
  [ROUTES.ActivateSuccess]: {
    ethAddress: string;
    publicKeyHex?: string;
    mode: ScanMode;
  };
  [ROUTES.WalletDetails]: {
    address: string;
    publicKeyHex?: string;
    networkName: string;
    networkKey?: WalletHomeNetworkKey;
  };
  [ROUTES.WalletRelayRequest]: undefined;
  [ROUTES.SendPick]: {
    walletAddress: string;
    publicKeyHex?: string;
  };
  [ROUTES.Send]: {
    walletAddress: string;
    publicKeyHex?: string;
    chainKey: WalletHomeNetworkKey;
    initialRecipient?: string;
    result?: {
      transactionHash: string;
      amount: string;
      gasLimit: string;
      gasPriceGwei: string;
    };
  };
  [ROUTES.Receive]: {
    walletAddress: string;
    chainKey?: WalletHomeNetworkKey;
  };
  [ROUTES.TouchSign]: {
    walletAddress: string;
    publicKeyHex?: string;
    chainKey: WalletHomeNetworkKey;
    recipient: string;
    amount: string;
    pin: string;
    gasPriceGwei?: string;
    gasLimit?: string;
  };
  [ROUTES.TokenManage]: {
    walletAddress?: string;
  };
  [ROUTES.AddToken]: undefined;
};
