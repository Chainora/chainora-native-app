import React, { useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StatusBar,
  Text,
  TextInput,
  View,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  WALLET_COLORS,
  WalletPanel,
  WalletTopBar,
} from '@components/ui/walletDesign';
import { useSettings } from '@hooks/useSettings';
import type { AppCurrency } from '@hooks/useSettings';
import type { RootStackParamList } from '@navigation/routes/rootStackParamList';
import { ROUTES } from '@navigation/routes/routes';
import { screenBase, styles } from './CurrencySettings.styles';

type Props = NativeStackScreenProps<
  RootStackParamList,
  typeof ROUTES.CurrencySettings
>;
type CurrencyOption = {
  value: AppCurrency;
  label: string;
};

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
              <Ionicons
                name="search-outline"
                size={16}
                color={WALLET_COLORS.textSoft}
              />
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
                <Pressable
                  style={styles.clearButton}
                  onPress={() => setQuery('')}
                >
                  <Ionicons
                    name="close"
                    size={14}
                    color={WALLET_COLORS.textSoft}
                  />
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
                          index < filteredOptions.length - 1 &&
                            styles.rowBorder,
                        ]}
                        onPress={() => handleSelect(option.value)}
                      >
                        <View>
                          <Text
                            style={[
                              styles.rowLabel,
                              isSelected && styles.rowLabelSelected,
                            ]}
                          >
                            {option.label}
                          </Text>
                          <Text style={styles.rowMeta}>
                            {option.value.toUpperCase()}
                          </Text>
                        </View>
                        <View
                          style={[styles.dotBox, isSelected && styles.dotBoxOn]}
                        >
                          {isSelected ? (
                            <View style={styles.dotBoxDot} />
                          ) : null}
                        </View>
                      </Pressable>
                    );
                  })
                ) : (
                  <View style={styles.emptyWrap}>
                    <Text style={styles.emptyText}>
                      {t('settingsCurrencyNoResults')}
                    </Text>
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

export default CurrencySettingsScreen;
