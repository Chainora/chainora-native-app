import { StyleSheet } from 'react-native';

import {
  MONO_FONT,
  WALLET_COLORS,
  buildWalletScreenStyles,
} from '@components/ui/walletDesign';

export const screenBase = buildWalletScreenStyles();

export const styles = StyleSheet.create({
  content: {
    flex: 1,
    paddingTop: 16,
    gap: 14,
  },
  searchPanel: {
    minHeight: 50,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  searchInput: {
    flex: 1,
    color: WALLET_COLORS.text,
    fontSize: 14,
  },
  clearButton: {
    width: 24,
    height: 24,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: WALLET_COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    paddingBottom: 20,
  },
  listPanel: {
    overflow: 'hidden',
  },
  row: {
    minHeight: 58,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  rowPressed: {
    backgroundColor: WALLET_COLORS.surfaceAlt,
  },
  rowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: WALLET_COLORS.border,
  },
  rowLabel: {
    color: WALLET_COLORS.textMuted,
    fontSize: 14,
  },
  rowLabelSelected: {
    color: WALLET_COLORS.text,
    fontWeight: '600',
  },
  dotBox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: WALLET_COLORS.borderStrong,
    backgroundColor: WALLET_COLORS.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotBoxOn: {
    borderColor: WALLET_COLORS.signal,
  },
  dotBoxDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: WALLET_COLORS.signal,
  },
  emptyWrap: {
    minHeight: 120,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  emptyText: {
    color: WALLET_COLORS.textSoft,
    fontFamily: MONO_FONT,
    fontSize: 11,
    letterSpacing: 0.7,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
});
