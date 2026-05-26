import React, { useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  MONO_FONT,
  WALLET_COLORS,
  WalletPanel,
  WalletTopBar,
  buildWalletScreenStyles,
} from '../components/ui/walletDesign';
import { useSettings } from '../features/settings';
import type { AppCurrency } from '../features/settings';
import type { RootStackParamList } from '../navigation/routes/rootStackParamList';
import { ROUTES } from '../navigation/routes/routes';

type Props = NativeStackScreenProps<RootStackParamList, typeof ROUTES.CurrencySettings>;
type CurrencyOption = {
  value: AppCurrency;
  label: string;
};

const screenBase = buildWalletScreenStyles();

const CurrencySettingsScreen: React.FC<Props> = ({ navigation }) => {
  const { settings, resolvedTheme, setCurrency, t } = useSettings();
  const [query, setQuery] = useState('');

  const options = useMemo<CurrencyOption[]>(
    () => [
      { value: 'usd', label: t('currencyUsd') },
      { value: 'vnd', label: t('currencyVnd') },
    ],
    [t],
  );

  const normalizedQuery = query.trim().toLowerCase();
  const filteredOptions = useMemo(
    () =>
      options.filter(option => {
        return (
          option.label.toLowerCase().includes(normalizedQuery) ||
          option.value.includes(normalizedQuery)
        );
      }),
    [normalizedQuery, options],
  );

  const handleSelect = (currency: AppCurrency) => {
    setCurrency(currency);
  };

  return (
    <View style={screenBase.screen}>
      <StatusBar
        barStyle={resolvedTheme === 'light' ? 'dark-content' : 'light-content'}
        backgroundColor={WALLET_COLORS.background}
      />
      <SafeAreaView style={screenBase.safeArea} edges={['top', 'bottom']}>
        <View style={screenBase.content}>
          <WalletTopBar
            title={t('settingsCurrencyPickerTitle')}
            onBack={() => navigation.goBack()}
          />

          <View style={styles.content}>
            <WalletPanel style={styles.searchPanel}>
              <Ionicons name="search-outline" size={16} color={WALLET_COLORS.textSoft} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder={t('settingsCurrencySearchPlaceholder')}
                placeholderTextColor={WALLET_COLORS.textLow}
                style={styles.searchInput}
                autoCorrect={false}
                autoCapitalize="none"
              />
              {query ? (
                <Pressable style={styles.clearButton} onPress={() => setQuery('')}>
                  <Ionicons name="close" size={14} color={WALLET_COLORS.textSoft} />
                </Pressable>
              ) : null}
            </WalletPanel>

            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.listContent}
            >
              <WalletPanel style={styles.listPanel}>
                {filteredOptions.length ? (
                  filteredOptions.map((option, index) => {
                    const isSelected = option.value === settings.currency;
                    return (
                      <Pressable
                        key={option.value}
                        style={({ pressed }) => [
                          styles.row,
                          pressed && styles.rowPressed,
                          index < filteredOptions.length - 1 && styles.rowBorder,
                        ]}
                        onPress={() => handleSelect(option.value)}
                      >
                        <View>
                          <Text style={[styles.rowLabel, isSelected && styles.rowLabelSelected]}>
                            {option.label}
                          </Text>
                          <Text style={styles.rowMeta}>{option.value.toUpperCase()}</Text>
                        </View>
                        <View style={[styles.dotBox, isSelected && styles.dotBoxOn]}>
                          {isSelected ? <View style={styles.dotBoxDot} /> : null}
                        </View>
                      </Pressable>
                    );
                  })
                ) : (
                  <View style={styles.emptyWrap}>
                    <Text style={styles.emptyText}>{t('settingsCurrencyNoResults')}</Text>
                  </View>
                )}
              </WalletPanel>
            </ScrollView>
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  content: {
    flex: 1,
    paddingTop: 16,
    gap: 14,
  },
  searchPanel: {
    minHeight: 50,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  searchInput: {
    flex: 1,
    color: WALLET_COLORS.text,
    fontSize: 14,
  },
  clearButton: {
    width: 24,
    height: 24,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: WALLET_COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    paddingBottom: 20,
  },
  listPanel: {
    overflow: 'hidden',
  },
  row: {
    minHeight: 62,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  rowPressed: {
    backgroundColor: WALLET_COLORS.surfaceAlt,
  },
  rowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: WALLET_COLORS.border,
  },
  rowLabel: {
    color: WALLET_COLORS.textMuted,
    fontSize: 14,
  },
  rowLabelSelected: {
    color: WALLET_COLORS.text,
    fontWeight: '600',
  },
  rowMeta: {
    marginTop: 2,
    color: WALLET_COLORS.textSoft,
    fontFamily: MONO_FONT,
    fontSize: 11,
    letterSpacing: 0.4,
  },
  dotBox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: WALLET_COLORS.borderStrong,
    backgroundColor: WALLET_COLORS.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotBoxOn: {
    borderColor: WALLET_COLORS.signal,
  },
  dotBoxDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: WALLET_COLORS.signal,
  },
  emptyWrap: {
    minHeight: 120,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  emptyText: {
    color: WALLET_COLORS.textSoft,
    fontFamily: MONO_FONT,
    fontSize: 11,
    letterSpacing: 0.7,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
});

export default CurrencySettingsScreen;
