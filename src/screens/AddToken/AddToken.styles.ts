import { StyleSheet } from 'react-native';

import {
  SANS_FONT,
  SANS_FONT_SEMIBOLD,
  WALLET_COLORS,
  buildWalletScreenStyles,
  type WalletColors,
} from '@components/ui/walletDesign';

export const createAddTokenScreenBase = (colors: WalletColors) =>
  buildWalletScreenStyles(colors);

export const styles = StyleSheet.create({
  tabSwitch: {
    flexDirection: 'row',
    marginTop: 12,
    borderBottomWidth: 1,
    borderBottomColor: WALLET_COLORS.border,
  },
  tabSwitchItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 14,
    gap: 8,
  },
  tabSwitchText: {
    color: WALLET_COLORS.textSoft,
    fontFamily: SANS_FONT_SEMIBOLD,
    fontSize: 15,
  },
  tabSwitchTextOn: {
    color: WALLET_COLORS.text,
  },
  tabSwitchIndicator: {
    height: 3,
    width: 80,
    borderRadius: 999,
    backgroundColor: WALLET_COLORS.signal,
  },
  formScroll: {
    paddingVertical: 16,
    gap: 18,
  },
  warningCard: {
    padding: 14,
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
  warningIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: WALLET_COLORS.signalSoft,
  },
  warningIconAmber: {
    backgroundColor: WALLET_COLORS.warningSoft,
  },
  warningText: {
    flex: 1,
    color: WALLET_COLORS.textMuted,
    fontFamily: SANS_FONT,
    fontSize: 12.5,
    lineHeight: 18,
  },
  fieldGroup: {
    gap: 8,
  },
  networkPillText: {
    flex: 1,
    color: WALLET_COLORS.text,
    fontFamily: SANS_FONT_SEMIBOLD,
    fontSize: 15,
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
  fieldInput: {
    flex: 1,
    color: WALLET_COLORS.text,
    fontFamily: SANS_FONT,
    fontSize: 14,
    padding: 0,
  },
});
