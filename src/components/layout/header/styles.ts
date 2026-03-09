import { StyleSheet } from 'react-native';
import type { ThemeTokens } from '../../../types/theme/colors';

export const createStyles = (theme: ThemeTokens) =>
  StyleSheet.create({
    header: {
      width: '100%',
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.background,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
      paddingHorizontal: 12,
      paddingVertical: 10,
      gap: 10,
    },
    backButton: {
      width: 40,
      height: 40,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.surfaceHighlight,
      borderWidth: 1,
      borderColor: theme.border,
    },
    titleSection: {
      flex: 1,
      minWidth: 0,
    },
    title: {
      color: theme.foreground,
      fontSize: theme.typography.body,
      fontWeight: '700',
    },
    subtitle: {
      marginTop: 2,
      color: theme.foregroundMuted,
      fontSize: theme.typography.subtext,
      fontWeight: '500',
    },
    rightSlot: {
      minWidth: 40,
      alignItems: 'flex-end',
      justifyContent: 'center',
    },
  });
