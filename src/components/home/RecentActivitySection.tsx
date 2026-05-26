import React, { useCallback, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@react-native-vector-icons/ionicons';

import { AppButton } from '../AppButton';
import { useSettings } from '@hooks/useSettings';
import type { RecentActivity } from '@app-types/wallet';
import type { ThemeTokens } from '@app-types/theme/colors';

type RecentActivitySectionProps = {
  activities: RecentActivity[];
};

const truncateAddress = (address: string) =>
  `${address.slice(0, 6)}...${address.slice(-4)}`;

const formatAmount = (item: RecentActivity) => {
  const sign = item.kind === 'send' ? '-' : '+';
  return `${sign}${item.amountDisplay} ${item.currencySymbol}`;
};

export const RecentActivitySection: React.FC<RecentActivitySectionProps> = ({ activities }) => {
  const { settings, t, themeTokens } = useSettings();
  const [selectedActivity, setSelectedActivity] = useState<RecentActivity | null>(null);

  const styles = useMemo(() => createStyles(themeTokens), [themeTokens]);

  const formatActivityDay = useCallback((isoDate: string) => {
    const locale = settings.language === 'vi' ? 'vi-VN' : 'en-US';
    return new Date(isoDate).toLocaleDateString(locale, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }, [settings.language]);

  const dayKey = (isoDate: string) => {
    const date = new Date(isoDate);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  };

  const dayLabel = useCallback((isoDate: string) => {
    const today = new Date();
    const target = new Date(isoDate);
    const startToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    const startTarget = new Date(target.getFullYear(), target.getMonth(), target.getDate()).getTime();
    const diffDays = Math.floor((startToday - startTarget) / (24 * 60 * 60 * 1000));

    if (diffDays === 0) {
      return t('homeActivityToday');
    }

    if (diffDays === 1) {
      return t('homeActivityYesterday');
    }

    return formatActivityDay(isoDate);
  }, [formatActivityDay, t]);

  const groupedActivities = useMemo(() => {
    const map = new Map<string, { label: string; items: RecentActivity[] }>();
    activities.forEach(activity => {
      const key = dayKey(activity.createdAt);
      if (!map.has(key)) {
        map.set(key, { label: dayLabel(activity.createdAt), items: [] });
      }
      map.get(key)?.items.push(activity);
    });
    return Array.from(map.values());
  }, [activities, dayLabel]);

  return (
    <>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionLabel}>{t('homeRecentActivity')}</Text>
      </View>
      <View style={styles.activityList}>
        {activities.length === 0 ? (
          <View style={styles.activityItem}>
            <View style={styles.activityMeta}>
              <Text style={styles.activityType}>{t('homeNoTransactions')}</Text>
              <Text style={styles.activityAddress}>{t('homeNoTransactionsDesc')}</Text>
            </View>
          </View>
        ) : (
          groupedActivities.map(group => (
            <View key={group.label} style={styles.groupWrap}>
              <Text style={styles.groupTitle}>{group.label}</Text>
              {group.items.map(item => {
                const isSent = item.kind === 'send';
                return (
                  <Pressable key={item.id} style={styles.activityItem} onPress={() => setSelectedActivity(item)}>
                    <View style={[styles.activityIcon, isSent ? styles.activityIconSent : styles.activityIconReceived]}>
                      <Ionicons
                        name={isSent ? 'arrow-up-outline' : 'arrow-down-outline'}
                        size={18}
                        color={isSent ? themeTokens.danger : themeTokens.success}
                      />
                    </View>

                    <View style={styles.activityMeta}>
                      <Text style={styles.activityType}>{isSent ? t('homeActivitySent') : t('homeActivityReceived')}</Text>
                      <Text style={styles.activityAddress}>
                        {isSent ? t('homeActivityTo') : t('homeActivityFrom')}: {truncateAddress(isSent ? item.toAddress : item.fromAddress)}
                      </Text>
                    </View>

                    <View style={styles.activityValueCol}>
                      <Text style={[styles.activityAmount, isSent ? styles.amountSent : styles.amountReceived]}>
                        {formatAmount(item)}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          ))
        )}
      </View>

      <Modal
        visible={Boolean(selectedActivity)}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedActivity(null)}
        statusBarTranslucent
      >
        <View style={[styles.modalBackdrop, { backgroundColor: themeTokens.overlay }]}> 
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setSelectedActivity(null)} />
          <View style={styles.modalCard}>
            {selectedActivity && (
              <ScrollView contentContainerStyle={styles.modalContent}>
                <Text style={styles.modalTitle}>{t('homeActivityDetailsTitle')}</Text>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>{t('homeActivityTypeLabel')}</Text>
                  <Text style={styles.detailValue}>
                    {selectedActivity.kind === 'send' ? t('homeActivitySent') : t('homeActivityReceived')}
                  </Text>
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>{t('homeActivityFrom')}</Text>
                  <Text style={styles.detailValue} selectable>{selectedActivity.fromAddress}</Text>
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>{t('homeActivityTo')}</Text>
                  <Text style={styles.detailValue} selectable>{selectedActivity.toAddress}</Text>
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>{t('homeActivityAmountLabel')}</Text>
                  <Text style={styles.detailValue}>{formatAmount(selectedActivity)}</Text>
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>{t('homeActivityTimeLabel')}</Text>
                  <Text style={styles.detailValue}>{formatActivityDay(selectedActivity.createdAt)}</Text>
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>{t('sendTxHash')}</Text>
                  <Text style={styles.detailValue} selectable>{selectedActivity.transactionHash}</Text>
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>{t('homeActivityNetworkLabel')}</Text>
                  <Text style={styles.detailValue}>{selectedActivity.networkName}</Text>
                </View>

                <AppButton label={t('commonDone')} onPress={() => setSelectedActivity(null)} />
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </>
  );
};

const createStyles = (theme: ThemeTokens) =>
  StyleSheet.create({
    sectionLabel: {
      color: '#7E8AA1',
      fontSize: theme.typography.body,
      letterSpacing: 2,
      fontWeight: '700',
      marginTop: 6,
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      marginTop: 6,
    },
    activityList: {
      gap: 12,
    },
    groupWrap: {
      gap: 8,
    },
    groupTitle: {
      color: theme.foregroundMuted,
      fontSize: theme.typography.caption,
      fontWeight: '800',
      letterSpacing: 0.4,
      marginTop: 4,
      marginBottom: 2,
    },
    activityItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: theme.surfaceHighlight,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 14,
    },
    activityIcon: {
      width: 44,
      height: 44,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    activityIconSent: {
      backgroundColor: 'rgba(255, 77, 79, 0.1)',
    },
    activityIconReceived: {
      backgroundColor: 'rgba(47, 214, 123, 0.1)',
    },
    activityMeta: {
      flex: 1,
    },
    activityType: {
      color: theme.foreground,
      fontSize: theme.typography.body,
      fontWeight: '700',
    },
    activityAddress: {
      color: theme.foregroundMuted,
      fontSize: theme.typography.subtext,
      marginTop: 2,
    },
    activityValueCol: {
      alignItems: 'flex-end',
    },
    activityAmount: {
      fontSize: theme.typography.body,
      fontWeight: '700',
    },
    amountSent: {
      color: '#FF4D4F',
    },
    amountReceived: {
      color: '#2FD67B',
    },
    modalBackdrop: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 20,
    },
    modalCard: {
      width: '100%',
      maxHeight: '82%',
      borderRadius: 20,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surface,
    },
    modalContent: {
      padding: 16,
      gap: 12,
    },
    modalTitle: {
      color: theme.foreground,
      fontSize: theme.typography.subtitle,
      fontWeight: '800',
      marginBottom: 4,
      textAlign: 'center',
    },
    detailRow: {
      gap: 4,
      paddingBottom: 8,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
    },
    detailLabel: {
      color: theme.foregroundMuted,
      fontSize: theme.typography.caption,
      fontWeight: '700',
    },
    detailValue: {
      color: theme.foreground,
      fontSize: theme.typography.subtext,
      lineHeight: 18,
    },
  });

