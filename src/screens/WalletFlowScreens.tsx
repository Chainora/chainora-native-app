import React, { useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@react-native-vector-icons/ionicons';

import { useAuth } from '../features/auth';
import type { RootStackParamList } from '../navigation/routes/rootStackParamList';
import { ROUTES } from '../navigation/routes/routes';
import {
  DISPLAY_FONT,
  MONO_FONT,
  WALLET_COLORS,
  WalletAuras,
  WalletButton,
  WalletPanel,
  WalletPill,
  WalletSectionLabel,
  WalletTextField,
  WalletTopBar,
  buildWalletScreenStyles,
} from '../components/ui/walletDesign';

type SendPickProps = NativeStackScreenProps<RootStackParamList, typeof ROUTES.SendPick>;
type SendBtcProps = NativeStackScreenProps<RootStackParamList, typeof ROUTES.SendBtc>;
type ReceiveProps = NativeStackScreenProps<RootStackParamList, typeof ROUTES.Receive>;
type TouchSignProps = NativeStackScreenProps<RootStackParamList, typeof ROUTES.TouchSign>;
type TokenManageProps = NativeStackScreenProps<RootStackParamList, typeof ROUTES.TokenManage>;
type AddTokenProps = NativeStackScreenProps<RootStackParamList, typeof ROUTES.AddToken>;

const TOKENS = [
  { sym: 'BTC', network: 'Bitcoin', name: 'Bitcoin', glyph: 'B', value: '2,933,408.14', balance: '0.001439 BTC', active: true },
  { sym: 'ETH', network: 'Ethereum', name: 'Ethereum', glyph: 'E', value: '930,054.82', balance: '0.016587 ETH' },
  { sym: 'XRP', network: 'XRP', name: 'XRP', glyph: 'X', value: '35,949.01', balance: '0.999541 XRP' },
  { sym: 'BNB', network: 'BNB Smart Chain', name: 'BNB Smart Chain', glyph: 'B', value: '1,266,186.00', balance: '0.072958 BNB' },
  { sym: 'SOL', network: 'Solana', name: 'Solana', glyph: 'S', value: '1,219,076.76', balance: '0.532024 SOL' },
  { sym: 'TRX', network: 'Tron', name: 'TRON', glyph: 'T', value: '5,426.33', balance: '12 TRX' },
];

const TOKEN_MANAGE = [
  { sym: 'BTC', chain: 'Bitcoin', name: 'Bitcoin', glyph: 'B', enabled: true },
  { sym: 'ETH', chain: 'Ethereum', name: 'Ethereum', glyph: 'E', enabled: true },
  { sym: 'XRP', chain: 'XRP', name: 'XRP', glyph: 'X', enabled: true },
  { sym: 'BNB', chain: 'BNB Smart Chain', name: 'BNB Smart Chain', glyph: 'B', enabled: true },
  { sym: 'SOL', chain: 'Solana', name: 'Solana', glyph: 'S', enabled: true },
  { sym: 'USDT', chain: 'Ethereum', name: 'Tether', glyph: 'U', enabled: true },
  { sym: 'DOGE', chain: 'Dogecoin', name: 'Dogecoin', glyph: 'D', enabled: false },
  { sym: 'TRX', chain: 'Tron', name: 'Tron', glyph: 'T', enabled: false },
];

const CHAIN_FILTERS = ['All', 'BTC', 'ETH', 'SOL', 'BNB', 'TRX'] as const;

const coinColors: Record<string, [string, string]> = {
  BTC: ['#F7931A', '#B56A08'],
  ETH: ['#627EEA', '#2A3A7E'],
  XRP: ['#1D1D1D', '#444444'],
  BNB: ['#F3BA2F', '#8A6300'],
  SOL: ['#9945FF', '#14F195'],
  TRX: ['#EF0027', '#800014'],
  USDT: ['#26A17B', '#0F6048'],
  DOGE: ['#C2A633', '#6B5B15'],
};

const makeCoinStyle = (sym: string) => {
  const [primary, secondary] = coinColors[sym] ?? ['#254266', '#1A2434'];
  return {
    backgroundColor: primary,
    borderColor: secondary,
  };
};

const screenBase = buildWalletScreenStyles();

const renderCoin = (sym: string, glyph: string, size = 42) => (
  <View style={[styles.coin, makeCoinStyle(sym), { width: size, height: size, borderRadius: size / 2 }]}>
    <Text style={[styles.coinText, { fontSize: size * 0.32 }]}>{glyph}</Text>
  </View>
);

export const SendPickScreen: React.FC<SendPickProps> = ({ navigation }) => (
  <View style={screenBase.screen}>
    <SafeAreaView style={screenBase.safeArea} edges={['top', 'bottom']}>
      <WalletAuras />
      <View style={screenBase.content}>
        <WalletTopBar title="Send" onBack={() => navigation.goBack()} />

        <WalletTextField style={styles.searchField}>
          <View style={styles.inlineRow}>
            <Ionicons name="search-outline" size={15} color={WALLET_COLORS.textSoft} />
            <Text style={styles.searchPlaceholder}>Search</Text>
          </View>
        </WalletTextField>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.flowScroll}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            {CHAIN_FILTERS.map(filter => (
              <WalletPill
                key={filter}
                style={[
                  styles.chainChip,
                  filter === 'All' && styles.chainChipActive,
                ]}
              >
                {filter === 'All' ? (
                  <Text style={styles.chainChipText}>All</Text>
                ) : (
                  renderCoin(filter, filter.slice(0, 1), 28)
                )}
              </WalletPill>
            ))}
          </ScrollView>

          <WalletPanel style={styles.tokenListCard}>
            {TOKENS.map((token, index) => (
              <Pressable
                key={`${token.sym}-${token.network}`}
                style={styles.tokenRow}
                onPress={() => {
                  if (token.sym === 'BTC') {
                    navigation.navigate(ROUTES.SendBtc);
                  }
                }}
              >
                {renderCoin(token.sym, token.glyph)}
                <View style={styles.tokenInfo}>
                  <View style={styles.inlineRow}>
                    <Text style={styles.tokenSymbol}>{token.sym}</Text>
                    <Text style={styles.tokenNetworkTag}>{token.network}</Text>
                  </View>
                  <Text style={styles.tokenName}>{token.name}</Text>
                </View>
                <View style={styles.tokenRight}>
                  <Text style={styles.tokenValue}>{token.value}</Text>
                  <Text style={styles.tokenBalance}>{token.balance}</Text>
                </View>
                {index < TOKENS.length - 1 ? <View style={styles.tokenDivider} /> : null}
              </Pressable>
            ))}
          </WalletPanel>
        </ScrollView>
      </View>
    </SafeAreaView>
  </View>
);

