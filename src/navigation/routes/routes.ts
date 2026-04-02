export const ROUTES = {
  Welcome: 'Welcome',
  LoginPin: 'LoginPin',
  ActivatePin: 'ActivatePin',
  EcdhBackup: 'EcdhBackup',
  Settings: 'Settings',
  General: 'General',
  ChangePin: 'ChangePin',
  Home: 'Home',
  QRScanner: 'QRScanner',
  ActivateSuccess: 'ActivateSuccess',
} as const;

export type RouteName = typeof ROUTES[keyof typeof ROUTES];
