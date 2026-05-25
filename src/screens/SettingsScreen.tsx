import React, { useCallback, useMemo } from 'react';
import { Alert, Pressable, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@react-native-vector-icons/ionicons';

import { getActiveNetwork } from '../config/network';
import { useAuth } from '../features/auth';
import { useSettings } from '../features/settings';
import { clearRecentActivities } from '../features/wallet/recentActivityStorage';
import type { RootStackParamList } from '../navigation/routes/rootStackParamList';
import { ROUTES } from '../navigation/routes/routes';
import { clearActivitySyncState } from '../services/activitySyncService';
import {
  DISPLAY_FONT,
  MONO_FONT,
  WALLET_COLORS,
  WalletPanel,
  WalletPill,
  WalletSectionLabel,
  WalletTopBar,
  buildWalletScreenStyles,
} from '../components/ui/walletDesign';

type Props = NativeStackScreenProps<RootStackParamList, typeof ROUTES.Settings>;
type RowMeta = {
  id: string;
  title: string;
  subtitle: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  onPress?: () => void;
  meta?: string;
  danger?: 'soft' | 'hard';
};

const screenBase = buildWalletScreenStyles();

const truncateAddress = (value: string) => {
  if (!value || value.length < 10) {
    return value || '-';
  }
  return `${value.slice(0, 8)}...${value.slice(-6)}`;
};

const SettingsScreen: React.FC<Props> = ({ navigation }) => {
  const { session, clearSession } = useAuth();
  const { settings, resolvedTheme, t } = useSettings();
  const network = getActiveNetwork();

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

  const languageLabel = settings.language === 'vi' ? t('languageVietnamese') : t('languageEnglish');
  const currencyLabel =
    settings.currency === 'usd' ? t('currencyUsd') : settings.currency === 'btc' ? t('currencyBtc') : t('currencyBnb');
  const themeLabel =
    settings.theme === 'light' ? t('themeLight') : settings.theme === 'dark' ? t('themeDark') : t('themeSystem');

  const groups = useMemo<Array<{ label: string; rows: RowMeta[] }>>(
    () => [
      {
        label: t('settingsGroupWallet'),
        rows: [
          {
            id: 'wallet-address',
            title: t('settingsWalletAddressTitle'),
            subtitle: truncateAddress(session?.address ?? ''),
            icon: 'location-outline',
            meta: t('settingsMetaPrimary'),
          },
          {
            id: 'wallet-card',
            title: t('settingsWalletCardTitle'),
            subtitle: t('settingsWalletCardSubtitle'),
            icon: 'card-outline',
            meta: t('settingsMetaActive'),
          },
          {
            id: 'wallet-network',
            title: t('settingsWalletNetworkTitle'),
            subtitle: network.name,
            icon: 'git-network-outline',
            meta: network.currencySymbol,
            onPress: handleGeneral,
          },
        ],
      },
      {
        label: t('settingsGroupSecurity'),
        rows: [
          {
            id: 'security-pin',
            title: t('settingsChangePinTitle'),
            subtitle: t('settingsChangePinSubtitle'),
            icon: 'key-outline',
            onPress: handleChangePin,
          },
          {
            id: 'security-backup',
            title: t('settingsBackupTitle'),
            subtitle: t('settingsBackupSubtitle'),
            icon: 'shield-checkmark-outline',
            onPress: handleBackup,
          },
        ],
      },
      {
        label: t('settingsGroupDisplay'),
        rows: [
          {
            id: 'display-language',
            title: t('generalLanguage'),
            subtitle: languageLabel,
            icon: 'language-outline',
            meta: settings.language.toUpperCase(),
            onPress: handleGeneral,
          },
          {
            id: 'display-currency',
            title: t('generalCurrency'),
            subtitle: currencyLabel,
            icon: 'cash-outline',
            meta: settings.currency.toUpperCase(),
            onPress: handleGeneral,
          },
          {
            id: 'display-theme',
            title: t('generalTheme'),
            subtitle: themeLabel,
            icon: 'contrast-outline',
            onPress: handleGeneral,
          },
        ],
      },
      {
        label: t('settingsGroupSystem'),
        rows: [
          {
            id: 'system-clear-cache',
            title: t('settingsDeleteCacheTitle'),
            subtitle: t('settingsDeleteCacheSubtitle'),
            icon: 'trash-outline',
            onPress: handleDeleteCache,
            danger: 'soft',
          },
          {
            id: 'system-logout',
            title: t('settingsLogoutTitle'),
            subtitle: t('settingsLogoutSubtitle'),
            icon: 'log-out-outline',
            onPress: handleLogout,
            danger: 'hard',
          },
        ],
      },
    ],
    [
      currencyLabel,
      handleBackup,
      handleChangePin,
      handleDeleteCache,
      handleGeneral,
      handleLogout,
      languageLabel,
      network.currencySymbol,
      network.name,
      session?.address,
      settings.currency,
      settings.language,
      t,
      themeLabel,
    ],
  );

  return (
    <View style={screenBase.screen}>
      <StatusBar
        barStyle={resolvedTheme === 'light' ? 'dark-content' : 'light-content'}
        backgroundColor={WALLET_COLORS.background}
      />
      <SafeAreaView style={screenBase.safeArea} edges={['top', 'bottom']}>
        <View style={screenBase.content}>
          <WalletTopBar
            title={t('headerSettingsTitle')}
            onBack={() => navigation.goBack()}
            right={
              <Pressable style={styles.iconButton}>
                <Ionicons name="ellipsis-vertical" size={14} color={WALLET_COLORS.textMuted} />
              </Pressable>
            }
          />

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
            <WalletPanel style={styles.profileCard}>
              <View style={styles.profileAvatar}>
                <View style={styles.profileAvatarGlow} />
                <View style={styles.profileAvatarDot} />
              </View>
              <View style={styles.profileText}>
                <Text style={styles.profileName}>{t('settingsMetaPrimary')}</Text>
                <Text style={styles.profileAddress}>{truncateAddress(session?.address ?? '')}</Text>
              </View>
              <WalletPill style={styles.statusPill}>
                <View style={styles.statusDot} />
                <Text style={styles.statusText}>{t('settingsStatusOnline')}</Text>
              </WalletPill>
            </WalletPanel>

            {groups.map(group => (
              <View key={group.label} style={styles.groupWrap}>
                <WalletSectionLabel label={group.label} style={styles.groupLabel} />
                <WalletPanel>
                  {group.rows.map((row, index) => {
                    const hardDanger = row.danger === 'hard';
                    const softDanger = row.danger === 'soft';
                    return (
                      <Pressable key={row.id} style={styles.row} onPress={row.onPress} disabled={!row.onPress}>
                        <View
                          style={[
                            styles.rowIconWrap,
                            softDanger && styles.rowIconSoftDanger,
                            hardDanger && styles.rowIconHardDanger,
                          ]}
                        >
                          <Ionicons
                            name={row.icon}
                            size={17}
                            color={hardDanger ? WALLET_COLORS.danger : softDanger ? '#FFB38E' : WALLET_COLORS.text}
                          />
                        </View>
                        <View style={styles.rowText}>
                          <Text style={[styles.rowTitle, hardDanger && styles.rowTitleDanger]}>{row.title}</Text>
                          <Text style={styles.rowSubtitle}>{row.subtitle}</Text>
                        </View>
                        {row.meta ? (
                          <View style={styles.metaWrap}>
                            <Text style={styles.metaText}>{row.meta}</Text>
                            <Ionicons name="chevron-forward" size={12} color={WALLET_COLORS.textSoft} />
                          </View>
                        ) : (
                          <Ionicons name="chevron-forward" size={14} color={WALLET_COLORS.textSoft} />
                        )}
                        {index < group.rows.length - 1 ? <View style={styles.rowDivider} /> : null}
                      </Pressable>
                    );
                  })}
                </WalletPanel>
              </View>
            ))}

            <Text style={styles.versionText}>
              Chainora · v1.2.4
              {'\n'}
              <Text style={styles.versionSub}>{t('settingsVersionSubtext')}</Text>
            </Text>
          </ScrollView>
        </View>
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  iconButton: {
    width: 34,
    height: 34,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: WALLET_COLORS.border,
    backgroundColor: WALLET_COLORS.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    paddingTop: 16,
    paddingBottom: 24,
    gap: 18,
  },
  profileCard: {
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  profileAvatar: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: WALLET_COLORS.surfaceSoft,
    borderWidth: 1,
    borderColor: 'rgba(79, 180, 255, 0.28)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileAvatarGlow: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: WALLET_COLORS.signal,
  },
  profileAvatarDot: {
    position: 'absolute',
    right: 8,
    bottom: 8,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: WALLET_COLORS.success,
    borderWidth: 1.5,
    borderColor: WALLET_COLORS.surface,
  },
  profileText: {
    flex: 1,
    gap: 2,
  },
  profileName: {
    color: WALLET_COLORS.text,
    fontSize: 15,
    fontWeight: '700',
    fontFamily: DISPLAY_FONT,
  },
  profileAddress: {
    color: WALLET_COLORS.textMuted,
    fontFamily: MONO_FONT,
    fontSize: 11,
  },
  statusPill: {
    minHeight: 28,
    paddingHorizontal: 10,
    gap: 6,
    borderColor: 'rgba(52, 211, 153, 0.3)',
    backgroundColor: 'rgba(52, 211, 153, 0.12)',
  },
  statusDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: WALLET_COLORS.success,
  },
  statusText: {
    color: '#8DE9C5',
    fontFamily: MONO_FONT,
    fontSize: 10,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  groupWrap: {
    gap: 8,
  },
  groupLabel: {
    paddingHorizontal: 2,
  },
  row: {
    minHeight: 76,
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  rowIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: WALLET_COLORS.border,
    backgroundColor: WALLET_COLORS.surfaceSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowIconSoftDanger: {
    borderColor: 'rgba(255, 180, 120, 0.38)',
    backgroundColor: 'rgba(255, 180, 120, 0.12)',
  },
  rowIconHardDanger: {
    borderColor: 'rgba(255, 122, 122, 0.42)',
    backgroundColor: WALLET_COLORS.dangerSoft,
  },
  rowText: {
    flex: 1,
    gap: 3,
  },
  rowTitle: {
    color: WALLET_COLORS.text,
    fontSize: 14,
    fontWeight: '700',
  },
  rowTitleDanger: {
    color: '#FFB4B4',
  },
  rowSubtitle: {
    color: WALLET_COLORS.textSoft,
    fontSize: 12,
    lineHeight: 16,
  },
  metaWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  metaText: {
    color: WALLET_COLORS.textMuted,
    fontFamily: MONO_FONT,
    fontSize: 11,
  },
  rowDivider: {
    position: 'absolute',
    left: 58,
    right: 12,
    bottom: 0,
    height: 1,
    backgroundColor: '#203149',
  },
  versionText: {
    color: WALLET_COLORS.textSoft,
    fontSize: 11,
    lineHeight: 17,
    textAlign: 'center',
    marginTop: 2,
  },
  versionSub: {
    color: WALLET_COLORS.textMuted,
    fontFamily: MONO_FONT,
    fontSize: 10,
  },
});

export default SettingsScreen;
