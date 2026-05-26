import React, { useCallback, useMemo, useState } from 'react';
import { StatusBar, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PinInput } from '@components/ui/PinInput';
import type {
  ScanCardFlowSuccess,
  WalletActionResult,
} from '@app-types/wallet';
import {
  WALLET_COLORS,
  WalletButton,
  WalletPanel,
  WalletSectionLabel,
  WalletTopBar,
} from '@components/ui/walletDesign';
import { useEcdhBackupActions } from '@hooks/useEcdhBackupActions';
import { useNfcEnabled } from '@hooks/useNfcEnabled';
import { useRegisterScanCardFlow } from '@hooks/useScanCardFlowConfig';
import { useSettings } from '@hooks/useSettings';
import { useToast } from '@hooks/useToast';
import type { RootStackParamList } from '@navigation/routes/rootStackParamList';
import { ROUTES } from '@navigation/routes/routes';
import { screenBase, styles } from './EcdhBackup.styles';

type Props = NativeStackScreenProps<
  RootStackParamList,
  typeof ROUTES.EcdhBackup
>;
type StageKey = 'intro' | 'tap1' | 'tap2' | 'tap3' | 'tap4' | 'success';

const PIN_LENGTH = 4;
const formatFailure = (message: string, statusWord?: string) =>
  statusWord ? `${message} (SW: ${statusWord})` : message;

const roleKeyByStage: Record<
  'tap1' | 'tap2' | 'tap3' | 'tap4',
  'ecdhRoleMainCard' | 'ecdhRoleBackupCard'
