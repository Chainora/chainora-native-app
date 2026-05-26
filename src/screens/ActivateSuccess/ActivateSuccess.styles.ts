import { StyleSheet } from 'react-native';

import {
  DISPLAY_FONT,
  WALLET_COLORS,
  buildWalletScreenStyles,
} from '@components/ui/walletDesign';

export const screenBase = buildWalletScreenStyles();

export const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 28,
    paddingBottom: 24,
    gap: 18,
  },
  successBadgeWrap: {
    alignItems: 'center',
  },
  successBadgeRing: {
    width: 118,
    height: 118,
    borderRadius: 59,
    borderWidth: 1,
    borderColor: 'rgba(52, 211, 153, 0.28)',
    backgroundColor: 'rgba(52, 211, 153, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  successBadgeCore: {
    width: 78,
    height: 78,
    borderRadius: 39,
    borderWidth: 1,
    borderColor: 'rgba(52, 211, 153, 0.38)',
    backgroundColor: 'rgba(52, 211, 153, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    color: WALLET_COLORS.text,
    fontSize: 32,
    lineHeight: 36,
    fontWeight: '800',
    fontFamily: DISPLAY_FONT,
    textAlign: 'center',
    letterSpacing: -0.8,
  },
  subtitle: {
    color: WALLET_COLORS.textMuted,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  heroCard: {
    marginTop: 8,
  },
  addressCard: {
    padding: 16,
    gap: 10,
  },
  addressLabel: {
    color: WALLET_COLORS.textSoft,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  addressValue: {
    color: WALLET_COLORS.text,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
  },
  copyButton: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: WALLET_COLORS.border,
    backgroundColor: WALLET_COLORS.surfaceSoft,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  copyButtonText: {
    color: WALLET_COLORS.text,
    fontSize: 12,
    fontWeight: '700',
  },
  noteCard: {
    padding: 16,
  },
  noteText: {
    color: WALLET_COLORS.textMuted,
    fontSize: 12,
    lineHeight: 20,
    textAlign: 'center',
  },
  actions: {
    marginTop: 6,
  },
});
