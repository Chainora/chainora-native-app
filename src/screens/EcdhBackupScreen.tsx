import React, { useCallback, useMemo, useState } from 'react';
import { ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PinInput } from '../components/ui/PinInput';
import { PinGhostButton, PinNoteCard } from '../components/ui/pinTheme';
import {
  DISPLAY_FONT,
  WALLET_COLORS,
  WalletAuras,
  WalletButton,
  WalletHeroCard,
  WalletPanel,
  WalletSectionLabel,
  WalletTopBar,
  buildWalletScreenStyles,
} from '../components/ui/walletDesign';
import { useNfcEnabled } from '../features/nfc/hooks/useNfcEnabled';
import { useSettings } from '../features/settings';
import { useToast } from '../features/toast';
import type { RootStackParamList } from '../navigation/routes/rootStackParamList';
import { ROUTES } from '../navigation/routes/routes';
import {
  initialisePinAndPrepareBackupDestination,
  performBackupExport,
  performBackupImport,
  signInWallet,
  type WalletActionResult,
} from '../services/cardService';
import { registerScanCardFlow } from '../services/scanCardFlowRegistry';

type Props = NativeStackScreenProps<RootStackParamList, typeof ROUTES.EcdhBackup>;
type StageKey = 'intro' | 'tap1' | 'tap2' | 'tap3' | 'tap4' | 'success';

const PIN_LENGTH = 4;
const screenBase = buildWalletScreenStyles();

const formatFailure = (message: string, statusWord?: string) =>
  statusWord ? `${message} (SW: ${statusWord})` : message;

const roleKeyByStage: Record<'tap1' | 'tap2' | 'tap3' | 'tap4', 'ecdhRoleMainCard' | 'ecdhRoleBackupCard'> = {
  tap1: 'ecdhRoleMainCard',
  tap2: 'ecdhRoleBackupCard',
  tap3: 'ecdhRoleMainCard',
  tap4: 'ecdhRoleBackupCard',
};

