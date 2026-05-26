import { StyleSheet } from 'react-native';

import {
  DISPLAY_FONT,
  MONO_FONT,
  SANS_FONT,
  WALLET_COLORS,
  buildWalletScreenStyles,
  type WalletColors,
} from '@components/ui/walletDesign';

export const createTouchSignScreenBase = (colors: WalletColors) =>
  buildWalletScreenStyles(colors);

export const styles = StyleSheet.create({
  touchBody: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 32,
  },
  scanFlag: {
    minHeight: 30,
    paddingHorizontal: 12,
    gap: 8,
    backgroundColor: WALLET_COLORS.signalSoft,
    borderColor: WALLET_COLORS.signalBorder,
  },
  scanFlagDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: WALLET_COLORS.signal,
  },
  scanFlagText: {
    color: '#8CD0FF',
    fontFamily: MONO_FONT,
    fontSize: 10,
    textTransform: 'uppercase',
  },
  touchStage: {
    width: 260,
    height: 260,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 32,
    marginBottom: 26,
  },
  touchRingOne: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    borderWidth: 1,
    borderColor: 'rgba(79, 180, 255, 0.12)',
  },
  touchRingTwo: {
    position: 'absolute',
    width: 170,
    height: 170,
    borderRadius: 85,
    borderWidth: 1,
    borderColor: 'rgba(79, 180, 255, 0.2)',
  },
  touchRingThree: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 1,
    borderColor: 'rgba(79, 180, 255, 0.32)',
  },
  touchCore: {
    width: 92,
    height: 92,
    borderRadius: 46,
    borderWidth: 1,
    borderColor: WALLET_COLORS.signalBorder,
    backgroundColor: WALLET_COLORS.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  touchTitle: {
    color: WALLET_COLORS.text,
    fontFamily: DISPLAY_FONT,
    fontSize: 26,
    lineHeight: 30,
    textAlign: 'center',
    letterSpacing: -0.8,
  },
  touchBodyText: {
    color: WALLET_COLORS.textMuted,
    fontFamily: SANS_FONT,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: 12,
    paddingHorizontal: 18,
  },
  resultCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: WALLET_COLORS.border,
    backgroundColor: WALLET_COLORS.surface,
    padding: 14,
    gap: 8,
  },
  resultLabel: {
    color: WALLET_COLORS.textLow,
    fontFamily: MONO_FONT,
    fontSize: 10,
    textTransform: 'uppercase',
  },
  resultHash: {
    color: WALLET_COLORS.text,
    fontFamily: MONO_FONT,
    fontSize: 12,
    lineHeight: 18,
  },
  resultMeta: {
    color: WALLET_COLORS.textSoft,
    fontFamily: SANS_FONT,
    fontSize: 11,
  },
  sheetActions: {
    gap: 10,
  },
});
