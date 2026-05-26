import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@react-native-vector-icons/ionicons';

import {
  useWalletColors,
  WalletButton,
  WalletPanel,
  WalletSectionLabel,
  WalletTextField,
  WalletTopBar,
} from '@components/ui/walletDesign';
import { getNetworkConfig, type WalletHomeNetworkKey } from '@config/network';
import { useImportedNetworkSaver } from '@hooks/useImportedNetworkSaver';
import { useSettings } from '@hooks/useSettings';
import { useWalletHomeNetworks } from '@hooks/useWalletHomeNetworks';
import type { RootStackParamList } from '@navigation/routes/rootStackParamList';
import { ROUTES } from '@navigation/routes/routes';
import WalletNetworkCoin from '@components/wallet/WalletNetworkCoin';
import { createAddTokenScreenBase, styles } from './AddToken.styles';

type AddTokenProps = NativeStackScreenProps<
  RootStackParamList,
  typeof ROUTES.AddToken
>;

const AddTokenScreen: React.FC<AddTokenProps> = ({ navigation }) => {
  const { t } = useSettings();
  const colors = useWalletColors();
  const screenBase = useMemo(() => createAddTokenScreenBase(colors), [colors]);
  const walletHomeNetworks = useWalletHomeNetworks();
  const saveImportedNetwork = useImportedNetworkSaver();
  const [tab, setTab] = useState<'token' | 'network'>('token');
  const [selectedTokenNetworkKey, setSelectedTokenNetworkKey] =
    useState<WalletHomeNetworkKey | null>(
      walletHomeNetworks[0]?.key as WalletHomeNetworkKey,
    );
  const [address, setAddress] = useState('');
  const [name, setName] = useState('');
  const [symbol, setSymbol] = useState('');
  const [decimals, setDecimals] = useState('');
  const [networkName, setNetworkName] = useState('');
  const [networkSymbol, setNetworkSymbol] = useState('');
  const [rpcUrl, setRpcUrl] = useState('');
  const [saving, setSaving] = useState(false);

  const canSave =
    tab === 'token'
      ? Boolean(address && name && symbol && decimals)
      : Boolean(networkName && rpcUrl && networkSymbol && !saving);

  useEffect(() => {
    if (walletHomeNetworks.length === 0) {
      return;
    }

    if (
      !selectedTokenNetworkKey ||
      !walletHomeNetworks.some(
        network => network.key === selectedTokenNetworkKey,
      )
    ) {
      setSelectedTokenNetworkKey(
        walletHomeNetworks[0].key as WalletHomeNetworkKey,
      );
    }
  }, [selectedTokenNetworkKey, walletHomeNetworks]);

  const handleSave = useCallback(() => {
    if (!canSave) {
      return;
    }

    if (tab === 'token') {
      Alert.alert(
        t('walletImportTokenSavedTitle'),
        t('walletImportTokenSavedBody'),
      );
      return;
    }

    setSaving(true);
    saveImportedNetwork({
      name: networkName,
      rpcUrl,
      currencySymbol: networkSymbol,
    })
      .then(() => {
        Alert.alert(
          t('walletImportNetworkSavedTitle'),
          t('walletImportNetworkSavedBody'),
        );
        navigation.goBack();
      })
      .catch(error => {
        const message = error instanceof Error ? error.message : String(error);
        Alert.alert(t('walletImportNetworkSaveFailedTitle'), message);
      })
      .finally(() => {
        setSaving(false);
      });
  }, [
    canSave,
    navigation,
    networkName,
    networkSymbol,
    rpcUrl,
    saveImportedNetwork,
    t,
    tab,
  ]);

  return (
    <View style={screenBase.screen}>
      <SafeAreaView style={screenBase.safeArea} edges={['top', 'bottom']}>
        <View style={screenBase.content}>
          <WalletTopBar
            title={t('walletImportTitle')}
            onBack={() => navigation.goBack()}
          />

          <View style={styles.tabSwitch}>
            {(['token', 'network'] as const).map(option => (
              <Pressable
                key={option}
                style={styles.tabSwitchItem}
                onPress={() => setTab(option)}
              >
                <Text
                  style={[
                    styles.tabSwitchText,
                    tab === option && styles.tabSwitchTextOn,
                  ]}
                >
                  {option === 'token'
                    ? t('walletImportTabToken')
                    : t('walletImportTabNetwork')}
                </Text>
                {tab === option ? (
                  <View style={styles.tabSwitchIndicator} />
                ) : null}
              </Pressable>
            ))}
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.formScroll}
          >
            <WalletPanel style={styles.warningCard}>
              <View style={[styles.warningIcon, styles.warningIconAmber]}>
                <Ionicons
                  name="warning-outline"
                  size={14}
                  color={colors.warning}
                />
              </View>
              <Text style={styles.warningText}>
                {t('walletImportWarningBody')}
              </Text>
            </WalletPanel>

            {tab === 'token' ? (
              <>
                <View style={styles.fieldGroup}>
                  <WalletSectionLabel label={t('walletImportNetworkLabel')} />
                  <WalletTextField
                    left={
                      selectedTokenNetworkKey ? (
                        <WalletNetworkCoin
                          network={getNetworkConfig(selectedTokenNetworkKey)}
                          size={20}
                        />
                      ) : null
                    }
                  >
                    <Text style={styles.networkPillText}>
                      {selectedTokenNetworkKey
                        ? getNetworkConfig(selectedTokenNetworkKey).name
                        : '-'}
                    </Text>
                  </WalletTextField>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.chipRowCompact}
                  >
                    {walletHomeNetworks.map(network => (
                      <Pressable
                        key={network.key}
                        style={[
                          styles.filterChip,
                          selectedTokenNetworkKey === network.key &&
                            styles.filterChipOn,
                        ]}
                        onPress={() =>
                          setSelectedTokenNetworkKey(
                            network.key as WalletHomeNetworkKey,
                          )
                        }
                      >
                        <WalletNetworkCoin network={network} size={28} />
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>

                <View style={styles.fieldGroup}>
                  <WalletSectionLabel
                    label={t('walletImportContractAddressLabel')}
                  />
                  <WalletTextField>
                    <TextInput
                      placeholder="0x..."
                      placeholderTextColor={colors.textLow}
                      value={address}
                      onChangeText={setAddress}
                      autoCapitalize="none"
                      style={styles.fieldInput}
                    />
                  </WalletTextField>
                </View>

                <View style={styles.fieldGroup}>
                  <WalletSectionLabel label={t('walletImportNameLabel')} />
                  <WalletTextField>
                    <TextInput
                      placeholder={t('walletImportNamePlaceholder')}
                      placeholderTextColor={colors.textLow}
                      value={name}
                      onChangeText={setName}
                      style={styles.fieldInput}
                    />
                  </WalletTextField>
                </View>

                <View style={styles.fieldGroup}>
                  <WalletSectionLabel label={t('walletImportTickerLabel')} />
                  <WalletTextField>
                    <TextInput
                      placeholder={t('walletImportTickerPlaceholder')}
                      placeholderTextColor={colors.textLow}
                      value={symbol}
                      onChangeText={text => setSymbol(text.toUpperCase())}
                      style={styles.fieldInput}
                    />
                  </WalletTextField>
                </View>

                <View style={styles.fieldGroup}>
                  <WalletSectionLabel label={t('walletImportDecimalsLabel')} />
                  <WalletTextField>
                    <TextInput
                      placeholder="18"
                      placeholderTextColor={colors.textLow}
                      value={decimals}
                      onChangeText={text =>
                        setDecimals(text.replace(/[^\d]/g, '').slice(0, 2))
                      }
                      keyboardType="number-pad"
                      style={styles.fieldInput}
                    />
                  </WalletTextField>
                </View>
              </>
            ) : (
              <>
                <View style={styles.fieldGroup}>
                  <WalletSectionLabel
                    label={t('walletImportNetworkNameLabel')}
                  />
                  <WalletTextField>
                    <TextInput
                      placeholder={t('walletImportNetworkNamePlaceholder')}
                      placeholderTextColor={colors.textLow}
                      value={networkName}
                      onChangeText={setNetworkName}
                      style={styles.fieldInput}
                    />
                  </WalletTextField>
                </View>
                <View style={styles.fieldGroup}>
                  <WalletSectionLabel
                    label={t('walletImportNetworkSymbolLabel')}
                  />
                  <WalletTextField>
                    <TextInput
                      placeholder={t('walletImportNetworkSymbolPlaceholder')}
                      placeholderTextColor={colors.textLow}
                      value={networkSymbol}
                      onChangeText={text =>
                        setNetworkSymbol(text.toUpperCase())
                      }
                      style={styles.fieldInput}
                    />
                  </WalletTextField>
                </View>
                <View style={styles.fieldGroup}>
                  <WalletSectionLabel label={t('walletImportRpcUrlLabel')} />
                  <WalletTextField>
                    <TextInput
                      placeholder="https://..."
                      placeholderTextColor={colors.textLow}
                      value={rpcUrl}
                      onChangeText={setRpcUrl}
                      autoCapitalize="none"
                      style={styles.fieldInput}
                    />
                  </WalletTextField>
                </View>
              </>
            )}
          </ScrollView>

          <WalletButton
            label={saving ? t('walletImportSaving') : t('walletImportSave')}
            disabled={!canSave}
            onPress={handleSave}
          />
        </View>
      </SafeAreaView>
    </View>
  );
};

export { AddTokenScreen };
export default AddTokenScreen;
