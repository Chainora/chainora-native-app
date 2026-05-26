import type { ImageSourcePropType } from 'react-native';

import type { NetworkKey, WalletHomeNetworkKey } from './network';

const WALLET_HOME_NETWORK_LOGOS: Partial<Record<WalletHomeNetworkKey, ImageSourcePropType>> = {
  ethMainnet: require('../assets/tokens/ethMainnet.png'),
  bscMainnet: require('../assets/tokens/bscMainnet.png'),
  polygonMainnet: require('../assets/tokens/polygonMainnet.png'),
  arbitrumMainnet: require('../assets/tokens/arbitrumMainnet.png'),
  optimismMainnet: require('../assets/tokens/optimismMainnet.png'),
};

export const getNetworkLogoSource = (networkKey: NetworkKey): ImageSourcePropType | undefined =>
  WALLET_HOME_NETWORK_LOGOS[networkKey as WalletHomeNetworkKey];
