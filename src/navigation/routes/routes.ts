export const ROUTES = {
  NfcScan: 'NfcScan',
  Home: 'Home',
} as const;

export type RouteName = typeof ROUTES[keyof typeof ROUTES];
