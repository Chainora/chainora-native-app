import { StyleSheet } from 'react-native';

import { PIN_COLORS } from '@components/ui/pinTheme';

export const AUTH_SCREEN_BACKGROUND = '#08111B';

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: AUTH_SCREEN_BACKGROUND,
  },
  safeArea: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 18,
    paddingTop: 6,
    paddingBottom: 14,
  },
  stepText: {
    color: PIN_COLORS.textSoft,
    fontSize: 10,
    letterSpacing: 1.5,
    fontWeight: '600',
  },
});
