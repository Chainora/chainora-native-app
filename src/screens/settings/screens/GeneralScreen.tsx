import React from 'react';
import { Pressable, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useSettings } from '../../../features/settings';
import type { RootStackParamList } from '../../../navigation/routes/rootStackParamList';
import { ROUTES } from '../../../navigation/routes/routes';
import {
  MONO_FONT,
  WALLET_COLORS,
  WalletAuras,
  WalletPanel,
  WalletSectionLabel,
  WalletTopBar,
  buildWalletScreenStyles,
} from '../../../components/ui/walletDesign';

type Props = NativeStackScreenProps<RootStackParamList, typeof ROUTES.General>;
type Option = { value: string; label: string };

const screenBase = buildWalletScreenStyles();

const OptionGroup: React.FC<{
  title: string;
  options: Option[];
  selected: string;
  onSelect: (value: string) => void;
}> = ({ title, options, selected, onSelect }) => (
  <View style={styles.groupWrap}>
    <WalletSectionLabel label={title} />
    <WalletPanel style={styles.groupCard}>
      <View style={styles.optionRow}>
        {options.map(option => {
          const active = option.value === selected;
          return (
            <Pressable
              key={option.value}
              style={[styles.optionChip, active && styles.optionChipOn]}
              onPress={() => onSelect(option.value)}
            >
              <Text style={[styles.optionChipText, active && styles.optionChipTextOn]}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </WalletPanel>
  </View>
);

const GeneralScreen: React.FC<Props> = ({ navigation }) => {
  const { settings, resolvedTheme, setNetwork, setTheme, t } = useSettings();

  return (
    <View style={screenBase.screen}>
      <StatusBar
        barStyle={resolvedTheme === 'light' ? 'dark-content' : 'light-content'}
        backgroundColor={WALLET_COLORS.background}
      />
      <SafeAreaView style={screenBase.safeArea} edges={['top', 'bottom']}>
        <WalletAuras />
        <View style={screenBase.content}>
          <WalletTopBar title={t('headerGeneralTitle')} onBack={() => navigation.goBack()} />

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
            <OptionGroup
              title={t('generalTheme')}
              selected={settings.theme}
              onSelect={value => setTheme(value as 'dark' | 'light' | 'system')}
              options={[
                { value: 'dark', label: t('themeDark') },
                { value: 'light', label: t('themeLight') },
                { value: 'system', label: t('themeSystem') },
              ]}
            />

            <OptionGroup
              title={t('generalNetwork')}
              selected={settings.network}
              onSelect={value => setNetwork(value as 'eth' | 'chainora')}
              options={[
                { value: 'chainora', label: t('networkChainoraTestnet') },
                { value: 'eth', label: t('networkEth') },
              ]}
            />

            <WalletPanel style={styles.helperCard}>
              <Text style={styles.helperText}>{t('generalHelper')}</Text>
            </WalletPanel>
          </ScrollView>
        </View>
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  scrollContent: {
    paddingTop: 16,
    paddingBottom: 24,
    gap: 18,
  },
  groupWrap: {
    gap: 8,
  },
  groupCard: {
    padding: 14,
  },
  optionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  optionChip: {
    minHeight: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: WALLET_COLORS.border,
    backgroundColor: WALLET_COLORS.surfaceAlt,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  optionChipOn: {
    borderColor: WALLET_COLORS.signalBorder,
    backgroundColor: WALLET_COLORS.signalSoft,
  },
  optionChipText: {
    color: WALLET_COLORS.textMuted,
    fontSize: 13,
    fontWeight: '700',
  },
  optionChipTextOn: {
    color: WALLET_COLORS.text,
  },
  helperCard: {
    padding: 14,
  },
  helperText: {
    color: WALLET_COLORS.textSoft,
    fontFamily: MONO_FONT,
    fontSize: 11,
    lineHeight: 18,
  },
});

export default GeneralScreen;