> = {
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
  const [sourceLinkProof, setSourceLinkProof] = useState<Uint8Array | null>(
    null,
  );
  const [envelope, setEnvelope] = useState<Uint8Array | null>(null);

  const introTimeline = useMemo(
    () => [
      {
        step: '1',
        title: t('ecdhIntroTimeline1Title'),
        subtitle: t('ecdhIntroTimeline1Subtitle'),
      },
      {
        step: '2',
        title: t('ecdhIntroTimeline2Title'),
        subtitle: t('ecdhIntroTimeline2Subtitle'),
      },
      {
        step: '3',
        title: t('ecdhIntroTimeline3Title'),
        subtitle: t('ecdhIntroTimeline3Subtitle'),
      },
      {
        step: '4',
        title: t('ecdhIntroTimeline4Title'),
        subtitle: t('ecdhIntroTimeline4Subtitle'),
      },
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
        trail: [
          t('ecdhTrailReadCard'),
          t('ecdhTrailVerifyPin'),
          t('ecdhTrailReady'),
        ],
      },
      tap2: {
        step: 2,
        title: t('ecdhTap2Title'),
        subtitle: t('ecdhTap2Subtitle'),
        needsPin: true,
        pinValue: secondaryPin,
        setPinValue: setSecondaryPin,
        trail: [
          t('ecdhTrailReadCard'),
          t('ecdhTrailCreateKey'),
          t('ecdhTrailVerify'),
        ],
      },
      tap3: {
        step: 3,
        title: t('ecdhTap3Title'),
        subtitle: t('ecdhTap3Subtitle'),
        needsPin: false,
        pinValue: mainPin,
        setPinValue: setMainPin,
        trail: [
          t('ecdhTrailSealWallet'),
          t('ecdhTrailEncrypt'),
          t('ecdhTrailTransfer'),
        ],
      },
      tap4: {
        step: 4,
        title: t('ecdhTap4Title'),
        subtitle: t('ecdhTap4Subtitle'),
        needsPin: false,
        pinValue: secondaryPin,
        setPinValue: setSecondaryPin,
        trail: [
          t('ecdhTrailReceive'),
          t('ecdhTrailCheck'),
          t('ecdhTrailStore'),
        ],
      },
    }),
    [mainPin, secondaryPin, t],
  );

  const progressStage =
    stage === 'success' ? 4 : stage === 'intro' ? 0 : stages[stage].step;
  const currentTap =
    stage === 'intro' || stage === 'success' ? null : stages[stage];
  const canAdvance =
    !currentTap ||
    !currentTap.needsPin ||
    currentTap.pinValue.length === PIN_LENGTH;

  const executeCurrentTap =
    useCallback(async (): Promise<WalletActionResult> => {
      if (stage === 'tap1') {
        return ecdhBackupActions.signInWallet(mainPin);
      }

      if (stage === 'tap2') {
        const result =
          await ecdhBackupActions.initialisePinAndPrepareBackupDestination(
            secondaryPin,
          );
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

        const result = await ecdhBackupActions.performBackupExport(
          mainPin,
          destCert,
          destLinkProof,
        );
        if (
          result.ok &&
          result.envelope &&
          result.sourceCert &&
          result.sourceLinkProof
        ) {
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

      return ecdhBackupActions.performBackupImport(
        secondaryPin,
        sourceCert,
        sourceLinkProof,
        envelope,
      );
    }, [
      destCert,
      destLinkProof,
      ecdhBackupActions,
      envelope,
      mainPin,
      secondaryPin,
      sourceCert,
      sourceLinkProof,
      stage,
      t,
    ]);

  const handleDigit = useCallback(
    (digit: string) => {
      if (!currentTap?.needsPin) {
        return;
      }
      currentTap.setPinValue(prev =>
        prev.length >= PIN_LENGTH ? prev : `${prev}${digit}`,
      );
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
  }, [
    currentTap,
    executeCurrentTap,
    isEnabled,
    navigation,
    registerScanCardFlow,
    showToast,
    stage,
    t,
  ]);

  return (
    <View style={screenBase.screen}>
      <StatusBar
        barStyle={resolvedTheme === 'light' ? 'dark-content' : 'light-content'}
        backgroundColor={WALLET_COLORS.background}
      />
      <SafeAreaView style={screenBase.safeArea} edges={['top', 'bottom']}>
        <View style={screenBase.content}>
          <WalletTopBar
            title={
              stage === 'success'
                ? t('ecdhBackupDoneTitle')
                : t('headerEcdhTitle')
            }
            onBack={() => navigation.goBack()}
          />

          <View style={styles.stageRoot}>
            {stage === 'intro' ? (
              <View style={styles.introStage}>
                <View style={styles.introBody}>
                  <Text style={styles.kicker}>{t('ecdhIntroKicker')}</Text>
                  <Text style={styles.introTitle}>{t('ecdhIntroTitle')}</Text>
                  <Text style={styles.introSubtitle}>
                    {t('ecdhIntroSubtitle')}
                  </Text>

                  <WalletPanel style={styles.deviceCard}>
                    <Text style={styles.deviceCardTitle}>
                      {t('ecdhIntroCardsTitle')}
                    </Text>
                    <Text style={styles.deviceCardBody}>
                      {t('ecdhIntroCardsBody')}
                    </Text>
                  </WalletPanel>

                  <WalletPanel style={styles.timelineCard}>
                    {introTimeline.map(item => (
                      <View key={item.step} style={styles.timelineRow}>
                        <View style={styles.timelineBullet}>
                          <Text style={styles.timelineBulletText}>
                            {item.step}
                          </Text>
                        </View>
                        <View style={styles.timelineBody}>
                          <Text style={styles.timelineTitle}>{item.title}</Text>
                          <Text style={styles.timelineSubtitle}>
                            {item.subtitle}
                          </Text>
                        </View>
                      </View>
                    ))}
                  </WalletPanel>

                  <WalletPanel style={styles.noteCard}>
                    <Ionicons
                      name="lock-closed-outline"
                      size={16}
                      color={WALLET_COLORS.signal}
                    />
                    <Text style={styles.noteText}>{t('ecdhIntroNote')}</Text>
                  </WalletPanel>
                </View>

                <View style={styles.actions}>
                  <WalletButton
                    label={t('ecdhIntroStart')}
                    onPress={openNextStage}
                  />
                </View>
              </View>
            ) : stage === 'success' ? (
              <View style={styles.successWrap}>
                <View style={styles.successSummary}>
                  <View style={styles.progressRow}>
                    {[1, 2, 3, 4].map(index => (
                      <View
                        key={index}
                        style={[
                          styles.progressSegment,
                          styles.progressSegmentDone,
                        ]}
                      />
                    ))}
                  </View>

                  <View style={styles.successMark}>
                    <Ionicons
                      name="checkmark"
                      size={34}
                      color={WALLET_COLORS.success}
                    />
                  </View>
                  <Text style={styles.successTitle}>
                    {t('ecdhSuccessTitle')}
                  </Text>
                  <Text style={styles.successBody}>{t('ecdhSuccessBody')}</Text>

                  <WalletPanel style={styles.pairCard}>
                    <View style={styles.pairRow}>
                      <View style={styles.pairSwatch}>
                        <Text style={styles.pairSwatchText}>M</Text>
                      </View>
                      <View style={styles.pairText}>
                        <Text style={styles.pairTitle}>
                          {t('ecdhRoleMainCard')}
                        </Text>
                        <Text style={styles.pairSubtitle}>
                          {t('ecdhSuccessMainCarry')}
                        </Text>
                      </View>
                      <Ionicons
                        name="checkmark"
                        size={16}
                        color={WALLET_COLORS.success}
                      />
                    </View>
                    <View style={styles.pairDivider} />
                    <View style={styles.pairRow}>
                      <View style={styles.pairSwatch}>
                        <Text style={styles.pairSwatchText}>B</Text>
                      </View>
                      <View style={styles.pairText}>
                        <Text style={styles.pairTitle}>
                          {t('ecdhRoleBackupCard')}
                        </Text>
                        <Text style={styles.pairSubtitle}>
                          {t('ecdhSuccessBackupStore')}
                        </Text>
                      </View>
                      <Ionicons
                        name="checkmark"
                        size={16}
                        color={WALLET_COLORS.success}
                      />
                    </View>
                  </WalletPanel>
                </View>

                <View style={styles.actions}>
                  <WalletButton
                    label={t('commonDone')}
                    onPress={() => navigation.goBack()}
                  />
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
                        <Text style={styles.roleChipText}>
                          {t(roleKeyByStage[stage as TapStageKey])}
                        </Text>
                      </View>
                    </View>
                  }
                  afterActionSlot={
                    <WalletPanel style={styles.pinHintCard}>
                      <Text style={styles.pinHintText}>
                        {t('ecdhPinFooterNote')}
                      </Text>
                    </WalletPanel>
                  }
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
                            progressStage >= index &&
                              styles.progressSegmentDone,
                            progressStage === index &&
                              styles.progressSegmentActive,
                          ]}
                        />
                      ))}
                    </View>

                    <WalletSectionLabel
                      label={`${t('ecdhTapLabel')} ${currentTap.step}/4 - ${t(
                        roleKeyByStage[stage as TapStageKey],
                      )}`}
                    />
                    <View style={styles.tapHero}>
                      <View style={styles.tapIcon}>
                        <Ionicons
                          name="wifi-outline"
                          size={32}
                          color={WALLET_COLORS.signal}
                        />
                      </View>
                      <Text style={styles.tapTitle}>{currentTap.title}</Text>
                      <Text style={styles.tapSubtitle}>
                        {currentTap.subtitle}
                      </Text>
                    </View>

                    <WalletPanel style={styles.scanCard}>
                      <View style={styles.scanCore}>
                        <Ionicons
                          name="card-outline"
                          size={24}
                          color={WALLET_COLORS.text}
                        />
                      </View>
                      <Text style={styles.scanTitle}>{t('ecdhScanTitle')}</Text>
                      <Text style={styles.scanSubtitle}>
                        {t('ecdhScanSubtitle')}
                      </Text>
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

export default EcdhBackupScreen;
