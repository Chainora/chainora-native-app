import React from 'react';
import { Pressable, ScrollView, StatusBar, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getWalletHomeNetworks } from '@config/network';
import { useSettings } from '@hooks/useSettings';
import type { RootStackParamList } from '@navigation/routes/rootStackParamList';
import { ROUTES } from '@navigation/routes/routes';
import type { AppNetwork } from '@store/settings';
import {
  WALLET_COLORS,
  WalletAuras,
  WalletPanel,
  WalletSectionLabel,
  WalletTopBar,
} from '@components/ui/walletDesign';
import { screenBase, styles } from './General.styles';

type Props = NativeStackScreenProps<RootStackParamList, typeof ROUTES.General>;
type Option = { value: string; label: string };

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
              <Text
                style={[
                  styles.optionChipText,
                  active && styles.optionChipTextOn,
                ]}
              >
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
  const networkOptions = getWalletHomeNetworks().map(network => ({
    value: network.key,
    label: network.name,
  }));

  return (
    <View style={screenBase.screen}>
      <StatusBar
        barStyle={resolvedTheme === 'light' ? 'dark-content' : 'light-content'}
        backgroundColor={WALLET_COLORS.background}
      />
      <SafeAreaView style={screenBase.safeArea} edges={['top', 'bottom']}>
        <WalletAuras />
        <View style={screenBase.content}>
          <WalletTopBar
            title={t('headerGeneralTitle')}
            onBack={() => navigation.goBack()}
          />

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
          >
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
              onSelect={value => setNetwork(value as AppNetwork)}
              options={networkOptions}
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

export default GeneralScreen;
