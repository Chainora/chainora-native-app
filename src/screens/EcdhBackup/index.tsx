import React, { useCallback, useMemo, useState } from 'react';
import { StatusBar, StyleSheet, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PinInput } from '@components/ui/PinInput';
import type { ScanCardFlowSuccess, WalletActionResult } from '@app-types/wallet';
import {
  DISPLAY_FONT,
  WALLET_COLORS,
  WalletButton,
  WalletPanel,
  WalletSectionLabel,
  WalletTopBar,
  buildWalletScreenStyles,
} from '@components/ui/walletDesign';
import { useEcdhBackupActions } from '@hooks/useEcdhBackupActions';
import { useNfcEnabled } from '@hooks/useNfcEnabled';
import { useRegisterScanCardFlow } from '@hooks/useScanCardFlowConfig';
import { useSettings } from '@hooks/useSettings';
import { useToast } from '@hooks/useToast';
import type { RootStackParamList } from '@navigation/routes/rootStackParamList';
import { ROUTES } from '@navigation/routes/routes';

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

type TapStageKey = keyof typeof roleKeyByStage;

const EcdhBackupScreen: React.FC<Props> = ({ navigation }) => {
  const { isEnabled } = useNfcEnabled();
  const { resolvedTheme, t } = useSettings();
  const { showToast } = useToast();
  const registerScanCardFlow = useRegisterScanCardFlow();
  const ecdhBackupActions = useEcdhBackupActions();

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

  const introTimeline = useMemo(
    () => [
      { step: '1', title: t('ecdhIntroTimeline1Title'), subtitle: t('ecdhIntroTimeline1Subtitle') },
      { step: '2', title: t('ecdhIntroTimeline2Title'), subtitle: t('ecdhIntroTimeline2Subtitle') },
      { step: '3', title: t('ecdhIntroTimeline3Title'), subtitle: t('ecdhIntroTimeline3Subtitle') },
      { step: '4', title: t('ecdhIntroTimeline4Title'), subtitle: t('ecdhIntroTimeline4Subtitle') },
    ],
    [t],
  );

  const stages = useMemo(
    () => ({
      tap1: {
        step: 1,
        title: t('ecdhTap1Title'),
        subtitle: t('ecdhTap1Subtitle'),
        needsPin: true,
        pinValue: mainPin,
        setPinValue: setMainPin,
        trail: [t('ecdhTrailReadCard'), t('ecdhTrailVerifyPin'), t('ecdhTrailReady')],
      },
      tap2: {
        step: 2,
        title: t('ecdhTap2Title'),
        subtitle: t('ecdhTap2Subtitle'),
        needsPin: true,
        pinValue: secondaryPin,
        setPinValue: setSecondaryPin,
        trail: [t('ecdhTrailReadCard'), t('ecdhTrailCreateKey'), t('ecdhTrailVerify')],
      },
      tap3: {
        step: 3,
        title: t('ecdhTap3Title'),
        subtitle: t('ecdhTap3Subtitle'),
        needsPin: false,
        pinValue: mainPin,
        setPinValue: setMainPin,
        trail: [t('ecdhTrailSealWallet'), t('ecdhTrailEncrypt'), t('ecdhTrailTransfer')],
      },
      tap4: {
        step: 4,
        title: t('ecdhTap4Title'),
        subtitle: t('ecdhTap4Subtitle'),
        needsPin: false,
        pinValue: secondaryPin,
        setPinValue: setSecondaryPin,
        trail: [t('ecdhTrailReceive'), t('ecdhTrailCheck'), t('ecdhTrailStore')],
      },
    }),
    [mainPin, secondaryPin, t],
  );

  const progressStage = stage === 'success' ? 4 : stage === 'intro' ? 0 : stages[stage].step;
  const currentTap = stage === 'intro' || stage === 'success' ? null : stages[stage];
  const canAdvance = !currentTap || !currentTap.needsPin || currentTap.pinValue.length === PIN_LENGTH;

  const executeCurrentTap = useCallback(async (): Promise<WalletActionResult> => {
    if (stage === 'tap1') {
      return ecdhBackupActions.signInWallet(mainPin);
    }

    if (stage === 'tap2') {
      const result = await ecdhBackupActions.initialisePinAndPrepareBackupDestination(secondaryPin);
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

      const result = await ecdhBackupActions.performBackupExport(mainPin, destCert, destLinkProof);
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

    return ecdhBackupActions.performBackupImport(secondaryPin, sourceCert, sourceLinkProof, envelope);
  }, [destCert, destLinkProof, ecdhBackupActions, envelope, mainPin, secondaryPin, sourceCert, sourceLinkProof, stage, t]);

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
      setStatusMessage(t('ecdhStatusTap1'));
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
      onSuccess: ({ result }: ScanCardFlowSuccess) => {
        if (!result.ok) {
          setErrorMessage(formatFailure(result.message, result.statusWord));
          navigation.goBack();
          return;
        }

        setErrorMessage(null);

        if (stage === 'tap1') {
          setStage('tap2');
          setStatusMessage(t('ecdhStatusTap2'));
          navigation.goBack();
          return;
        }
        if (stage === 'tap2') {
          setStage('tap3');
          setStatusMessage(t('ecdhStatusTap3'));
          navigation.goBack();
          return;
        }
        if (stage === 'tap3') {
          setStage('tap4');
          setStatusMessage(t('ecdhStatusTap4'));
          navigation.goBack();
          return;
        }

        setStage('success');
        setStatusMessage(t('ecdhImportCompleted'));
        navigation.goBack();
      },
    });
    navigation.navigate(ROUTES.ScanCard, { flowId });
  }, [currentTap, executeCurrentTap, isEnabled, navigation, registerScanCardFlow, showToast, stage, t]);

  return (
    <View style={screenBase.screen}>
      <StatusBar
        barStyle={resolvedTheme === 'light' ? 'dark-content' : 'light-content'}
        backgroundColor={WALLET_COLORS.background}
      />
      <SafeAreaView style={screenBase.safeArea} edges={['top', 'bottom']}>
        <View style={screenBase.content}>
          <WalletTopBar
            title={stage === 'success' ? t('ecdhBackupDoneTitle') : t('headerEcdhTitle')}
            onBack={() => navigation.goBack()}
          />

          <View style={styles.stageRoot}>
            {stage === 'intro' ? (
              <View style={styles.introStage}>
                <View style={styles.introBody}>
                  <Text style={styles.kicker}>{t('ecdhIntroKicker')}</Text>
                  <Text style={styles.introTitle}>{t('ecdhIntroTitle')}</Text>
                  <Text style={styles.introSubtitle}>{t('ecdhIntroSubtitle')}</Text>

                  <WalletPanel style={styles.deviceCard}>
                    <Text style={styles.deviceCardTitle}>{t('ecdhIntroCardsTitle')}</Text>
                    <Text style={styles.deviceCardBody}>{t('ecdhIntroCardsBody')}</Text>
                  </WalletPanel>

                  <WalletPanel style={styles.timelineCard}>
                    {introTimeline.map(item => (
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
                    <Text style={styles.noteText}>{t('ecdhIntroNote')}</Text>
                  </WalletPanel>
                </View>

                <View style={styles.actions}>
                  <WalletButton label={t('ecdhIntroStart')} onPress={openNextStage} />
                </View>
              </View>
            ) : stage === 'success' ? (
              <View style={styles.successWrap}>
                <View style={styles.successSummary}>
                  <View style={styles.progressRow}>
                    {[1, 2, 3, 4].map(index => (
                      <View key={index} style={[styles.progressSegment, styles.progressSegmentDone]} />
                    ))}
                  </View>

                  <View style={styles.successMark}>
                    <Ionicons name="checkmark" size={34} color={WALLET_COLORS.success} />
                  </View>
                  <Text style={styles.successTitle}>{t('ecdhSuccessTitle')}</Text>
                  <Text style={styles.successBody}>{t('ecdhSuccessBody')}</Text>

                  <WalletPanel style={styles.pairCard}>
                    <View style={styles.pairRow}>
                      <View style={styles.pairSwatch}>
                        <Text style={styles.pairSwatchText}>M</Text>
                      </View>
                      <View style={styles.pairText}>
                        <Text style={styles.pairTitle}>{t('ecdhRoleMainCard')}</Text>
                        <Text style={styles.pairSubtitle}>{t('ecdhSuccessMainCarry')}</Text>
                      </View>
                      <Ionicons name="checkmark" size={16} color={WALLET_COLORS.success} />
                    </View>
                    <View style={styles.pairDivider} />
                    <View style={styles.pairRow}>
                      <View style={styles.pairSwatch}>
                        <Text style={styles.pairSwatchText}>B</Text>
                      </View>
                      <View style={styles.pairText}>
                        <Text style={styles.pairTitle}>{t('ecdhRoleBackupCard')}</Text>
                        <Text style={styles.pairSubtitle}>{t('ecdhSuccessBackupStore')}</Text>
                      </View>
                      <Ionicons name="checkmark" size={16} color={WALLET_COLORS.success} />
                    </View>
                  </WalletPanel>
                </View>

                <View style={styles.actions}>
                  <WalletButton label={t('commonDone')} onPress={() => navigation.goBack()} />
                </View>
              </View>
            ) : currentTap ? (
              currentTap.needsPin ? (
                <PinInput
                  style={styles.pinStageInput}
                  value={currentTap.pinValue}
                  onDigit={handleDigit}
                  onBackspace={handleBackspace}
                  onSubmit={openNextStage}
                  submitDisabled={!canAdvance}
                  title={currentTap.title}
                  subtitle={currentTap.subtitle}
                  ctaLabel={t('ecdhPrimaryAction')}
                  showHero={false}
                  squareIndicators
                  heroIconName="wifi-outline"
                  progressCurrent={currentTap.step}
                  progressTotal={4}
                  progressLabel={`${t('commonStep')} ${currentTap.step}/4`}
                  supportingText={statusMessage}
                  errorMessage={errorMessage}
                  contentSlot={
                    <View style={styles.roleChipWrap}>
                      <View style={styles.roleChip}>
                        <Text style={styles.roleChipText}>{t(roleKeyByStage[stage as TapStageKey])}</Text>
                      </View>
                    </View>
                  }
                  afterActionSlot={(
                    <WalletPanel style={styles.pinHintCard}>
                      <Text style={styles.pinHintText}>{t('ecdhPinFooterNote')}</Text>
                    </WalletPanel>
                  )}
                />
              ) : (
                <View style={styles.tapStage}>
                  <View style={styles.tapDetails}>
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

                    <WalletSectionLabel
                      label={`${t('ecdhTapLabel')} ${currentTap.step}/4 - ${t(roleKeyByStage[stage as TapStageKey])}`}
                    />
                    <View style={styles.tapHero}>
                      <View style={styles.tapIcon}>
                        <Ionicons name="wifi-outline" size={32} color={WALLET_COLORS.signal} />
                      </View>
                      <Text style={styles.tapTitle}>{currentTap.title}</Text>
                      <Text style={styles.tapSubtitle}>{currentTap.subtitle}</Text>
                    </View>

                    <WalletPanel style={styles.scanCard}>
                      <View style={styles.scanCore}>
                        <Ionicons name="card-outline" size={24} color={WALLET_COLORS.text} />
                      </View>
                      <Text style={styles.scanTitle}>{t('ecdhScanTitle')}</Text>
                      <Text style={styles.scanSubtitle}>{t('ecdhScanSubtitle')}</Text>
                    </WalletPanel>

                    <WalletPanel style={styles.trailCard}>
                      {currentTap.trail.map(segment => (
                        <View key={segment} style={styles.trailItem}>
                          <View style={styles.trailDot} />
                          <Text style={styles.trailText}>{segment}</Text>
                        </View>
                      ))}
                    </WalletPanel>

                    <Text style={styles.statusText}>{statusMessage}</Text>
                    <Text style={styles.errorText}>{errorMessage || ' '}</Text>
                  </View>

                  <View style={styles.actions}>
                    <WalletButton
                      label={t('ecdhScanContinue')}
                      onPress={openNextStage}
                      disabled={!canAdvance}
                    />
                  </View>
                </View>
              )
            ) : null}
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  stageRoot: {
    flex: 1,
    paddingTop: 12,
  },
  introStage: {
    flex: 1,
    justifyContent: 'space-between',
    gap: 10,
  },
  introBody: {
    gap: 10,
  },
  kicker: {
    color: '#62BBFF',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  introTitle: {
    color: WALLET_COLORS.text,
    fontSize: 28,
    lineHeight: 32,
    fontWeight: '800',
    fontFamily: DISPLAY_FONT,
    letterSpacing: -0.7,
  },
  introSubtitle: {
    color: WALLET_COLORS.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  deviceCard: {
    padding: 12,
    gap: 6,
  },
  deviceCardTitle: {
    color: WALLET_COLORS.text,
    fontSize: 13,
    fontWeight: '700',
  },
  deviceCardBody: {
    color: WALLET_COLORS.textSoft,
    fontSize: 12,
    lineHeight: 17,
  },
  timelineCard: {
    padding: 12,
    gap: 8,
  },
  timelineRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  timelineBullet: {
    width: 24,
    height: 24,
    borderRadius: 7,
    backgroundColor: WALLET_COLORS.surfaceSoft,
    borderWidth: 1,
    borderColor: WALLET_COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timelineBulletText: {
    color: WALLET_COLORS.text,
    fontSize: 11,
    fontWeight: '700',
  },
  timelineBody: {
    flex: 1,
    gap: 2,
  },
  timelineTitle: {
    color: WALLET_COLORS.text,
    fontSize: 13,
    fontWeight: '700',
  },
  timelineSubtitle: {
    color: WALLET_COLORS.textSoft,
    fontSize: 11,
  },
  noteCard: {
    padding: 10,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
  },
  noteText: {
    flex: 1,
    color: WALLET_COLORS.textMuted,
    fontSize: 11,
    lineHeight: 16,
  },
  actions: {
    gap: 8,
  },
  pinStageInput: {
    flex: 1,
    paddingTop: 10,
    paddingBottom: 4,
  },
  progressRow: {
    flexDirection: 'row',
    gap: 6,
  },
  progressSegment: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#1B2536',
  },
  progressSegmentDone: {
    backgroundColor: WALLET_COLORS.signal,
  },
  progressSegmentActive: {
    shadowColor: WALLET_COLORS.signal,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 9,
  },
  tapStage: {
    flex: 1,
    justifyContent: 'space-between',
    gap: 10,
  },
  tapDetails: {
    gap: 10,
  },
  tapHero: {
    alignItems: 'center',
    gap: 8,
  },
  tapIcon: {
    width: 74,
    height: 74,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: WALLET_COLORS.border,
    backgroundColor: WALLET_COLORS.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tapTitle: {
    color: WALLET_COLORS.text,
    fontSize: 24,
    lineHeight: 28,
    fontWeight: '800',
    fontFamily: DISPLAY_FONT,
    letterSpacing: -0.5,
    textAlign: 'center',
  },
  tapSubtitle: {
    color: WALLET_COLORS.textMuted,
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  scanCard: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    alignItems: 'center',
    gap: 8,
  },
  scanCore: {
    width: 56,
    height: 56,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: WALLET_COLORS.border,
    backgroundColor: WALLET_COLORS.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanTitle: {
    color: WALLET_COLORS.text,
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
  scanSubtitle: {
    color: WALLET_COLORS.textMuted,
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
  },
  trailCard: {
    padding: 10,
    gap: 7,
  },
  trailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  trailDot: {
    width: 5,
    height: 5,
    borderRadius: 1,
    backgroundColor: WALLET_COLORS.signal,
  },
  trailText: {
    color: WALLET_COLORS.textMuted,
    fontSize: 11,
  },
  pinHintCard: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    marginTop: 8,
  },
  pinHintText: {
    color: WALLET_COLORS.textSoft,
    fontSize: 11,
    lineHeight: 16,
  },
  roleChipWrap: {
    alignItems: 'center',
    marginBottom: 2,
  },
  roleChip: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: WALLET_COLORS.border,
    backgroundColor: WALLET_COLORS.surfaceAlt,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  roleChipText: {
    color: WALLET_COLORS.textMuted,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  statusText: {
    color: WALLET_COLORS.textSoft,
    fontSize: 12,
    textAlign: 'center',
    minHeight: 16,
  },
  errorText: {
    color: WALLET_COLORS.danger,
    fontSize: 12,
    textAlign: 'center',
    minHeight: 18,
  },
  successWrap: {
    flex: 1,
    justifyContent: 'space-between',
    gap: 10,
    paddingBottom: 8,
  },
  successSummary: {
    gap: 10,
  },
  successMark: {
    width: 90,
    height: 90,
    borderRadius: 18,
    alignSelf: 'center',
    borderWidth: 1,
    borderColor: 'rgba(52, 211, 153, 0.32)',
    backgroundColor: 'rgba(52, 211, 153, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  successTitle: {
    color: WALLET_COLORS.text,
    fontSize: 24,
    lineHeight: 28,
    fontWeight: '800',
    fontFamily: DISPLAY_FONT,
    textAlign: 'center',
    letterSpacing: -0.6,
  },
  successBody: {
    color: WALLET_COLORS.textMuted,
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
  },
  pairCard: {
    padding: 12,
  },
  pairRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
  },
  pairSwatch: {
    width: 30,
    height: 30,
    borderRadius: 9,
    backgroundColor: WALLET_COLORS.surfaceSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pairSwatchText: {
    color: WALLET_COLORS.text,
    fontSize: 12,
    fontWeight: '700',
  },
  pairText: {
    flex: 1,
    gap: 2,
  },
  pairTitle: {
    color: WALLET_COLORS.text,
    fontSize: 13,
    fontWeight: '700',
  },
  pairSubtitle: {
    color: WALLET_COLORS.textSoft,
    fontSize: 11,
  },
  pairDivider: {
    height: 1,
    backgroundColor: '#203149',
  },
});

export default EcdhBackupScreen;