export const SendBtcScreen: React.FC<SendBtcProps> = ({ navigation }) => {
  const { session } = useAuth();
  const [address, setAddress] = useState('');
  const [amount, setAmount] = useState('');

  return (
    <View style={screenBase.screen}>
      <SafeAreaView style={screenBase.safeArea} edges={['top', 'bottom']}>
        <WalletAuras />
        <View style={screenBase.content}>
          <WalletTopBar title="Send BTC" onBack={() => navigation.goBack()} />

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.formScroll}>
            <View style={styles.fieldGroup}>
              <WalletSectionLabel label="Recipient" />
              <WalletTextField
                right={
                  <View style={styles.fieldActions}>
                    <Pressable onPress={async () => setAddress((await Clipboard.getString()).trim())}>
                      <Text style={styles.fieldActionText}>Paste</Text>
                    </Pressable>
                    <Pressable onPress={() => navigation.navigate(ROUTES.QRScanner, { ethAddress: session?.address })}>
                      <Ionicons name="scan-outline" size={18} color={WALLET_COLORS.text} />
                    </Pressable>
                  </View>
                }
              >
                <TextInput
                  placeholder="Search or enter"
                  placeholderTextColor={WALLET_COLORS.textLow}
                  value={address}
                  onChangeText={setAddress}
                  autoCapitalize="none"
                  style={styles.fieldInput}
                />
              </WalletTextField>
            </View>

            <View style={styles.fieldGroup}>
              <WalletSectionLabel label="Network" />
              <WalletPill style={styles.networkPill}>
                {renderCoin('BTC', 'B', 24)}
                <Text style={styles.networkPillText}>Bitcoin</Text>
                <Ionicons name="chevron-down" size={14} color={WALLET_COLORS.textSoft} />
              </WalletPill>
            </View>

            <View style={styles.fieldGroup}>
              <WalletSectionLabel label="Amount" />
              <WalletTextField
                large
                right={
                  <View style={styles.fieldActions}>
                    <WalletPill style={styles.amountTag}>
                      <Text style={styles.amountTagText}>BTC</Text>
                    </WalletPill>
                    <Pressable onPress={() => setAmount('0.250')}>
                      <Text style={styles.fieldActionText}>Max</Text>
                    </Pressable>
                  </View>
                }
              >
                <TextInput
                  placeholder="BTC amount"
                  placeholderTextColor={WALLET_COLORS.textLow}
                  value={amount}
                  onChangeText={setAmount}
                  keyboardType="decimal-pad"
                  style={[styles.fieldInput, styles.fieldInputLarge]}
                />
              </WalletTextField>
              <Text style={styles.approxText}>~ d0.00</Text>
            </View>
          </ScrollView>

          <WalletButton label="Next" onPress={() => navigation.navigate(ROUTES.TouchSign)} />
        </View>
      </SafeAreaView>
    </View>
  );
};

