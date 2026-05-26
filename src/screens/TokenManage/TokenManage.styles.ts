import { StyleSheet } from 'react-native';

import {
  MONO_FONT,
  SANS_FONT,
  SANS_FONT_SEMIBOLD,
  WALLET_COLORS,
  buildWalletScreenStyles,
  type WalletColors,
} from '@components/ui/walletDesign';

export const createTokenManageScreenBase = (colors: WalletColors) =>
  buildWalletScreenStyles(colors);

export const styles = StyleSheet.create({
  iconButton: {
    width: 34,
    height: 34,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: WALLET_COLORS.border,
    backgroundColor: WALLET_COLORS.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  manageControls: {
    gap: 12,
    marginTop: 12,
  },
  manageSearchField: {
    width: '100%',
    minHeight: 56,
    alignSelf: 'stretch',
  },
  fieldInput: {
    flex: 1,
    color: WALLET_COLORS.text,
    fontFamily: SANS_FONT,
    fontSize: 14,
    padding: 0,
  },
  chipRowCompact: {
    gap: 10,
    paddingBottom: 6,
    alignItems: 'center',
  },
  filterChip: {
    minWidth: 52,
    height: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: WALLET_COLORS.border,
    backgroundColor: WALLET_COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  filterChipOn: {
    borderColor: WALLET_COLORS.signalBorder,
    backgroundColor: WALLET_COLORS.signalSoft,
  },
  filterChipText: {
    color: WALLET_COLORS.text,
    fontFamily: SANS_FONT_SEMIBOLD,
    fontSize: 13,
  },
  filterChipTextOn: {
    color: WALLET_COLORS.text,
  },
  flowScroll: {
    paddingBottom: 24,
    gap: 14,
  },
  tokenListCard: {
    marginTop: 4,
  },
  manageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 14,
  },
  tokenInfo: {
    flex: 1,
    minWidth: 0,
    flexShrink: 1,
    gap: 4,
    alignItems: 'flex-start',
  },
  inlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  tokenSymbol: {
    color: WALLET_COLORS.text,
    fontFamily: SANS_FONT_SEMIBOLD,
    fontSize: 15,
  },
  manageChainPill: {
    minHeight: 22,
    paddingHorizontal: 8,
    backgroundColor: WALLET_COLORS.surfaceSoft,
  },
  manageChainText: {
    color: WALLET_COLORS.textMuted,
    fontFamily: MONO_FONT,
    fontSize: 10,
  },
  tokenName: {
    color: WALLET_COLORS.textSoft,
    fontFamily: SANS_FONT,
    fontSize: 12,
    textAlign: 'left',
  },
  tokenDivider: {
    height: 1,
    backgroundColor: '#203149',
    marginLeft: 66,
    marginRight: 12,
  },
});