const EcdhBackupScreen: React.FC<Props> = ({ navigation }) => {
  const { isEnabled } = useNfcEnabled();
  const { resolvedTheme, t } = useSettings();
  const { showToast } = useToast();

  const [stage, setStage] = useState<StageKey>('intro');
  const [mainPin, setMainPin] = useState('');
  const [secondaryPin, setSecondaryPin] = useState('');
  const [statusMessage, setStatusMessage] = useState(t('ecdhInitialStatus'));
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [destCert, setDestCert] = useState<Uint8Array | null>(null);
  const [destLinkProof, setDestLinkProof] = useState<Uint8Array | null>(null);
  const [sourceCert, setSourceCert] = useState<Uint8Array | null>(null);
  const [sourceLinkProof, setSourceLinkProof] = useState<Uint8Array | null>(null);
  const [envelope, setEnvelope] = useState<Uint8Array | null>(null);

  const stages = useMemo(
    () => ({
      tap1: {
        step: 1,
        title: 'Tap main card to unlock',
        subtitle: 'Enter the main card PIN, then hold the card still for 2-3 seconds.',
        role: 'MAIN CARD',
        needsPin: true,
        pinValue: mainPin,
        setPinValue: setMainPin,
        trail: ['Read card', 'Verify PIN', 'Ready'],
      },
      tap2: {
        step: 2,
        title: 'Tap backup card to prepare',
        subtitle: 'The backup card creates its own key and proves it is ready for import.',
        role: 'BACKUP CARD',
        needsPin: true,
        pinValue: secondaryPin,
        setPinValue: setSecondaryPin,
        trail: ['Read card', 'Create key', 'Verify'],
      },
      tap3: {
        step: 3,
        title: 'Tap main card again to export',
        subtitle: 'The main card seals the wallet payload so only the prepared backup card can open it.',
        role: 'MAIN CARD',
        needsPin: false,
        pinValue: mainPin,
        setPinValue: setMainPin,
        trail: ['Seal wallet', 'Encrypt', 'Transfer'],
      },
      tap4: {
        step: 4,
        title: 'Final tap on the backup card',
        subtitle: 'The backup card opens the package on-chip and stores the recovery copy safely.',
        role: 'BACKUP CARD',
        needsPin: false,
        pinValue: secondaryPin,
        setPinValue: setSecondaryPin,
        trail: ['Receive', 'Check', 'Store'],
      },
    }),
    [mainPin, secondaryPin],
  );

  const progressStage = stage === 'success' ? 4 : stage === 'intro' ? 0 : stages[stage].step;
  const currentTap = stage === 'intro' || stage === 'success' ? null : stages[stage];
  const canAdvance =
    !currentTap || !currentTap.needsPin || currentTap.pinValue.length === PIN_LENGTH;

  const executeCurrentTap = useCallback(async (): Promise<WalletActionResult> => {
    if (stage === 'tap1') {
      return signInWallet(mainPin);
    }

    if (stage === 'tap2') {
      const result = await initialisePinAndPrepareBackupDestination(secondaryPin);
      if (result.ok && result.deviceCert && result.linkProof) {
        setDestCert(result.deviceCert);
        setDestLinkProof(result.linkProof);
      }
      return result;
    }

    if (stage === 'tap3') {
      if (!destCert || !destLinkProof) {
        return {
          ok: false,
          message: t('ecdhMissingDestination'),
          code: 'BACKUP_EXPORT_FAILED',
        };
      }

      const result = await performBackupExport(mainPin, destCert, destLinkProof);
      if (result.ok && result.envelope && result.sourceCert && result.sourceLinkProof) {
        setEnvelope(result.envelope);
        setSourceCert(result.sourceCert);
        setSourceLinkProof(result.sourceLinkProof);
      }
      return result;
    }

    if (!sourceCert || !sourceLinkProof || !envelope) {
      return {
        ok: false,
        message: t('ecdhMissingSource'),
        code: 'BACKUP_IMPORT_FAILED',
      };
    }

    return performBackupImport(secondaryPin, sourceCert, sourceLinkProof, envelope);
  }, [destCert, destLinkProof, envelope, mainPin, secondaryPin, sourceCert, sourceLinkProof, stage, t]);

  const handleDigit = useCallback(
    (digit: string) => {
      if (!currentTap?.needsPin) {
        return;
      }
      currentTap.setPinValue(prev => (prev.length >= PIN_LENGTH ? prev : `${prev}${digit}`));
      setErrorMessage(null);
    },
    [currentTap],
  );

  const handleBackspace = useCallback(() => {
    if (!currentTap?.needsPin) {
      return;
    }
    currentTap.setPinValue(prev => prev.slice(0, -1));
    setErrorMessage(null);
  }, [currentTap]);

  const openNextStage = useCallback(() => {
    if (stage === 'intro') {
      setStage('tap1');
      setErrorMessage(null);
      setStatusMessage('Tap 1 of 4. Unlock the main card.');
      return;
    }

    if (!currentTap) {
      navigation.goBack();
      return;
    }

    if (currentTap.needsPin && currentTap.pinValue.length !== PIN_LENGTH) {
      setErrorMessage(t('ecdhPinLengthError'));
      return;
    }

    setErrorMessage(null);
    const flowId = registerScanCardFlow({
      isNfcEnabled: isEnabled,
      onShowToast: showToast,
      initialMode: 'signin',
      prefilledPin: currentTap.pinValue,
      flowType: 'flow',
      onFlowScan: executeCurrentTap,
      onSuccess: ({ result }: { result: WalletActionResult }) => {
        if (!result.ok) {
          setErrorMessage(formatFailure(result.message, result.statusWord));
          navigation.goBack();
          return;
        }

        setErrorMessage(null);

        if (stage === 'tap1') {
          setStage('tap2');
          setStatusMessage('Tap 2 of 4. Prepare the backup card.');
          navigation.goBack();
          return;
        }
        if (stage === 'tap2') {
          setStage('tap3');
          setStatusMessage('Tap 3 of 4. Export from the main card.');
          navigation.goBack();
          return;
        }
        if (stage === 'tap3') {
          setStage('tap4');
          setStatusMessage('Tap 4 of 4. Import on the backup card.');
          navigation.goBack();
          return;
        }

        setStage('success');
        setStatusMessage(t('ecdhImportCompleted'));
        navigation.goBack();
      },
    });
    navigation.navigate(ROUTES.ScanCard, { flowId });
  }, [currentTap, navigation, stage, t]);

  return (
    <View style={screenBase.screen}>
      <StatusBar
        barStyle={resolvedTheme === 'light' ? 'dark-content' : 'light-content'}
        backgroundColor={WALLET_COLORS.background}
      />
      <SafeAreaView style={screenBase.safeArea} edges={['top', 'bottom']}>
        <WalletAuras />
        <View style={screenBase.content}>
          <WalletTopBar title={stage === 'success' ? 'Backup Complete' : t('headerEcdhTitle')} onBack={() => navigation.goBack()} />

          {stage === 'intro' ? (
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
              <Text style={styles.kicker}>SECURE BACKUP · 4 TAPS</Text>
              <Text style={styles.introTitle}>Backup your card in four taps.</Text>
              <Text style={styles.introSubtitle}>
                Private keys never leave the cards. Your phone only relays sealed data from the main card to the backup card.
              </Text>

              <View style={styles.cardsRow}>
                <WalletHeroCard addressText="Main card" style={styles.heroHalf} />
                <WalletHeroCard addressText="Backup card" style={styles.heroHalf} />
              </View>

              <WalletPanel style={styles.timelineCard}>
                {[
                  { step: '1', title: 'Unlock main card', subtitle: 'Main card PIN + tap' },
                  { step: '2', title: 'Prepare backup card', subtitle: 'Backup card PIN + tap' },
                  { step: '3', title: 'Export sealed backup', subtitle: 'Main card tap again' },
                  { step: '4', title: 'Import sealed backup', subtitle: 'Final backup card tap' },
                ].map(item => (
                  <View key={item.step} style={styles.timelineRow}>
                    <View style={styles.timelineBullet}>
                      <Text style={styles.timelineBulletText}>{item.step}</Text>
                    </View>
                    <View style={styles.timelineBody}>
                      <Text style={styles.timelineTitle}>{item.title}</Text>
                      <Text style={styles.timelineSubtitle}>{item.subtitle}</Text>
                    </View>
                  </View>
                ))}
              </WalletPanel>

              <WalletPanel style={styles.noteCard}>
                <Ionicons name="lock-closed-outline" size={16} color={WALLET_COLORS.signal} />
                <Text style={styles.noteText}>
                  Keep both cards near you. If the flow is interrupted, the transfer package is discarded automatically.
                </Text>
              </WalletPanel>

              <View style={styles.actions}>
                <WalletButton label="Start Backup" onPress={openNextStage} />
                <WalletButton label="I don't have a backup card yet" variant="secondary" onPress={() => navigation.goBack()} />
              </View>
            </ScrollView>
          ) : stage === 'success' ? (
            <View style={styles.successWrap}>
              <View style={styles.progressRow}>
                {[1, 2, 3, 4].map(index => (
                  <View key={index} style={[styles.progressSegment, styles.progressSegmentDone]} />
                ))}
              </View>

              <View style={styles.successMark}>
                <Ionicons name="checkmark" size={38} color={WALLET_COLORS.success} />
              </View>
              <Text style={styles.successTitle}>Both cards now unlock the same wallet.</Text>
              <Text style={styles.successBody}>
                Keep the backup card somewhere safe. Your main card can travel with you; the backup card should stay offline and protected.
              </Text>

              <WalletPanel style={styles.pairCard}>
                <View style={styles.pairRow}>
                  <View style={styles.pairSwatch}>
                    <Text style={styles.pairSwatchText}>M</Text>
                  </View>
                  <View style={styles.pairText}>
                    <Text style={styles.pairTitle}>Main card</Text>
                    <Text style={styles.pairSubtitle}>Carry with you</Text>
                  </View>
                  <Ionicons name="checkmark-circle" size={18} color={WALLET_COLORS.success} />
                </View>
                <View style={styles.pairDivider} />
                <View style={styles.pairRow}>
                  <View style={styles.pairSwatch}>
                    <Text style={styles.pairSwatchText}>B</Text>
                  </View>
                  <View style={styles.pairText}>
                    <Text style={styles.pairTitle}>Backup card</Text>
                    <Text style={styles.pairSubtitle}>Store in a safe place</Text>
                  </View>
                  <Ionicons name="checkmark-circle" size={18} color={WALLET_COLORS.success} />
                </View>
              </WalletPanel>

              <View style={styles.actions}>
                <WalletButton label={t('commonDone')} onPress={() => navigation.goBack()} />
              </View>
            </View>
          ) : (
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
              {!currentTap?.needsPin ? (
                <>
                  <View style={styles.progressRow}>
                    {[1, 2, 3, 4].map(index => (
                  <View
                    key={index}
                    style={[
                      styles.progressSegment,
                      progressStage >= index && styles.progressSegmentDone,
                      progressStage === index && styles.progressSegmentActive,
                    ]}
                  />
                    ))}
                  </View>

              <WalletSectionLabel label={`Tap ${currentTap?.step}/4 · ${currentTap?.role}`} />
              <View style={styles.tapHero}>
                <View style={styles.tapIcon}>
                  <Ionicons name="wifi-outline" size={34} color={WALLET_COLORS.signal} />
                </View>
                <Text style={styles.tapTitle}>{currentTap?.title}</Text>
                <Text style={styles.tapSubtitle}>{currentTap?.subtitle}</Text>
              </View>
            </>
          ) : null}

              {currentTap?.needsPin ? (
                <PinInput
                  value={currentTap.pinValue}
                  onDigit={handleDigit}
                  onBackspace={handleBackspace}
                  onSubmit={openNextStage}
                  submitDisabled={!canAdvance}
                  title={currentTap.title}
                  subtitle={currentTap.subtitle}
                  ctaLabel={t('ecdhPrimaryAction')}
                  heroIconName="wifi-outline"
                  progressCurrent={currentTap.step}
                  progressTotal={4}
                  progressLabel={`${t('commonStep')} ${currentTap.step}/4`}
                  supportingText={statusMessage}
                  errorMessage={errorMessage}
                  contentSlot={
                    <View style={styles.roleChipWrap}>
                      <View style={styles.roleChip}>
                        <Text style={styles.roleChipText}>
                          {t(roleKeyByStage[stage as 'tap1' | 'tap2' | 'tap3' | 'tap4'])}
                        </Text>
                      </View>
                    </View>
                  }
                  footerSlot={
                    <WalletPanel style={styles.trailCard}>
                      {currentTap.trail.map(segment => (
                        <View key={segment} style={styles.trailItem}>
                          <View style={styles.trailDot} />
                          <Text style={styles.trailText}>{segment}</Text>
                        </View>
                      ))}
                    </WalletPanel>
                  }
                  afterActionSlot={
                    <>
                      <PinNoteCard text={t('ecdhPinFooterNote')} iconName="card-outline" />
                      <PinGhostButton label={t('ecdhCancelAction')} onPress={() => navigation.goBack()} />
                    </>
                  }
                />
              ) : (
                <WalletPanel style={styles.scanCard}>
                  <View style={styles.scanTarget}>
                    <View style={styles.scanRingOne} />
                    <View style={styles.scanRingTwo} />
                    <View style={styles.scanRingThree} />
                    <View style={styles.scanCore}>
                      <Ionicons name="card-outline" size={28} color={WALLET_COLORS.text} />
                    </View>
                  </View>
                  <Text style={styles.scanTitle}>Hold the card near the back of the phone</Text>
                  <Text style={styles.scanSubtitle}>Keep it steady while the encrypted backup transfer completes.</Text>
                </WalletPanel>
              )}

              {!currentTap?.needsPin ? (
                <>
                  <WalletPanel style={styles.trailCard}>
                    {currentTap?.trail.map(segment => (
                      <View key={segment} style={styles.trailItem}>
                        <View style={styles.trailDot} />
                        <Text style={styles.trailText}>{segment}</Text>
                      </View>
                    ))}
                  </WalletPanel>

                  <Text style={styles.statusText}>{statusMessage}</Text>
                  <Text style={styles.errorText}>{errorMessage || ' '}</Text>

                  <View style={styles.actions}>
                    <WalletButton
                      label="Continue With NFC"
                      onPress={openNextStage}
                      disabled={!canAdvance}
                    />
                    <WalletButton label="Cancel Backup" variant="ghost" onPress={() => navigation.goBack()} />
                  </View>
                </>
              ) : null}
            </ScrollView>
          )}
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
  kicker: {
    color: '#62BBFF',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.4,
  },
  introTitle: {
    color: WALLET_COLORS.text,
    fontSize: 32,
    lineHeight: 36,
    fontWeight: '800',
    fontFamily: DISPLAY_FONT,
    letterSpacing: -0.8,
  },
  introSubtitle: {
    color: WALLET_COLORS.textMuted,
    fontSize: 14,
    lineHeight: 21,
  },
  cardsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  heroHalf: {
    flex: 1,
  },
  timelineCard: {
    padding: 14,
    gap: 12,
  },
  timelineRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  timelineBullet: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: WALLET_COLORS.signalSoft,
    borderWidth: 1,
    borderColor: WALLET_COLORS.signalBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timelineBulletText: {
    color: WALLET_COLORS.text,
    fontSize: 12,
    fontWeight: '700',
  },
  timelineBody: {
    flex: 1,
    gap: 3,
  },
  timelineTitle: {
    color: WALLET_COLORS.text,
    fontSize: 14,
    fontWeight: '700',
  },
  timelineSubtitle: {
    color: WALLET_COLORS.textSoft,
    fontSize: 12,
  },
  noteCard: {
    padding: 14,
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
  },
  noteText: {
    flex: 1,
    color: WALLET_COLORS.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  actions: {
    gap: 10,
  },
  progressRow: {
    flexDirection: 'row',
    gap: 8,
  },
  progressSegment: {
    flex: 1,
    height: 4,
    borderRadius: 999,
    backgroundColor: '#1B2536',
  },
  progressSegmentDone: {
    backgroundColor: WALLET_COLORS.signal,
  },
  progressSegmentActive: {
    shadowColor: WALLET_COLORS.signal,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
  },
  tapHero: {
    alignItems: 'center',
    gap: 10,
  },
  tapIcon: {
    width: 86,
    height: 86,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: WALLET_COLORS.signalBorder,
    backgroundColor: WALLET_COLORS.signalSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tapTitle: {
    color: WALLET_COLORS.text,
    fontSize: 28,
    lineHeight: 32,
    fontWeight: '800',
    fontFamily: DISPLAY_FONT,
    letterSpacing: -0.6,
    textAlign: 'center',
  },
  tapSubtitle: {
    color: WALLET_COLORS.textMuted,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    paddingHorizontal: 12,
  },
  keypadCard: {
    paddingHorizontal: 14,
    paddingVertical: 18,
  },
  scanCard: {
    paddingVertical: 18,
    paddingHorizontal: 16,
    alignItems: 'center',
    gap: 14,
  },
  scanTarget: {
    width: 180,
    height: 180,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanRingOne: {
    position: 'absolute',
    width: 160,
    height: 160,
    borderRadius: 80,
    borderWidth: 1,
    borderColor: 'rgba(79, 180, 255, 0.14)',
  },
  scanRingTwo: {
    position: 'absolute',
    width: 124,
    height: 124,
    borderRadius: 62,
    borderWidth: 1,
    borderColor: 'rgba(79, 180, 255, 0.2)',
  },
  scanRingThree: {
    position: 'absolute',
    width: 92,
    height: 92,
    borderRadius: 46,
    borderWidth: 1,
    borderColor: 'rgba(79, 180, 255, 0.32)',
  },
  scanCore: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 1,
    borderColor: WALLET_COLORS.signalBorder,
    backgroundColor: WALLET_COLORS.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanTitle: {
    color: WALLET_COLORS.text,
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  scanSubtitle: {
    color: WALLET_COLORS.textMuted,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
  trailCard: {
    padding: 14,
    gap: 10,
  },
  trailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  trailDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: WALLET_COLORS.signal,
  },
  trailText: {
    color: WALLET_COLORS.textMuted,
    fontSize: 12,
  },
  roleChipWrap: {
    alignItems: 'center',
    marginBottom: 2,
  },
  roleChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: WALLET_COLORS.signalBorder,
    backgroundColor: WALLET_COLORS.signalSoft,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  roleChipText: {
    color: '#8CD0FF',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  statusText: {
    color: WALLET_COLORS.textSoft,
    fontSize: 12,
    textAlign: 'center',
    minHeight: 18,
  },
  errorText: {
    color: WALLET_COLORS.danger,
    fontSize: 12,
    textAlign: 'center',
    minHeight: 22,
  },
  successWrap: {
    flex: 1,
    justifyContent: 'center',
    gap: 18,
    paddingBottom: 18,
  },
  successMark: {
    width: 108,
    height: 108,
    borderRadius: 54,
    alignSelf: 'center',
    borderWidth: 1,
    borderColor: 'rgba(52, 211, 153, 0.32)',
    backgroundColor: 'rgba(52, 211, 153, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  successTitle: {
    color: WALLET_COLORS.text,
    fontSize: 30,
    lineHeight: 34,
    fontWeight: '800',
    fontFamily: DISPLAY_FONT,
    textAlign: 'center',
    letterSpacing: -0.7,
  },
  successBody: {
    color: WALLET_COLORS.textMuted,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  pairCard: {
    padding: 14,
  },
  pairRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
  },
  pairSwatch: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: WALLET_COLORS.surfaceSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pairSwatchText: {
    color: WALLET_COLORS.text,
    fontSize: 13,
    fontWeight: '700',
  },
  pairText: {
    flex: 1,
    gap: 2,
  },
  pairTitle: {
    color: WALLET_COLORS.text,
    fontSize: 14,
    fontWeight: '700',
  },
  pairSubtitle: {
    color: WALLET_COLORS.textSoft,
    fontSize: 12,
  },
  pairDivider: {
    height: 1,
    backgroundColor: '#203149',
  },
});

export default EcdhBackupScreen;
