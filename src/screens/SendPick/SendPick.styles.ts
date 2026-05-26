import { StyleSheet } from 'react-native';

import {
  MONO_FONT,
  SANS_FONT,
  SANS_FONT_SEMIBOLD,
  WALLET_COLORS,
  buildWalletScreenStyles,
  type WalletColors,
} from '@components/ui/walletDesign';

export const createSendPickScreenBase = (colors: WalletColors) =>
  buildWalletScreenStyles(colors);

export const styles = StyleSheet.create({
  tokenRow: {
    minHeight: 76,
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  tokenInfo: {
    flex: 1,
    minWidth: 0,
    flexShrink: 1,
    gap: 4,
    alignItems: 'flex-start',
  },
  tokenSymbol: {
    color: WALLET_COLORS.text,
    fontFamily: SANS_FONT_SEMIBOLD,
    fontSize: 15,
  },
  tokenMetaRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    gap: 6,
  },
  tokenNetworkTag: {
    color: WALLET_COLORS.textSoft,
    fontFamily: MONO_FONT,
    fontSize: 10,
    borderRadius: 6,
    backgroundColor: WALLET_COLORS.surfaceSoft,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  tokenName: {
    color: WALLET_COLORS.textSoft,
    fontFamily: SANS_FONT,
    fontSize: 12,
    textAlign: 'left',
  },
  tokenRight: {
    width: 132,
    flexShrink: 0,
    marginLeft: 'auto',
    alignItems: 'flex-end',
    gap: 4,
  },
  tokenValue: {
    color: WALLET_COLORS.text,
    fontFamily: SANS_FONT_SEMIBOLD,
    fontSize: 14,
    width: '100%',
    textAlign: 'right',
  },
  tokenBalance: {
    color: WALLET_COLORS.textSoft,
    fontFamily: MONO_FONT,
    fontSize: 12,
    width: '100%',
    textAlign: 'right',
  },
  tokenDivider: {
    height: 1,
    backgroundColor: '#203149',
    marginLeft: 66,
    marginRight: 12,
  },
  searchField: {
    marginTop: 12,
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
  sendPickFilterScroll: {
    flexGrow: 0,
    flexShrink: 0,
    maxHeight: 66,
  },
  chipRow: {
    gap: 10,
    paddingTop: 12,
    paddingBottom: 10,
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
  tokenListCard: {
    marginTop: 4,
  },
  sendPickResultsPanel: {
    flex: 1,
  },
  sendPickResultsScroll: {
    flex: 1,
    minHeight: 0,
  },
  sendPickResultsContent: {
    paddingBottom: 24,
    justifyContent: 'flex-start',
    alignItems: 'stretch',
  },
});