export const ReceiveScreen: React.FC<ReceiveProps> = ({ navigation }) => {
  const address = 'bc1qva7whswqsj7ch99jr2zng3plngskdf0zaed83y';

  return (
    <View style={screenBase.screen}>
      <SafeAreaView style={screenBase.safeArea} edges={['top', 'bottom']}>
        <WalletAuras />
        <View style={screenBase.content}>
          <WalletTopBar
            title="Receive"
            onBack={() => navigation.goBack()}
            right={
              <Pressable style={styles.roundIconButton}>
                <Ionicons name="information-circle-outline" size={18} color={WALLET_COLORS.textMuted} />
              </Pressable>
            }
          />

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.receiveScroll}>
            <WalletPanel style={styles.warningCard}>
              <View style={styles.warningIcon}>
                <Ionicons name="information-circle-outline" size={14} color={WALLET_COLORS.warning} />
              </View>
              <Text style={styles.warningText}>
                Only send <Text style={styles.warningStrong}>Bitcoin (BTC)</Text> to this address.
              </Text>
            </WalletPanel>

            <View style={styles.receiveCoinHead}>
              {renderCoin('BTC', 'B', 28)}
              <Text style={styles.receiveCoinText}>BTC</Text>
              <WalletPill style={styles.receiveBadge}>
                <Text style={styles.receiveBadgeText}>Coin</Text>
              </WalletPill>
            </View>

            <WalletPanel style={styles.qrCard}>
              <View style={styles.qrMock}>
                <View style={styles.qrCornerTL} />
                <View style={styles.qrCornerTR} />
                <View style={styles.qrCornerBL} />
                <View style={styles.qrBrand}>
                  <Ionicons name="shield-checkmark-outline" size={28} color={WALLET_COLORS.text} />
                </View>
              </View>
              <Text style={styles.receiveAddress}>{address}</Text>
            </WalletPanel>

            <View style={styles.receiveActions}>
              <Pressable
                style={styles.receiveAction}
                onPress={() => {
                  Clipboard.setString(address);
                  Alert.alert('Copied', address);
                }}
              >
                <View style={styles.receiveActionIcon}>
                  <Ionicons name="copy-outline" size={18} color={WALLET_COLORS.text} />
                </View>
                <Text style={styles.receiveActionLabel}>Copy</Text>
              </Pressable>
              <Pressable
                style={styles.receiveAction}
                onPress={() => Alert.alert('Share', address)}
              >
                <View style={styles.receiveActionIcon}>
                  <Ionicons name="share-social-outline" size={18} color={WALLET_COLORS.text} />
                </View>
                <Text style={styles.receiveActionLabel}>Share</Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </SafeAreaView>
    </View>
  );
};

