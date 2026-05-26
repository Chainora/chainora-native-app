import { StyleSheet } from 'react-native';

import {
  MONO_FONT,
  WALLET_COLORS,
  buildWalletScreenStyles,
} from '@components/ui/walletDesign';

export const screenBase = buildWalletScreenStyles();

export const styles = StyleSheet.create({
  scrollContent: {
    paddingTop: 16,
    paddingBottom: 24,
    gap: 18,
  },
  groupWrap: {
    gap: 8,
  },
  groupCard: {
    padding: 14,
  },
  optionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  optionChip: {
    minHeight: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: WALLET_COLORS.border,
    backgroundColor: WALLET_COLORS.surfaceAlt,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  optionChipOn: {
    borderColor: WALLET_COLORS.signalBorder,
    backgroundColor: WALLET_COLORS.signalSoft,
  },
  optionChipText: {
    color: WALLET_COLORS.textMuted,
    fontSize: 13,
    fontWeight: '700',
  },
  optionChipTextOn: {
    color: WALLET_COLORS.text,
  },
  helperCard: {
    padding: 14,
  },
  helperText: {
    color: WALLET_COLORS.textSoft,
    fontFamily: MONO_FONT,
    fontSize: 11,
    lineHeight: 18,
  },
});
