import { StyleSheet } from 'react-native';

import {
  DISPLAY_FONT_MEDIUM,
  WALLET_COLORS,
} from '@components/ui/walletDesign';

export const ACCENT = {
  card: '#11161F',
  surface: '#171C27',
  surfaceAlt: '#1E2431',
  border: '#272E3E',
  borderStrong: '#384053',
  text: '#E8ECF3',
  textSecondary: '#B6BDCC',
  textMuted: '#7A829A',
  textLow: '#525B73',
  signalBright: '#2897FF',
} as const;

export const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: WALLET_COLORS.background,
  },
  card: {
    flex: 1,
    backgroundColor: ACCENT.card,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 20,
    gap: 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: ACCENT.borderStrong,
    backgroundColor: ACCENT.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    color: ACCENT.text,
    fontFamily: DISPLAY_FONT_MEDIUM,
    fontSize: 17,
    textAlign: 'center',
    letterSpacing: -0.2,
  },
  headerSpacer: {
    width: 30,
    height: 30,
  },
  subtitle: {
    color: ACCENT.textMuted,
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
  },
  switchBox: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(40, 151, 255, 0.28)',
    backgroundColor: 'rgba(40, 151, 255, 0.08)',
    padding: 12,
    gap: 10,
  },
  switchText: {
    color: ACCENT.signalBright,
    fontSize: 13,
    fontWeight: '600',
  },
  secondaryButton: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: ACCENT.borderStrong,
    backgroundColor: ACCENT.surfaceAlt,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    color: ACCENT.textSecondary,
    fontSize: 13,
    fontWeight: '700',
  },
  summaryScroll: {
    maxHeight: 288,
  },
  summaryScrollContent: {
    flexGrow: 1,
  },
  summaryBox: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: ACCENT.border,
    backgroundColor: ACCENT.surface,
    padding: 12,
    gap: 8,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 10,
  },
  summaryLabel: {
    color: ACCENT.textLow,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    flexShrink: 0,
    maxWidth: 86,
  },
  summaryValue: {
    flex: 1,
    textAlign: 'right',
    color: ACCENT.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 18,
  },
  summaryMessage: {
    color: ACCENT.textSecondary,
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '600',
  },
});