export const TouchSignScreen: React.FC<TouchSignProps> = ({ navigation }) => (
  <View style={screenBase.screen}>
    <SafeAreaView style={screenBase.safeArea} edges={['top', 'bottom']}>
      <WalletAuras />
      <View style={screenBase.content}>
        <WalletTopBar title="Touch To Authenticate" onBack={() => navigation.goBack()} />

        <View style={styles.touchBody}>
          <WalletPill style={styles.scanFlag}>
            <View style={styles.scanFlagDot} />
            <Text style={styles.scanFlagText}>Scanning</Text>
          </WalletPill>

          <View style={styles.touchStage}>
            <View style={styles.touchRingOne} />
            <View style={styles.touchRingTwo} />
            <View style={styles.touchRingThree} />
            <View style={styles.touchCore}>
              <Ionicons name="wifi-outline" size={42} color={WALLET_COLORS.text} />
            </View>
          </View>

          <Text style={styles.touchTitle}>Tap your Chainora card to the back of the phone</Text>
          <Text style={styles.touchBodyText}>
            Hold the card steady for 2-3 seconds so the on-chain approval can be signed.
          </Text>

          <WalletPill style={styles.touchMeta}>
            <Text style={styles.touchMetaText}>Sepolia</Text>
            <View style={styles.touchMetaSep} />
            <Text style={styles.touchMetaText}>0.250 ETH</Text>
            <View style={styles.touchMetaSep} />
            <Text style={styles.touchMetaText}>0x6B4f...2a</Text>
          </WalletPill>
        </View>

        <WalletButton label="Cancel" variant="secondary" onPress={() => navigation.goBack()} />
      </View>
    </SafeAreaView>
  </View>
);

export const TokenManageScreen: React.FC<TokenManageProps> = ({ navigation }) => {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<(typeof CHAIN_FILTERS)[number]>('All');
  const [items, setItems] = useState(TOKEN_MANAGE);

  const filtered = useMemo(
    () =>
      items.filter(item => {
        const haystack = `${item.sym} ${item.chain} ${item.name}`.toLowerCase();
        if (query && !haystack.includes(query.toLowerCase())) {
          return false;
        }
        if (filter === 'All') {
          return true;
        }
        return item.sym === filter || item.chain.toUpperCase().includes(filter);
      }),
    [filter, items, query],
  );

  return (
    <View style={screenBase.screen}>
      <SafeAreaView style={screenBase.safeArea} edges={['top', 'bottom']}>
        <WalletAuras />
        <View style={screenBase.content}>
          <WalletTopBar
            title="Manage Tokens"
            onBack={() => navigation.goBack()}
            right={
              <Pressable style={styles.iconButton} onPress={() => navigation.navigate(ROUTES.AddToken)}>
                <Ionicons name="add" size={18} color={WALLET_COLORS.text} />
              </Pressable>
            }
          />

          <WalletTextField style={styles.searchField}>
            <View style={styles.inlineRow}>
              <Ionicons name="search-outline" size={15} color={WALLET_COLORS.textSoft} />
              <TextInput
                placeholder="Search token, network..."
                placeholderTextColor={WALLET_COLORS.textLow}
                value={query}
                onChangeText={setQuery}
                style={styles.fieldInput}
              />
            </View>
          </WalletTextField>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            {CHAIN_FILTERS.map(option => (
              <Pressable
                key={option}
                style={[styles.filterChip, filter === option && styles.filterChipOn]}
                onPress={() => setFilter(option)}
              >
                {option === 'All' ? (
                  <Text style={styles.filterChipText}>All</Text>
                ) : (
                  renderCoin(option, option.slice(0, 1), 28)
                )}
              </Pressable>
            ))}
          </ScrollView>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.flowScroll}>
            <WalletPanel style={styles.tokenListCard}>
              {filtered.map((item, index) => (
                <View key={`${item.sym}-${item.chain}`} style={styles.manageRow}>
                  {renderCoin(item.sym, item.glyph)}
                  <View style={styles.tokenInfo}>
                    <View style={styles.inlineRow}>
                      <Text style={styles.tokenSymbol}>{item.sym}</Text>
                      <WalletPill style={styles.manageChainPill}>
                        <Text style={styles.manageChainText}>{item.chain}</Text>
                      </WalletPill>
                    </View>
                    <Text style={styles.tokenName}>{item.name}</Text>
                  </View>
                  <Switch
                    value={item.enabled}
                    thumbColor="#FFFFFF"
                    trackColor={{ false: '#27364D', true: WALLET_COLORS.signal }}
                    onValueChange={value => {
                      setItems(prev =>
                        prev.map(candidate =>
                          candidate.sym === item.sym && candidate.chain === item.chain
                            ? { ...candidate, enabled: value }
                            : candidate,
                        ),
                      );
                    }}
                  />
                  {index < filtered.length - 1 ? <View style={styles.tokenDivider} /> : null}
                </View>
              ))}
            </WalletPanel>
          </ScrollView>
        </View>
      </SafeAreaView>
    </View>
  );
};

