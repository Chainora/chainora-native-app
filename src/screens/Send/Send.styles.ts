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

export const createSendScreenBase = (colors: WalletColors) =>
  buildWalletScreenStyles(colors);

export const styles = StyleSheet.create({
  formScroll: {
    paddingVertical: 16,
    gap: 18,
  },
  networkHero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: WALLET_COLORS.border,
    backgroundColor: WALLET_COLORS.surface,
  },
  networkHeroText: {
    flex: 1,
  },
  networkHeroTitle: {
    color: WALLET_COLORS.text,
    fontFamily: DISPLAY_FONT,
    fontSize: 20,
  },
  networkHeroSub: {
    color: WALLET_COLORS.textSoft,
    fontFamily: MONO_FONT,
    fontSize: 12,
    marginTop: 4,
  },
  networkBadge: {
    minHeight: 28,
    paddingHorizontal: 10,
    backgroundColor: WALLET_COLORS.surfaceSoft,
  },
  networkBadgeText: {
    color: WALLET_COLORS.textMuted,
    fontFamily: MONO_FONT,
    fontSize: 10,
  },
  fieldGroup: {
    gap: 8,
  },
  fieldActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  fieldActionText: {
    color: WALLET_COLORS.signal,
    fontFamily: SANS_FONT_SEMIBOLD,
    fontSize: 13,
  },
  fieldInput: {
    flex: 1,
    color: WALLET_COLORS.text,
    fontFamily: SANS_FONT,
    fontSize: 14,
    padding: 0,
  },
  amountTag: {
    minHeight: 30,
    paddingHorizontal: 10,
    backgroundColor: WALLET_COLORS.surfaceSoft,
  },
  amountTagText: {
    color: WALLET_COLORS.textMuted,
    fontFamily: MONO_FONT,
    fontSize: 11,
  },
  fieldInputLarge: {
    fontFamily: DISPLAY_FONT,
    fontSize: 24,
    letterSpacing: -0.8,
  },
  approxText: {
    color: WALLET_COLORS.textSoft,
    fontFamily: SANS_FONT,
    fontSize: 12,
    marginTop: 4,
  },
  errorText: {
    color: WALLET_COLORS.danger,
    fontFamily: SANS_FONT_SEMIBOLD,
    fontSize: 12,
  },
  sheetHost: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
  },
  sheetScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(3, 6, 10, 0.82)',
  },
  sheetCard: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    borderColor: WALLET_COLORS.border,
    backgroundColor: '#11161F',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 24,
    gap: 14,
  },
  sheetGrab: {
    alignSelf: 'center',
    width: 44,
    height: 4,
    borderRadius: 999,
    backgroundColor: WALLET_COLORS.borderStrong,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  sheetIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: WALLET_COLORS.border,
    backgroundColor: WALLET_COLORS.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetTitle: {
    flex: 1,
    color: WALLET_COLORS.text,
    fontFamily: SANS_FONT_SEMIBOLD,
    fontSize: 16,
    textAlign: 'center',
  },
  sheetStep: {
    color: WALLET_COLORS.textLow,
    fontFamily: MONO_FONT,
    fontSize: 11,
  },
  reviewAmountWrap: {
    alignItems: 'center',
    gap: 4,
  },
  reviewAmount: {
    color: WALLET_COLORS.text,
    fontFamily: DISPLAY_FONT,
    fontSize: 34,
    letterSpacing: -1.2,
  },
  reviewAmountUnit: {
    color: WALLET_COLORS.textSoft,
    fontFamily: DISPLAY_FONT,
    fontSize: 18,
  },
  reviewUsd: {
    color: WALLET_COLORS.textSoft,
    fontFamily: MONO_FONT,
    fontSize: 12,
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
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: WALLET_COLORS.border,
  },
  reviewLabel: {
    color: WALLET_COLORS.textLow,
    fontFamily: MONO_FONT,
    fontSize: 10,
    textTransform: 'uppercase',
  },
  reviewValue: {
    flex: 1,
    textAlign: 'right',
    color: WALLET_COLORS.text,
    fontFamily: SANS_FONT_SEMIBOLD,
    fontSize: 12,
  },
  reviewRowLast: {
    borderBottomWidth: 0,
  },
  sheetActions: {
    gap: 10,
  },
  resultIcon: {
    alignSelf: 'center',
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 2,
    borderColor: WALLET_COLORS.success,
    backgroundColor: WALLET_COLORS.successSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultTitle: {
    color: WALLET_COLORS.text,
    fontFamily: DISPLAY_FONT,
    fontSize: 24,
    textAlign: 'center',
  },
  resultBody: {
    color: WALLET_COLORS.textSoft,
    fontFamily: SANS_FONT,
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
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
});
