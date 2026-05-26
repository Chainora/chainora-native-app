import React from 'react';
import { Image, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';

import { DISPLAY_FONT } from '@components/ui/walletDesign';
import type { NetworkConfig } from '@config/network';
import { getNetworkLogoSource } from '@config/networkLogos';

type WalletNetworkCoinProps = {
  network: NetworkConfig;
  size?: number;
  style?: StyleProp<ViewStyle>;
};

const WalletNetworkCoin: React.FC<WalletNetworkCoinProps> = ({ network, size = 42, style }) => {
  const logoSource = getNetworkLogoSource(network.key);

  return (
    <View
      style={[
        styles.coin,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: network.iconBackground,
          borderColor: network.iconBorder,
        },
        style,
      ]}
    >
      {logoSource ? (
        <Image
          source={logoSource}
          style={[styles.coinLogo, { width: size * 0.62, height: size * 0.62 }]}
          resizeMode="contain"
        />
      ) : (
        <Text style={[styles.coinText, { fontSize: size * 0.34 }]}>{network.glyph}</Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  coin: {
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coinLogo: {
    borderRadius: 999,
  },
  coinText: {
    color: '#FFFFFF',
    fontFamily: DISPLAY_FONT,
  },
});

export default WalletNetworkCoin;
