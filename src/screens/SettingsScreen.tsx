import React, { useCallback, useMemo } from 'react';
import { Alert, Pressable, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@react-native-vector-icons/ionicons';

import {
  DISPLAY_FONT,
  DISPLAY_FONT_MEDIUM,
  MONO_FONT,
  type WalletColors,
  useWalletColors,
} from '../components/ui/walletDesign';
import { useAuth } from '../features/auth';
import { useSettings } from '../features/settings';
import { clearRecentActivities } from '../features/wallet/recentActivityStorage';
import type { RootStackParamList } from '../navigation/routes/rootStackParamList';
import { ROUTES } from '../navigation/routes/routes';
import { clearActivitySyncState } from '../services/activitySyncService';

type Props = NativeStackScreenProps<RootStackParamList, typeof ROUTES.Settings>;
type IconName = React.ComponentProps<typeof Ionicons>['name'];

type RowItem = {
  id: string;
  title: string;
  subtitle: string;
  icon: IconName;
  onPress?: () => void;
  meta?: string;
  danger?: 'soft' | 'hard';
  toggle?: boolean;
  social?: 'x' | 'facebook' | 'youtube';
};

const truncateAddress = (value: string) => {
  if (!value || value.length < 10) {
    return value || '-';
  }
  return `${value.slice(0, 8)}...${value.slice(-6)}`;
};

const SettingsScreen: React.FC<Props> = ({ navigation }) => {
  const { session, clearSession } = useAuth();
  const { settings, resolvedTheme, setTheme, t } = useSettings();
  const colors = useWalletColors();
  const styles = useMemo(() => buildStyles(colors), [colors]);
  const biometricEnabled = false;

  const languageLabel = settings.language === 'vi' ? t('languageVietnamese') : t('languageEnglish');
  const currencyCode = settings.currency.toUpperCase();
  const isDarkTheme = resolvedTheme === 'dark';

  const handleLanguage = useCallback(() => {
    navigation.navigate(ROUTES.LanguageSettings);
  }, [navigation]);

  const handleCurrency = useCallback(() => {
    navigation.navigate(ROUTES.CurrencySettings);
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

  const handleDeleteCache = useCallback(() => {
    Alert.alert(t('settingsDeleteCacheAlertTitle'), t('settingsDeleteCacheAlertMessage'), [
      { text: t('commonCancel'), style: 'cancel' },
      {
        text: t('settingsDeleteCacheTitle'),
        style: 'destructive',
        onPress: () => {
          Promise.all([clearRecentActivities(), clearActivitySyncState()])
            .then(() => {
              Alert.alert(t('settingsDeleteCacheSuccessTitle'), t('settingsDeleteCacheSuccessMessage'));
            })
            .catch(error => {
              const message = error instanceof Error ? error.message : String(error);
              Alert.alert(t('settingsDeleteCacheFailedTitle'), message);
            });
        },
      },
    ]);
  }, [t]);

  const handleThemeToggle = useCallback(() => {
    setTheme(isDarkTheme ? 'light' : 'dark');
  }, [isDarkTheme, setTheme]);

  const optionRows = useMemo<RowItem[]>(
    () => [
      {
        id: 'theme',
        title: t('settingsThemeTitle'),
        subtitle: t('settingsThemeSubtitle'),
        icon: 'moon-outline',
        toggle: isDarkTheme,
        onPress: handleThemeToggle,
      },
      {
        id: 'biometric',
        title: t('settingsBiometricTitle'),
        subtitle: t('settingsBiometricSubtitle'),
        icon: 'finger-print-outline',
        toggle: biometricEnabled,
      },
    ],
    [biometricEnabled, handleThemeToggle, isDarkTheme, t],
  );

  const securityRows = useMemo<RowItem[]>(
    () => [
      {
        id: 'change-pin',
        title: t('settingsChangePinTitle'),
        subtitle: t('settingsChangePinSubtitle'),
        icon: 'key-outline',
        onPress: handleChangePin,
      },
      {
        id: 'backup',
        title: t('settingsBackupTitle'),
        subtitle: t('settingsBackupSubtitle'),
        icon: 'shield-checkmark-outline',
        onPress: handleBackup,
      },
    ],
    [handleBackup, handleChangePin, t],
  );

  const displayRows = useMemo<RowItem[]>(
    () => [
      {
        id: 'language',
        title: t('generalLanguage'),
        subtitle: languageLabel,
        icon: 'language-outline',
        meta: settings.language.toUpperCase(),
        onPress: handleLanguage,
      },
      {
        id: 'currency',
        title: t('settingsCurrencyPrimaryTitle'),
        subtitle: t('settingsCurrencyPrimarySubtitle'),
        icon: 'cash-outline',
        meta: currencyCode,
        onPress: handleCurrency,
      },
    ],
    [currencyCode, handleCurrency, handleLanguage, languageLabel, settings.language, t],
  );

  const socialRows = useMemo<RowItem[]>(
    () => [
      {
        id: 'social-x',
        title: t('settingsSocialXTitle'),
        subtitle: t('settingsSocialXHandle'),
        icon: 'logo-twitter',
        social: 'x',
      },
      {
        id: 'social-facebook',
        title: t('settingsSocialFacebookTitle'),
        subtitle: t('settingsSocialFacebookHandle'),
        icon: 'logo-facebook',
        social: 'facebook',
      },
      {
        id: 'social-youtube',
        title: t('settingsSocialYoutubeTitle'),
        subtitle: t('settingsSocialYoutubeHandle'),
        icon: 'logo-youtube',
        social: 'youtube',
      },
    ],
    [t],
  );

  const systemRows = useMemo<RowItem[]>(
    () => [
      {
        id: 'clear-cache',
        title: t('settingsDeleteCacheTitle'),
        subtitle: t('settingsDeleteCacheSubtitle'),
        icon: 'trash-outline',
        onPress: handleDeleteCache,
        danger: 'soft',
      },
      {
        id: 'logout',
        title: t('settingsLogoutTitle'),
        subtitle: t('settingsLogoutSubtitle'),
        icon: 'log-out-outline',
        onPress: handleLogout,
        danger: 'hard',
      },
    ],
    [handleDeleteCache, handleLogout, t],
  );

  const renderRows = (rows: RowItem[], displayOnly = false) => (
    <View style={styles.groupCard}>
      {rows.map((row, index) => {
        const hardDanger = row.danger === 'hard';
        const softDanger = row.danger === 'soft';
        const isInteractive = !displayOnly && Boolean(row.onPress);

        const content = (
          <>
            <View
              style={[
                styles.rowIcon,
                softDanger && styles.rowIconSoftDanger,
                hardDanger && styles.rowIconHardDanger,
                row.social === 'x' && styles.rowIconX,
                row.social === 'facebook' && styles.rowIconFacebook,
                row.social === 'youtube' && styles.rowIconYoutube,
              ]}
            >
              <Ionicons
                name={row.icon}
                size={18}
                color={
                  hardDanger
                    ? '#FF8A8A'
                    : softDanger
                      ? '#FFB38E'
                      : row.social === 'facebook'
                        ? '#5EA0FF'
                        : row.social === 'youtube'
                          ? '#FF6B6B'
                          : '#A7D4FF'
                }
              />
            </View>

            <View style={styles.rowTextCol}>
              <Text style={[styles.rowTitle, hardDanger && styles.rowTitleDanger]}>{row.title}</Text>
              <Text style={styles.rowSubtitle}>{row.subtitle}</Text>
            </View>

            {typeof row.toggle === 'boolean' ? (
              <View style={[styles.toggle, row.toggle && styles.toggleOn]}>
                <View style={[styles.toggleKnob, row.toggle && styles.toggleKnobOn]} />
              </View>
            ) : row.social ? (
              <View style={styles.socialCta}>
                <Text style={styles.socialCtaText}>{t('settingsSocialOpen')}</Text>
                <Ionicons name="arrow-up-outline" size={10} color={colors.textMuted} />
              </View>
            ) : row.meta ? (
              <View style={styles.metaWrap}>
                <Text style={styles.metaText}>{row.meta}</Text>
                <Ionicons name="chevron-forward" size={12} color={colors.textSoft} />
              </View>
            ) : (
              <Ionicons name="chevron-forward" size={14} color={colors.textSoft} />
            )}

            {index < rows.length - 1 ? <View style={styles.rowSeparator} /> : null}
          </>
        );

        if (isInteractive && row.onPress) {
          return (
            <Pressable
              key={row.id}
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
              onPress={row.onPress}
            >
              {content}
            </Pressable>
          );
        }

        return (
          <View key={row.id} style={styles.row}>
            {content}
          </View>
        );
      })}
    </View>
  );

  return (
    <View style={styles.root}>
      <StatusBar
        barStyle={resolvedTheme === 'light' ? 'dark-content' : 'light-content'}
        backgroundColor={colors.background}
      />

      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <View style={styles.topBar}>
          <Pressable style={styles.backButton} onPress={() => navigation.goBack()}>
            <Ionicons name="chevron-back" size={14} color={colors.textMuted} />
          </Pressable>
          <Text style={styles.topTitle}>{t('headerSettingsTitle')}</Text>
          <View style={styles.backButtonGhost} />
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          <View style={styles.profileCard}>
            <View style={styles.profileAvatar}>
              <View style={styles.profileAvatarGradient} />
              <View style={styles.profileAvatarCore} />
            </View>

            <View style={styles.profileText}>
              <Text style={styles.profileName}>{t('settingsProfilePrimaryLabel')}</Text>
              <Text style={styles.profileAddress}>{truncateAddress(session?.address ?? '')}</Text>
            </View>

            <View style={styles.profileStatus}>
              <View style={styles.profileStatusDot} />
              <Text style={styles.profileStatusText}>{t('settingsStatusOnline')}</Text>
            </View>
          </View>

          <View style={styles.groupWrap}>
            <Text style={styles.groupLabel}>{t('settingsGroupOptions')}</Text>
            {renderRows(optionRows)}
          </View>

          <View style={styles.groupWrap}>
            <Text style={styles.groupLabel}>{t('settingsGroupSecurity')}</Text>
            {renderRows(securityRows)}
          </View>

          <View style={styles.groupWrap}>
            <Text style={styles.groupLabel}>{t('settingsGroupDisplay')}</Text>
            {renderRows(displayRows)}
          </View>

          <View style={styles.groupWrap}>
            <Text style={styles.groupLabel}>{t('settingsGroupFollowChainora')}</Text>
            {renderRows(socialRows, true)}
          </View>

          <View style={styles.groupWrap}>
            <Text style={styles.groupLabel}>{t('settingsGroupSystem')}</Text>
            {renderRows(systemRows)}
          </View>

          <Text style={styles.versionText}>
            {t('settingsVersionLine')}
            {'\n'}
            <Text style={styles.versionSub}>{t('settingsVersionSubtext')}</Text>
          </Text>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
};

const buildStyles = (colors: WalletColors) => StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  safeArea: {
    flex: 1,
  },
  topBar: {
    paddingTop: 6,
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  backButton: {
    width: 32,
    height: 32,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButtonGhost: {
    width: 32,
    height: 32,
  },
  topTitle: {
    flex: 1,
    textAlign: 'center',
    fontFamily: DISPLAY_FONT_MEDIUM,
    fontSize: 16,
    color: colors.text,
    letterSpacing: -0.4,
  },
  scrollContent: {
    paddingTop: 14,
    paddingHorizontal: 14,
    paddingBottom: 50,
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(40, 151, 255, 0.3)',
    backgroundColor: colors.surfaceAlt,
    marginBottom: 18,
  },
  profileAvatar: {
    width: 44,
    height: 44,
    borderRadius: 14,
    overflow: 'hidden',
  },
  profileAvatarGradient: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#2577D8',
  },
  profileAvatarCore: {
    position: 'absolute',
    top: 6,
    left: 6,
    right: 6,
    bottom: 6,
    borderRadius: 10,
    backgroundColor: '#0D1A2E',
  },
  profileText: {
    flex: 1,
  },
  profileName: {
    color: colors.text,
    fontFamily: DISPLAY_FONT,
    fontSize: 15,
    letterSpacing: -0.2,
  },
  profileAddress: {
    marginTop: 2,
    color: colors.textMuted,
    fontFamily: MONO_FONT,
    fontSize: 11,
    letterSpacing: 0.4,
  },
  profileStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
  },
  profileStatusDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: colors.success,
  },
  profileStatusText: {
    color: '#8DE9C5',
    fontFamily: MONO_FONT,
    fontSize: 10,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  groupWrap: {
    marginBottom: 18,
  },
  groupLabel: {
    paddingHorizontal: 4,
    paddingBottom: 8,
    color: colors.textSoft,
    fontFamily: MONO_FONT,
    fontSize: 10,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
  },
  groupCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  row: {
    minHeight: 76,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  rowPressed: {
    backgroundColor: colors.surfaceAlt,
  },
  rowIcon: {
    width: 32,
    height: 32,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: 'rgba(40, 151, 255, 0.25)',
    backgroundColor: 'rgba(40, 151, 255, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowIconSoftDanger: {
    borderColor: 'rgba(255, 180, 120, 0.38)',
    backgroundColor: 'rgba(255, 180, 120, 0.12)',
  },
  rowIconHardDanger: {
    borderColor: 'rgba(239, 68, 68, 0.3)',
    backgroundColor: 'rgba(239, 68, 68, 0.14)',
  },
  rowIconX: {
    borderColor: 'rgba(255, 255, 255, 0.16)',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  rowIconFacebook: {
    borderColor: 'rgba(24, 119, 242, 0.32)',
    backgroundColor: 'rgba(24, 119, 242, 0.14)',
  },
  rowIconYoutube: {
    borderColor: 'rgba(239, 68, 68, 0.32)',
    backgroundColor: 'rgba(239, 68, 68, 0.14)',
  },
  rowTextCol: {
    flex: 1,
    minWidth: 0,
  },
  rowTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: -0.1,
  },
  rowTitleDanger: {
    color: '#FF8A8A',
  },
  rowSubtitle: {
    marginTop: 2,
    color: colors.textSoft,
    fontSize: 11,
    letterSpacing: -0.05,
  },
  rowSeparator: {
    position: 'absolute',
    left: 54,
    right: 14,
    bottom: 0,
    height: 1,
    backgroundColor: colors.border,
  },
  toggle: {
    width: 40,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#223044',
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  toggleOn: {
    backgroundColor: colors.signal,
  },
  toggleKnob: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#FFFFFF',
  },
  toggleKnobOn: {
    alignSelf: 'flex-end',
  },
  metaWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  metaText: {
    color: colors.textMuted,
    fontFamily: MONO_FONT,
    fontSize: 11,
    letterSpacing: 0.4,
  },
  socialCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
  },
  socialCtaText: {
    color: colors.textMuted,
    fontFamily: MONO_FONT,
    fontSize: 10,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  versionText: {
    marginTop: 2,
    paddingTop: 2,
    textAlign: 'center',
    color: colors.textSoft,
    fontSize: 11,
    lineHeight: 18,
  },
  versionSub: {
    color: colors.textMuted,
    fontFamily: MONO_FONT,
    fontSize: 10,
    letterSpacing: 0.6,
  },
});

export default SettingsScreen;


