import React, { useCallback, useMemo } from 'react';
import { Pressable, ScrollView, StatusBar, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@react-native-vector-icons/ionicons';

import {
  useWalletColors,
} from '@components/ui/walletDesign';
import { useAuth } from '@hooks/useAuth';
import { useSettings } from '@hooks/useSettings';
import { useSettingsActions } from '@hooks/useSettingsActions';
import type { RootStackParamList } from '@navigation/routes/rootStackParamList';
import { ROUTES } from '@navigation/routes/routes';

import { createSettingsStyles } from './Settings.styles';
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
  const { session } = useAuth();
  const { settings, resolvedTheme, setTheme, t } = useSettings();
  const colors = useWalletColors();
  const styles = useMemo(() => createSettingsStyles(colors), [colors]);
  const biometricEnabled = false;
  const { handleDeleteCache, handleLogout } = useSettingsActions(navigation);

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

export default SettingsScreen;


