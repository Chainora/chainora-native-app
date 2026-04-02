import React, { useMemo } from 'react';
import { Pressable, StatusBar, StyleSheet, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useSettings } from '../features/settings';
import { ROUTES } from '../navigation/routes/routes';
import type { RootStackParamList } from '../navigation/routes/rootStackParamList';
import type { ThemeTokens } from '../types/theme/colors';

type Props = NativeStackScreenProps<RootStackParamList, typeof ROUTES.General>;

type OptionItem = {
  value: string;
  label: string;
};

const OptionGroup: React.FC<{
  title: string;
  options: OptionItem[];
  selected: string;
  onSelect: (value: string) => void;
  theme: ThemeTokens;
}> = ({ title, options, selected, onSelect, theme }) => {
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <View style={styles.groupCard}>
      <Text style={styles.groupTitle}>{title}</Text>
      <View style={styles.optionRow}>
        {options.map(option => {
          const active = selected === option.value;
          return (
            <Pressable
              key={option.value}
              style={[styles.optionChip, active && styles.optionChipActive]}
              onPress={() => onSelect(option.value)}
            >
              <Text style={[styles.optionChipText, active && styles.optionChipTextActive]}>
                {option.label.toUpperCase()}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
};

export const GeneralScreen: React.FC<Props> = () => {
  const { settings, resolvedTheme, setCurrency, setLanguage, setNetwork, setTheme, t, themeTokens } = useSettings();
  const styles = useMemo(() => createStyles(themeTokens), [themeTokens]);

  const languageOptions: OptionItem[] = [
    { value: 'en', label: t('languageEnglish') },
    { value: 'vi', label: t('languageVietnamese') },
  ];

  const currencyOptions: OptionItem[] = [
    { value: 'bnb', label: t('currencyBnb') },
    { value: 'btc', label: t('currencyBtc') },
    { value: 'usd', label: t('currencyUsd') },
  ];

  const themeOptions: OptionItem[] = [
    { value: 'dark', label: t('themeDark') },
    { value: 'light', label: t('themeLight') },
    { value: 'system', label: t('themeSystem') },
  ];

  const networkOptions: OptionItem[] = [
    { value: 'chainora', label: t('networkChainoraTestnet') },
    { value: 'eth', label: t('networkEth') },
  ];

  return (
    <View style={styles.container}>
      <StatusBar
        barStyle={resolvedTheme === 'light' ? 'dark-content' : 'light-content'}
        backgroundColor={themeTokens.background}
      />
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <View style={styles.content}>
          <OptionGroup
            title={t('generalLanguage')}
            options={languageOptions}
            selected={settings.language}
            onSelect={value => setLanguage(value as 'en' | 'vi')}
            theme={themeTokens}
          />

          <OptionGroup
            title={t('generalCurrency')}
            options={currencyOptions}
            selected={settings.currency}
            onSelect={value => setCurrency(value as 'bnb' | 'btc' | 'usd')}
            theme={themeTokens}
          />

          <OptionGroup
            title={t('generalTheme')}
            options={themeOptions}
            selected={settings.theme}
            onSelect={value => setTheme(value as 'dark' | 'light' | 'system')}
            theme={themeTokens}
          />

          <OptionGroup
            title={t('generalNetwork')}
            options={networkOptions}
            selected={settings.network}
            onSelect={value => setNetwork(value as 'eth' | 'chainora')}
            theme={themeTokens}
          />

          <Text style={styles.helperText}>
            {t('generalHelper')}
          </Text>
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
    groupCard: {
      backgroundColor: theme.surfaceHighlight,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 14,
      gap: 12,
    },
    groupTitle: {
      color: theme.foreground,
      fontSize: theme.typography.subtitle,
      fontWeight: '700',
    },
    optionRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    optionChip: {
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surface,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    optionChipActive: {
      borderColor: theme.primaryLight,
      backgroundColor: theme.glow,
    },
    optionChipText: {
      color: theme.foregroundMuted,
      fontSize: theme.typography.subtext,
      fontWeight: '700',
      letterSpacing: 0.3,
    },
    optionChipTextActive: {
      color: theme.primary,
    },
    helperText: {
      color: theme.foregroundMuted,
      fontSize: theme.typography.subtext,
      marginTop: 2,
    },
  });

export default GeneralScreen;
