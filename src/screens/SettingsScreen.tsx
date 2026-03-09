import React, { useCallback, useMemo } from 'react';
import { Alert, Pressable, StatusBar, StyleSheet, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@react-native-vector-icons/ionicons';

import { useAuth } from '../features/auth';
import { useSettings } from '../features/settings';
import { ROUTES } from '../navigation/routes/routes';
import type { RootStackParamList } from '../navigation/routes/rootStackParamList';
import type { ThemeTokens } from '../types/theme/colors';

type Props = NativeStackScreenProps<RootStackParamList, typeof ROUTES.Settings>;

export const SettingsScreen: React.FC<Props> = ({ navigation }) => {
  const { clearSession } = useAuth();
  const { resolvedTheme, t, themeTokens } = useSettings();
  const styles = useMemo(() => createStyles(themeTokens), [themeTokens]);

  const handleGeneral = useCallback(() => {
    navigation.navigate(ROUTES.General);
  }, [navigation]);

  const handleChangePin = useCallback(() => {
    navigation.navigate(ROUTES.ChangePin);
  }, [navigation]);

  const handleBackup = useCallback(() => {
    navigation.navigate(ROUTES.EcdhBackup);
  }, [navigation]);

  const handleLogout = useCallback(() => {
    Alert.alert(t('settingsLogoutAlertTitle'), t('settingsLogoutAlertMessage'), [
      { text: t('commonCancel'), style: 'cancel' },
      {
        text: t('settingsLogoutTitle'),
        style: 'destructive',
        onPress: () => {
          clearSession()
            .then(() => {
              navigation.reset({
                index: 0,
                routes: [{ name: ROUTES.Welcome }],
              });
            })
            .catch(error => {
              const message = error instanceof Error ? error.message : String(error);
              Alert.alert(t('settingsLogoutFailedTitle'), message);
            });
        },
      },
    ]);
  }, [clearSession, navigation, t]);

  return (
    <View style={styles.container}>
      <StatusBar
        barStyle={resolvedTheme === 'light' ? 'dark-content' : 'light-content'}
        backgroundColor={themeTokens.background}
      />
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <View style={styles.content}>
          <Pressable style={styles.optionCard} onPress={handleGeneral}>
            <View style={styles.iconWrapper}>
              <Ionicons name="options-outline" size={20} color={themeTokens.primary} />
            </View>
            <View style={styles.optionTextCol}>
              <Text style={styles.optionTitle}>{t('settingsGeneralTitle')}</Text>
              <Text style={styles.optionSubtitle}>{t('settingsGeneralSubtitle')}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={themeTokens.foregroundMuted} />
          </Pressable>

          <Pressable style={styles.optionCard} onPress={handleChangePin}>
            <View style={styles.iconWrapper}>
              <Ionicons name="key-outline" size={20} color={themeTokens.primary} />
            </View>
            <View style={styles.optionTextCol}>
              <Text style={styles.optionTitle}>{t('settingsChangePinTitle')}</Text>
              <Text style={styles.optionSubtitle}>{t('settingsChangePinSubtitle')}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={themeTokens.foregroundMuted} />
          </Pressable>

          <Pressable style={styles.optionCard} onPress={handleBackup}>
            <View style={styles.iconWrapper}>
              <Ionicons name="sync-outline" size={20} color={themeTokens.primary} />
            </View>
            <View style={styles.optionTextCol}>
              <Text style={styles.optionTitle}>{t('settingsBackupTitle')}</Text>
              <Text style={styles.optionSubtitle}>{t('settingsBackupSubtitle')}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={themeTokens.foregroundMuted} />
          </Pressable>

          <Pressable style={styles.optionCard} onPress={handleLogout}>
            <View style={styles.iconWrapper}>
              <Ionicons name="log-out-outline" size={20} color={themeTokens.primary} />
            </View>
            <View style={styles.optionTextCol}>
              <Text style={styles.optionTitle}>{t('settingsLogoutTitle')}</Text>
              <Text style={styles.optionSubtitle}>{t('settingsLogoutSubtitle')}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={themeTokens.foregroundMuted} />
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
};

const createStyles = (theme: ThemeTokens) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.background,
    },
    safeArea: {
      flex: 1,
    },
    content: {
      flex: 1,
      paddingHorizontal: 16,
      paddingTop: 16,
      gap: 12,
    },
    optionCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: theme.surfaceHighlight,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 14,
    },
    iconWrapper: {
      width: 44,
      height: 44,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.primaryLight,
      backgroundColor: theme.glow,
      alignItems: 'center',
      justifyContent: 'center',
    },
    optionTextCol: {
      flex: 1,
    },
    optionTitle: {
      color: theme.foreground,
      fontSize: theme.typography.subtitle,
      fontWeight: '700',
    },
    optionSubtitle: {
      color: theme.foregroundMuted,
      fontSize: theme.typography.subtext,
      marginTop: 2,
    },
  });

export default SettingsScreen;