export const AddTokenScreen: React.FC<AddTokenProps> = ({ navigation }) => {
  const [tab, setTab] = useState<'token' | 'network'>('token');
  const [address, setAddress] = useState('');
  const [name, setName] = useState('');
  const [symbol, setSymbol] = useState('');
  const [decimals, setDecimals] = useState('');
  const [networkName, setNetworkName] = useState('');
  const [rpcUrl, setRpcUrl] = useState('');

  const canSave = tab === 'token'
    ? Boolean(address && name && symbol && decimals)
    : Boolean(networkName && rpcUrl);

  return (
    <View style={screenBase.screen}>
      <SafeAreaView style={screenBase.safeArea} edges={['top', 'bottom']}>
        <WalletAuras />
        <View style={screenBase.content}>
          <WalletTopBar
            title="Import Token"
            onBack={() => navigation.goBack()}
            right={
              <View style={styles.roundIconButton}>
                <Ionicons name="information-circle-outline" size={18} color={WALLET_COLORS.textMuted} />
              </View>
            }
          />

          <View style={styles.tabSwitch}>
            {(['token', 'network'] as const).map(option => (
              <Pressable
                key={option}
                style={styles.tabSwitchItem}
                onPress={() => setTab(option)}
              >
                <Text style={[styles.tabSwitchText, tab === option && styles.tabSwitchTextOn]}>
                  {option === 'token' ? 'Token' : 'Network'}
                </Text>
                {tab === option ? <View style={styles.tabSwitchIndicator} /> : null}
              </Pressable>
            ))}
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.formScroll}>
            <WalletPanel style={styles.warningCard}>
              <View style={[styles.warningIcon, styles.warningIconAmber]}>
                <Ionicons name="warning-outline" size={14} color={WALLET_COLORS.warning} />
              </View>
              <Text style={styles.warningText}>
                Only add assets and networks you trust. A malicious RPC or fake token can mislead balances.
              </Text>
            </WalletPanel>

            {tab === 'token' ? (
              <>
                <View style={styles.fieldGroup}>
                  <WalletSectionLabel label="Network" />
                  <WalletTextField
                    left={renderCoin('ETH', 'E', 20)}
                    right={<Text style={styles.chainIdText}>Chain ID 1</Text>}
                  >
                    <Text style={styles.networkPillText}>Ethereum</Text>
                  </WalletTextField>
                </View>

                <View style={styles.fieldGroup}>
                  <WalletSectionLabel label="Contract Address" />
                  <WalletTextField
                    right={
                      <View style={styles.fieldActions}>
                        <Pressable onPress={async () => setAddress((await Clipboard.getString()).trim())}>
                          <Text style={styles.fieldActionText}>Paste</Text>
                        </Pressable>
                        <Ionicons name="scan-outline" size={18} color={WALLET_COLORS.text} />
                      </View>
                    }
                  >
                    <TextInput
                      placeholder="0x..."
                      placeholderTextColor={WALLET_COLORS.textLow}
                      value={address}
                      onChangeText={setAddress}
                      autoCapitalize="none"
                      style={styles.fieldInput}
                    />
                  </WalletTextField>
                </View>

                <View style={styles.fieldGroup}>
                  <WalletSectionLabel label="Name" />
                  <WalletTextField>
                    <TextInput
                      placeholder="Example: Pepe"
                      placeholderTextColor={WALLET_COLORS.textLow}
                      value={name}
                      onChangeText={setName}
                      style={styles.fieldInput}
                    />
                  </WalletTextField>
                </View>

                <View style={styles.fieldGroup}>
                  <WalletSectionLabel label="Ticker" />
                  <WalletTextField>
                    <TextInput
                      placeholder="PEPE"
                      placeholderTextColor={WALLET_COLORS.textLow}
                      value={symbol}
                      onChangeText={text => setSymbol(text.toUpperCase())}
                      style={styles.fieldInput}
                    />
                  </WalletTextField>
                </View>

                <View style={styles.fieldGroup}>
                  <WalletSectionLabel label="Decimals" />
                  <WalletTextField right={<Text style={styles.chainIdText}>decimals</Text>}>
                    <TextInput
                      placeholder="18"
                      placeholderTextColor={WALLET_COLORS.textLow}
                      value={decimals}
                      onChangeText={text => setDecimals(text.replace(/[^\d]/g, '').slice(0, 2))}
                      keyboardType="number-pad"
                      style={styles.fieldInput}
                    />
                  </WalletTextField>
                </View>
              </>
            ) : (
              <>
                <View style={styles.fieldGroup}>
                  <WalletSectionLabel label="Network Name" />
                  <WalletTextField>
                    <TextInput
                      placeholder="Example: Base Mainnet"
                      placeholderTextColor={WALLET_COLORS.textLow}
                      value={networkName}
                      onChangeText={setNetworkName}
                      style={styles.fieldInput}
                    />
                  </WalletTextField>
                </View>
                <View style={styles.fieldGroup}>
                  <WalletSectionLabel label="RPC URL" />
                  <WalletTextField>
                    <TextInput
                      placeholder="https://..."
                      placeholderTextColor={WALLET_COLORS.textLow}
                      value={rpcUrl}
                      onChangeText={setRpcUrl}
                      autoCapitalize="none"
                      style={styles.fieldInput}
                    />
                  </WalletTextField>
                </View>
                <View style={styles.fieldGroup}>
                  <WalletSectionLabel label="Chain ID" />
                  <WalletTextField>
                    <TextInput
                      placeholder="8453"
                      placeholderTextColor={WALLET_COLORS.textLow}
                      style={styles.fieldInput}
                    />
                  </WalletTextField>
                </View>
              </>
            )}
          </ScrollView>

          <WalletButton label="Save" disabled={!canSave} />
        </View>
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  flowScroll: {
    paddingBottom: 24,
    gap: 14,
  },
  formScroll: {
    paddingVertical: 16,
    gap: 18,
  },
  searchField: {
    marginTop: 12,
  },
  searchPlaceholder: {
    color: WALLET_COLORS.textSoft,
    fontSize: 13,
  },
  chipRow: {
    gap: 10,
    paddingVertical: 14,
  },
  chainChip: {
    minWidth: 56,
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  chainChipActive: {
    borderColor: WALLET_COLORS.signalBorder,
    backgroundColor: WALLET_COLORS.signalSoft,
  },
  chainChipText: {
    color: WALLET_COLORS.text,
    fontSize: 13,
    fontWeight: '700',
  },
  tokenListCard: {
    marginTop: 4,
  },
  tokenRow: {
    minHeight: 76,
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  tokenDivider: {
    position: 'absolute',
    left: 66,
    right: 12,
    bottom: 0,
    height: 1,
    backgroundColor: '#203149',
  },
  coin: {
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coinText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontFamily: DISPLAY_FONT,
  },
  tokenInfo: {
    flex: 1,
    gap: 4,
  },
  inlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  tokenSymbol: {
    color: WALLET_COLORS.text,
    fontSize: 15,
    fontWeight: '700',
  },
  tokenNetworkTag: {
    color: WALLET_COLORS.textSoft,
    fontSize: 10,
    fontWeight: '600',
    borderRadius: 6,
    backgroundColor: WALLET_COLORS.surfaceSoft,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  tokenName: {
    color: WALLET_COLORS.textSoft,
    fontSize: 12,
  },
  tokenRight: {
    alignItems: 'flex-end',
    gap: 4,
  },
  tokenValue: {
    color: WALLET_COLORS.text,
    fontSize: 14,
    fontWeight: '700',
  },
  tokenBalance: {
    color: WALLET_COLORS.textSoft,
    fontSize: 12,
  },
  fieldGroup: {
    gap: 8,
  },
  fieldInput: {
    flex: 1,
    color: WALLET_COLORS.text,
    fontSize: 14,
    padding: 0,
  },
  fieldInputLarge: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  fieldActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  fieldActionText: {
    color: WALLET_COLORS.signal,
    fontSize: 13,
    fontWeight: '700',
  },
  networkPill: {
    minHeight: 54,
    paddingHorizontal: 12,
    gap: 10,
  },
  networkPillText: {
    flex: 1,
    color: WALLET_COLORS.text,
    fontSize: 15,
    fontWeight: '600',
  },
  amountTag: {
    minHeight: 30,
    paddingHorizontal: 10,
    backgroundColor: WALLET_COLORS.surfaceSoft,
  },
  amountTagText: {
    color: WALLET_COLORS.textMuted,
    fontFamily: MONO_FONT,
    fontSize: 11,
  },
  approxText: {
    color: WALLET_COLORS.textSoft,
    fontSize: 12,
    marginTop: 4,
  },
  roundIconButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: WALLET_COLORS.border,
    backgroundColor: WALLET_COLORS.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  warningCard: {
    padding: 14,
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
  warningIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: WALLET_COLORS.signalSoft,
  },
  warningIconAmber: {
    backgroundColor: WALLET_COLORS.warningSoft,
  },
  warningText: {
    flex: 1,
    color: WALLET_COLORS.textMuted,
    fontSize: 12.5,
    lineHeight: 18,
  },
  warningStrong: {
    color: WALLET_COLORS.text,
    fontWeight: '700',
  },
  receiveScroll: {
    paddingVertical: 16,
    gap: 18,
  },
  receiveCoinHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  receiveCoinText: {
    color: WALLET_COLORS.text,
    fontSize: 24,
    fontWeight: '800',
    fontFamily: DISPLAY_FONT,
  },
  receiveBadge: {
    minHeight: 28,
    paddingHorizontal: 10,
    backgroundColor: WALLET_COLORS.surfaceSoft,
  },
  receiveBadgeText: {
    color: WALLET_COLORS.textMuted,
    fontSize: 11,
    fontWeight: '600',
  },
  qrCard: {
    padding: 18,
    alignItems: 'center',
    gap: 16,
  },
  qrMock: {
    width: 238,
    height: 238,
    borderRadius: 22,
    backgroundColor: '#F2F5FA',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  qrCornerTL: {
    position: 'absolute',
    top: 16,
    left: 16,
    width: 42,
    height: 42,
    borderTopWidth: 8,
    borderLeftWidth: 8,
    borderColor: '#0E1726',
    borderTopLeftRadius: 16,
  },
  qrCornerTR: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 42,
    height: 42,
    borderTopWidth: 8,
    borderRightWidth: 8,
    borderColor: '#0E1726',
    borderTopRightRadius: 16,
  },
  qrCornerBL: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    width: 42,
    height: 42,
    borderBottomWidth: 8,
    borderLeftWidth: 8,
    borderColor: '#0E1726',
    borderBottomLeftRadius: 16,
  },
  qrBrand: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#0E1726',
    alignItems: 'center',
    justifyContent: 'center',
  },
  receiveAddress: {
    color: WALLET_COLORS.text,
    fontFamily: MONO_FONT,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 20,
  },
  receiveActions: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 18,
  },
  receiveAction: {
    alignItems: 'center',
    gap: 8,
  },
  receiveActionIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: WALLET_COLORS.border,
    backgroundColor: WALLET_COLORS.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  receiveActionLabel: {
    color: WALLET_COLORS.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  touchBody: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 32,
  },
  scanFlag: {
    minHeight: 30,
    paddingHorizontal: 12,
    gap: 8,
    backgroundColor: WALLET_COLORS.signalSoft,
    borderColor: WALLET_COLORS.signalBorder,
  },
  scanFlagDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: WALLET_COLORS.signal,
  },
  scanFlagText: {
    color: '#8CD0FF',
    fontFamily: MONO_FONT,
    fontSize: 10,
    textTransform: 'uppercase',
  },
  touchStage: {
    width: 260,
    height: 260,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 32,
    marginBottom: 26,
  },
  touchRingOne: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    borderWidth: 1,
    borderColor: 'rgba(79, 180, 255, 0.12)',
  },
  touchRingTwo: {
    position: 'absolute',
    width: 170,
    height: 170,
    borderRadius: 85,
    borderWidth: 1,
    borderColor: 'rgba(79, 180, 255, 0.2)',
  },
  touchRingThree: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 1,
    borderColor: 'rgba(79, 180, 255, 0.32)',
  },
  touchCore: {
    width: 92,
    height: 92,
    borderRadius: 46,
    borderWidth: 1,
    borderColor: WALLET_COLORS.signalBorder,
    backgroundColor: WALLET_COLORS.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  touchTitle: {
    color: WALLET_COLORS.text,
    fontSize: 26,
    lineHeight: 30,
    fontWeight: '800',
    textAlign: 'center',
    fontFamily: DISPLAY_FONT,
    letterSpacing: -0.6,
  },
  touchBodyText: {
    color: WALLET_COLORS.textMuted,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: 12,
    paddingHorizontal: 18,
  },
  touchMeta: {
    marginTop: 18,
    minHeight: 34,
    paddingHorizontal: 14,
    gap: 8,
  },
  touchMetaText: {
    color: WALLET_COLORS.textMuted,
    fontSize: 11,
    fontFamily: MONO_FONT,
  },
  touchMetaSep: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: WALLET_COLORS.textLow,
  },
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
  filterChip: {
    minWidth: 56,
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: WALLET_COLORS.border,
    backgroundColor: WALLET_COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  filterChipOn: {
    borderColor: WALLET_COLORS.signalBorder,
    backgroundColor: WALLET_COLORS.signalSoft,
  },
  filterChipText: {
    color: WALLET_COLORS.text,
    fontSize: 13,
    fontWeight: '700',
  },
  manageRow: {
    minHeight: 76,
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  manageChainPill: {
    minHeight: 22,
    paddingHorizontal: 8,
    backgroundColor: WALLET_COLORS.surfaceSoft,
  },
  manageChainText: {
    color: WALLET_COLORS.textMuted,
    fontSize: 10,
  },
  tabSwitch: {
    flexDirection: 'row',
    marginTop: 12,
    borderBottomWidth: 1,
    borderBottomColor: WALLET_COLORS.border,
  },
  tabSwitchItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 14,
    gap: 8,
  },
  tabSwitchText: {
    color: WALLET_COLORS.textSoft,
    fontSize: 15,
    fontWeight: '700',
  },
  tabSwitchTextOn: {
    color: WALLET_COLORS.text,
  },
  tabSwitchIndicator: {
    height: 3,
    width: 80,
    borderRadius: 999,
    backgroundColor: WALLET_COLORS.signal,
  },
  chainIdText: {
    color: WALLET_COLORS.textSoft,
    fontFamily: MONO_FONT,
    fontSize: 11,
  },
});
