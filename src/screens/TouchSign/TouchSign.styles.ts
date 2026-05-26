import { StyleSheet } from 'react-native';

import {
  DISPLAY_FONT,
  MONO_FONT,
  SANS_FONT,
  SANS_FONT_SEMIBOLD,
  WALLET_COLORS,
  buildWalletScreenStyles,
  type WalletColors,
} from '@components/ui/walletDesign';

export const createTouchSignScreenBase = (colors: WalletColors) =>
  buildWalletScreenStyles(colors);

export const styles = StyleSheet.create({
  touchBody: {
    flex: 1,
  },
  reviewScroll: {
    flex: 1,
  },
  reviewScrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingVertical: 18,
    gap: 18,
  },
  amountHeader: {
    alignItems: 'center',
    gap: 8,
  },
  amountLabel: {
    color: WALLET_COLORS.textLow,
    fontFamily: MONO_FONT,
    fontSize: 10,
    textTransform: 'uppercase',
  },
  amountValue: {
    color: WALLET_COLORS.text,
    fontFamily: DISPLAY_FONT,
    fontSize: 34,
    lineHeight: 40,
    textAlign: 'center',
  },
  amountUnit: {
    color: WALLET_COLORS.textSoft,
    fontFamily: DISPLAY_FONT,
    fontSize: 18,
  },
  touchBodyText: {
    color: WALLET_COLORS.textMuted,
    fontFamily: SANS_FONT,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    paddingHorizontal: 10,
  },
  failureText: {
    color: WALLET_COLORS.danger,
    fontFamily: SANS_FONT_SEMIBOLD,
  },
  reviewCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: WALLET_COLORS.border,
    backgroundColor: WALLET_COLORS.surface,
    overflow: 'hidden',
  },
  reviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: WALLET_COLORS.border,
  },
  reviewRowLast: {
    borderBottomWidth: 0,
  },
  reviewLabel: {
    color: WALLET_COLORS.textLow,
    fontFamily: MONO_FONT,
    fontSize: 10,
    textTransform: 'uppercase',
  },
  reviewValue: {
    flex: 1,
    color: WALLET_COLORS.text,
    fontFamily: SANS_FONT_SEMIBOLD,
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'right',
  },
  reviewValueEmphasis: {
    color: WALLET_COLORS.text,
    fontFamily: DISPLAY_FONT,
    fontSize: 13,
  },
  sheetActions: {
    gap: 12,
    paddingTop: 8,
  },
});
