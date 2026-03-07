import { StyleSheet } from 'react-native';
import { THEME } from '../../../types/theme/colors';

export const styles = StyleSheet.create({
  header: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: THEME.background,
    borderBottomWidth: 1,
    borderBottomColor: THEME.border,
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
    backgroundColor: THEME.surfaceHighlight,
    borderWidth: 1,
    borderColor: THEME.border,
  },
  titleSection: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    color: THEME.foreground,
    fontSize: THEME.typography.body,
    fontWeight: '700',
  },
  subtitle: {
    marginTop: 2,
    color: THEME.foregroundMuted,
    fontSize: THEME.typography.subtext,
    fontWeight: '500',
  },
  rightSlot: {
    minWidth: 40,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
});
