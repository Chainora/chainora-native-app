import { StyleSheet } from 'react-native';

import {
  DISPLAY_FONT,
  SANS_FONT,
  WALLET_COLORS,
  buildWalletScreenStyles,
} from '@components/ui/walletDesign';

export const screenBase = buildWalletScreenStyles();

export const styles = StyleSheet.create({
  scrollContent: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingTop: 64,
    paddingBottom: 32,
    gap: 14,
  },
  title: {
    color: WALLET_COLORS.text,
    fontSize: 32,
    lineHeight: 36,
    fontWeight: '800',
    fontFamily: DISPLAY_FONT,
    textAlign: 'center',
  },
  subtitle: {
    color: WALLET_COLORS.textMuted,
    fontSize: 15,
    lineHeight: 22,
    fontFamily: SANS_FONT,
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  actions: {
    alignSelf: 'stretch',
    marginTop: 14,
  },
});
