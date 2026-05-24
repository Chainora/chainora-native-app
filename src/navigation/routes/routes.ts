export const ROUTES = {
  Welcome: 'Welcome',
  LoginPin: 'LoginPin',
  ActivatePin: 'ActivatePin',
  ScanCard: 'ScanCard',
  EcdhBackup: 'EcdhBackup',
  Settings: 'Settings',
  General: 'General',
  ChangePin: 'ChangePin',
  Home: 'Home',
  QRScanner: 'QRScanner',
  ActivateSuccess: 'ActivateSuccess',
  SendTransaction: 'SendTransaction',
  WalletDetails: 'WalletDetails',
  WalletRelayRequest: 'WalletRelayRequest',
  SendPick: 'SendPick',
  SendBtc: 'SendBtc',
  Receive: 'Receive',
  TouchSign: 'TouchSign',
  TokenManage: 'TokenManage',
  AddToken: 'AddToken',
} as const;

export type RouteName = typeof ROUTES[keyof typeof ROUTES];
