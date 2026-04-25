import React, { useCallback, useMemo } from 'react';
import { Alert, Pressable, StatusBar, StyleSheet, Text, View, ScrollView } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@react-native-vector-icons/ionicons';

import { getActiveNetwork } from '../config/network';
import { useAuth } from '../features/auth';
import { useSettings } from '../features/settings';
import { clearRecentActivities } from '../features/wallet/recentActivityStorage';
import { ROUTES } from '../navigation/routes/routes';
import type { RootStackParamList } from '../navigation/routes/rootStackParamList';
import { clearActivitySyncState } from '../services/activitySyncService';

type Props = NativeStackScreenProps<RootStackParamList, typeof ROUTES.Settings>;
type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

type RowMeta = {
  id: string;
  title: string;
  subtitle: string;
  icon: IoniconName;
  onPress?: () => void;
  meta?: string;
  danger?: 'soft' | 'hard';
};

const truncateAddress = (value: string) => {
  if (!value || value.length < 10) {
    return value || '—';
  }
  return `${value.slice(0, 8)}…${value.slice(-6)}`;
};

export const SettingsScreen: React.FC<Props> = ({ navigation }) => {
  const { session, clearSession } = useAuth();
  const { settings, resolvedTheme, t } = useSettings();
  const styles = useMemo(() => createStyles(), []);
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
  const currencyLabel = settings.currency === 'usd' ? t('currencyUsd') : settings.currency === 'btc' ? t('currencyBtc') : t('currencyBnb');
  const themeLabel = settings.theme === 'light' ? t('themeLight') : settings.theme === 'dark' ? t('themeDark') : t('themeSystem');

  const groups = useMemo<Array<{ label: string; rows: RowMeta[] }>>(() => {
    const walletAddress = session?.address ?? '';
    return [
      {
        label: t('settingsGroupWallet'),
        rows: [
          {
            id: 'wallet-address',
            title: t('settingsWalletAddressTitle'),
            subtitle: truncateAddress(walletAddress),
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
            danger: 'soft',
            onPress: handleDeleteCache,
          },
          {
            id: 'system-logout',
            title: t('settingsLogoutTitle'),
            subtitle: t('settingsLogoutSubtitle'),
            icon: 'log-out-outline',
            danger: 'hard',
            onPress: handleLogout,
          },
        ],
      },
    ];
  }, [
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
  ]);

  const activeAddress = truncateAddress(session?.address ?? '');

  return (
    <View style={styles.container}>
      <StatusBar
        barStyle={resolvedTheme === 'light' ? 'dark-content' : 'light-content'}
        backgroundColor="#05070D"
      />
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <View style={styles.topBar}>
          <Pressable style={styles.iconButton} onPress={() => navigation.goBack()}>
            <Ionicons name="chevron-back" size={16} color="#AAB8CF" />
          </Pressable>
          <View style={styles.iconButton}>
            <Ionicons name="ellipsis-vertical" size={14} color="#AAB8CF" />
          </View>
          <View pointerEvents="none" style={styles.topTitleWrap}>
            <Text style={styles.topTitle}>{t('headerSettingsTitle')}</Text>
          </View>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.profileCard}>
            <View style={styles.profileAvatarWrap}>
              <View style={styles.profileAvatarAura} />
              <View style={styles.profileAvatarDot} />
            </View>
            <View style={styles.profileText}>
              <Text style={styles.profileName}>{t('settingsMetaPrimary')}</Text>
              <Text style={styles.profileAddress}>{activeAddress}</Text>
            </View>
            <View style={styles.statusChip}>
              <View style={styles.statusDot} />
              <Text style={styles.statusText}>{t('settingsStatusOnline')}</Text>
            </View>
          </View>

          {groups.map(group => (
            <View key={group.label} style={styles.groupWrap}>
              <Text style={styles.groupLabel}>{group.label}</Text>
              <View style={styles.groupCard}>
                {group.rows.map((row, index) => {
                  const isHardDanger = row.danger === 'hard';
                  const isSoftDanger = row.danger === 'soft';
                  return (
                    <Pressable
                      key={row.id}
                      style={styles.row}
                      onPress={row.onPress}
                      disabled={!row.onPress}
                    >
                      <View
                        style={[
                          styles.rowIconWrap,
                          isSoftDanger && styles.rowIconSoftDanger,
                          isHardDanger && styles.rowIconHardDanger,
                        ]}
                      >
                        <Ionicons
                          name={row.icon}
                          size={17}
                          color={isHardDanger ? '#FF7A7A' : isSoftDanger ? '#FFB4A8' : '#C9D5E8'}
                        />
                      </View>

                      <View style={styles.rowText}>
                        <Text style={[styles.rowTitle, isHardDanger && styles.rowTitleDanger]}>{row.title}</Text>
                        <Text style={styles.rowSubtitle}>{row.subtitle}</Text>
                      </View>

                      {row.meta ? (
                        <View style={styles.metaWrap}>
                          <Text style={styles.metaText}>{row.meta}</Text>
                          <Ionicons name="chevron-forward" size={12} color="#7688A5" />
                        </View>
                      ) : (
                        <Ionicons name="chevron-forward" size={14} color="#7688A5" />
                      )}

                      {index < group.rows.length - 1 ? <View style={styles.rowSeparator} /> : null}
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ))}

          <Text style={styles.versionText}>
            Chainora · v1.2.4
            {'\n'}
            <Text style={styles.versionSubText}>{t('settingsVersionSubtext')}</Text>
          </Text>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
};

const createStyles = () =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: '#05070D',
    },
    safeArea: {
      flex: 1,
    },
    topBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingTop: 6,
      position: 'relative',
      zIndex: 20,
    },
    iconButton: {
      width: 34,
      height: 34,
      borderRadius: 10,
      backgroundColor: '#121A28',
      borderWidth: 1,
      borderColor: '#233145',
      alignItems: 'center',
      justifyContent: 'center',
    },
    topTitleWrap: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 8,
      alignItems: 'center',
    },
    topTitle: {
      textAlign: 'center',
      color: '#EAF0FB',
      fontSize: 18,
      fontWeight: '700',
      letterSpacing: -0.3,
    },
    scroll: {
      flex: 1,
    },
    scrollContent: {
      paddingHorizontal: 16,
      paddingTop: 14,
      paddingBottom: 22,
      gap: 16,
    },
    profileCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: '#101827',
      borderRadius: 18,
      borderWidth: 1,
      borderColor: '#243248',
      padding: 14,
    },
    profileAvatarWrap: {
      width: 46,
      height: 46,
      borderRadius: 14,
      backgroundColor: '#17253B',
      borderWidth: 1,
      borderColor: '#2B4263',
      alignItems: 'center',
      justifyContent: 'center',
    },
    profileAvatarAura: {
      width: 20,
      height: 20,
      borderRadius: 10,
      backgroundColor: '#2897FF',
    },
    profileAvatarDot: {
      position: 'absolute',
      right: 8,
      bottom: 8,
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: '#34D399',
      borderWidth: 1.5,
      borderColor: '#101827',
    },
    profileText: {
      flex: 1,
      gap: 2,
    },
    profileName: {
      color: '#EAF0FB',
      fontSize: 15,
      fontWeight: '700',
      letterSpacing: -0.2,
    },
    profileAddress: {
      color: '#93A2BC',
      fontSize: 12,
      letterSpacing: 0.2,
    },
    statusChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: 'rgba(52, 211, 153, 0.35)',
      backgroundColor: 'rgba(52, 211, 153, 0.12)',
      paddingHorizontal: 8,
      paddingVertical: 5,
    },
    statusDot: {
      width: 5,
      height: 5,
      borderRadius: 2.5,
      backgroundColor: '#34D399',
    },
    statusText: {
      color: '#8DE9C5',
      fontSize: 10,
      fontWeight: '700',
      letterSpacing: 0.5,
      textTransform: 'uppercase',
    },
    groupWrap: {
      gap: 8,
    },
    groupLabel: {
      color: '#7D8FAE',
      fontSize: 11,
      letterSpacing: 1.4,
      textTransform: 'uppercase',
      paddingHorizontal: 2,
      fontWeight: '600',
    },
    groupCard: {
      borderRadius: 18,
      borderWidth: 1,
      borderColor: '#243248',
      backgroundColor: '#101827',
      overflow: 'hidden',
    },
    row: {
      minHeight: 76,
      paddingHorizontal: 12,
      paddingVertical: 12,
      flexDirection: 'row',
      alignItems: 'center',
      position: 'relative',
      gap: 10,
    },
    rowIconWrap: {
      width: 36,
      height: 36,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: '#2F3F5A',
      backgroundColor: '#162137',
      alignItems: 'center',
      justifyContent: 'center',
    },
    rowIconSoftDanger: {
      borderColor: 'rgba(255, 180, 168, 0.48)',
      backgroundColor: 'rgba(255, 161, 145, 0.12)',
    },
    rowIconHardDanger: {
      borderColor: 'rgba(255, 122, 122, 0.5)',
      backgroundColor: 'rgba(255, 122, 122, 0.12)',
    },
    rowText: {
      flex: 1,
      gap: 2,
    },
    rowTitle: {
      color: '#EAF0FB',
      fontSize: 14,
      fontWeight: '700',
      letterSpacing: -0.2,
    },
    rowTitleDanger: {
      color: '#FFB4B4',
    },
    rowSubtitle: {
      color: '#8EA0BC',
      fontSize: 12,
      lineHeight: 16,
      letterSpacing: -0.1,
    },
    metaWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
    },
    metaText: {
      color: '#90A7CA',
      fontSize: 11,
      fontWeight: '600',
      letterSpacing: 0.4,
    },
    rowSeparator: {
      position: 'absolute',
      left: 58,
      right: 0,
      bottom: 0,
      height: 1,
      backgroundColor: '#203149',
    },
    versionText: {
      marginTop: 2,
      color: '#7486A6',
      fontSize: 11,
      textAlign: 'center',
      lineHeight: 16,
    },
    versionSubText: {
      color: '#8EA2C3',
      letterSpacing: 1.1,
      fontSize: 10,
    },
  });

export default SettingsScreen;
