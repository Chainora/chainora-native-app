export const ROUTES = {
  Welcome: 'Welcome',
  LoginPin: 'LoginPin',
  ActivatePin: 'ActivatePin',
  NfcScan: 'NfcScan',
  Home: 'Home',
  ActivateSuccess: 'ActivateSuccess',
} as const;

export type RouteName = typeof ROUTES[keyof typeof ROUTES];
