import { StyleSheet } from 'react-native';

import { PIN_COLORS } from '@components/ui/pinTheme';

export const PIN_SCREEN_BACKGROUND = PIN_COLORS.background;

export const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: PIN_COLORS.background,
  },
  safeArea: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 18,
    paddingTop: 6,
    paddingBottom: 18,
  },
});
