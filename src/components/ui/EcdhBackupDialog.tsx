import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import NfcManager from 'react-native-nfc-manager';

import { AppButton } from '../AppButton';
import { useNfcEnabled } from '../../features/nfc/hooks/useNfcEnabled';
import {
  initialisePinAndPrepareBackupDestination,
  performBackupExport,
  performBackupImport,
  signInWallet,
} from '../../services/cardService';
import { PinInput } from './PinInput';
import { THEME } from '../../types/theme/colors';

type EcdhBackupDialogProps = {
  visible: boolean;
  onClose: () => void;
};

type StepKey = 'mainAuth1' | 'secondaryInit' | 'mainAuth2' | 'secondaryAuth';

const FLOW_STEPS: Array<{
  key: StepKey;
  title: string;
  prompt: string;
  swipeHint: string;
}> = [
  {
    key: 'mainAuth1',
    title: 'Step 1/4',
    prompt: 'Enter main card PIN for authentication',
    swipeHint: 'Swipe main card',
  },
  {
    key: 'secondaryInit',
    title: 'Step 2/4',
    prompt: 'Enter PIN to initialize secondary card PIN (Do not create key pair)',
    swipeHint: 'Swipe secondary card',
  },
  {
    key: 'mainAuth2',
    title: 'Step 3/4',
    prompt: 'Enter main card PIN',
    swipeHint: 'Swipe main card',
  },
  {
    key: 'secondaryAuth',
    title: 'Step 4/4',
    prompt: 'Enter secondary card PIN',
    swipeHint: 'Swipe secondary card',
  },
];

const formatFailure = (message: string, statusWord?: string) =>
  statusWord ? `${message} (SW: ${statusWord})` : message;

export const EcdhBackupDialog: React.FC<EcdhBackupDialogProps> = ({ visible, onClose }) => {
  const { isEnabled } = useNfcEnabled();
  const [stepIndex, setStepIndex] = useState(0);
  const [pins, setPins] = useState<Record<StepKey, string>>({
    mainAuth1: '',
    secondaryInit: '',
    mainAuth2: '',
    secondaryAuth: '',
  });
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const [destCert, setDestCert] = useState<Uint8Array | null>(null);
  const [destLinkProof, setDestLinkProof] = useState<Uint8Array | null>(null);
  const [sourceCert, setSourceCert] = useState<Uint8Array | null>(null);
  const [sourceLinkProof, setSourceLinkProof] = useState<Uint8Array | null>(null);
  const [envelope, setEnvelope] = useState<Uint8Array | null>(null);

  const currentStep = FLOW_STEPS[stepIndex];
  const currentPin = pins[currentStep.key];

  useEffect(() => {
    if (!visible) {
      return;
    }

    setStepIndex(0);
    setPins({
      mainAuth1: '',
      secondaryInit: '',
      mainAuth2: '',
      secondaryAuth: '',
    });
    setStatusMessage('Follow the exact ECDH backup sequence below.');
    setErrorMessage(null);
    setSubmitting(false);
    setDone(false);
    setDestCert(null);
    setDestLinkProof(null);
    setSourceCert(null);
    setSourceLinkProof(null);
    setEnvelope(null);
  }, [visible]);

  const progressText = useMemo(() => {
    if (done) {
      return 'Backup flow completed successfully.';
    }
    return `${currentStep.prompt} -> ${currentStep.swipeHint}`;
  }, [currentStep.prompt, currentStep.swipeHint, done]);

  const ensureNfcReady = useCallback(() => {
    if (isEnabled === false) {
      Alert.alert('NFC Disabled', 'Please enable NFC in your system settings to continue.', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Open Settings',
          onPress: () => {
            NfcManager.goToNfcSetting().catch(() => {
              Alert.alert('Unable to open NFC settings');
            });
          },
        },
      ]);
      return false;
    }
    return true;
  }, [isEnabled]);

  const validatePin = useCallback((pin: string) => /^\d{4,8}$/.test(pin), []);

  const onPinChange = useCallback(
    (nextValue: string) => {
      setPins(prev => ({ ...prev, [currentStep.key]: nextValue }));
      setErrorMessage(null);
    },
    [currentStep.key],
  );

  const handleRunStep = useCallback(async () => {
    if (done) {
      onClose();
      return;
    }

    if (!validatePin(currentPin)) {
      setErrorMessage('PIN must contain 4 to 8 digits.');
      return;
    }

    if (!ensureNfcReady()) {
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);
    setStatusMessage(`${currentStep.swipeHint}...`);

    try {
      if (stepIndex === 0) {
        const result = await signInWallet(currentPin);
        if (!result.ok) {
          setErrorMessage(formatFailure(result.message, result.statusWord));
          return;
        }
      }

      if (stepIndex === 1) {
        const result = await initialisePinAndPrepareBackupDestination(currentPin);
        if (!result.ok || !result.deviceCert || !result.linkProof) {
          setErrorMessage(formatFailure(result.message, result.statusWord));
          return;
        }
        setDestCert(result.deviceCert);
        setDestLinkProof(result.linkProof);
      }

      if (stepIndex === 2) {
        if (!destCert || !destLinkProof) {
          setErrorMessage('Missing destination setup data. Please restart the backup flow.');
          return;
        }

        const result = await performBackupExport(currentPin, destCert, destLinkProof);
        if (!result.ok || !result.envelope || !result.sourceCert || !result.sourceLinkProof) {
          setErrorMessage(formatFailure(result.message, result.statusWord));
          return;
        }

        setEnvelope(result.envelope);
        setSourceCert(result.sourceCert);
        setSourceLinkProof(result.sourceLinkProof);
      }

      if (stepIndex === 3) {
        if (!sourceCert || !sourceLinkProof || !envelope) {
          setErrorMessage('Missing source backup payload. Please restart the backup flow.');
          return;
        }

        const result = await performBackupImport(currentPin, sourceCert, sourceLinkProof, envelope);
        if (!result.ok) {
          setErrorMessage(formatFailure(result.message, result.statusWord));
          return;
        }

        setDone(true);
        setStatusMessage('ECDH backup import completed on secondary card.');
        return;
      }

      setStepIndex(prev => prev + 1);
      setStatusMessage('Step successful. Continue to the next step.');
    } finally {
      setSubmitting(false);
    }
  }, [
    currentPin,
    currentStep.swipeHint,
    destCert,
    destLinkProof,
    done,
    ensureNfcReady,
    envelope,
    onClose,
    sourceCert,
    sourceLinkProof,
    stepIndex,
    validatePin,
  ]);

  const handleClose = useCallback(() => {
    if (isSubmitting) {
      return;
    }
    onClose();
  }, [isSubmitting, onClose]);

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={handleClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>ECDH Backup</Text>
          <Text style={styles.stepTitle}>{done ? 'Completed' : currentStep.title}</Text>
          <Text style={styles.prompt}>{progressText}</Text>

          {!done && (
            <PinInput
              value={currentPin}
              onChange={onPinChange}
              disabled={isSubmitting}
              autoFocus
              length={4}
              colorScheme="dark"
            />
          )}

          {statusMessage.length > 0 && <Text style={styles.statusText}>{statusMessage}</Text>}
          {errorMessage && <Text style={styles.errorText}>{errorMessage}</Text>}

          {isSubmitting && (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={THEME.primary} size="small" />
              <Text style={styles.loadingText}>Waiting for card...</Text>
            </View>
          )}

          <AppButton
            label={done ? 'Close' : 'Next: Enter PIN & Swipe'}
            onPress={handleRunStep}
            disabled={isSubmitting}
          />
          <AppButton
            label="Cancel"
            variant="text"
            onPress={handleClose}
            disabled={isSubmitting}
            style={styles.cancelButton}
          />

          <Pressable onPress={handleClose} style={styles.closeIconHit}>
            <Text style={styles.closeIcon}>✕</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  card: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: THEME.border,
    backgroundColor: THEME.surface,
    padding: 16,
    gap: 10,
  },
  title: {
    color: THEME.foreground,
    fontSize: THEME.typography.subtitle,
    fontWeight: '800',
    textAlign: 'center',
  },
  stepTitle: {
    color: THEME.primary,
    fontSize: THEME.typography.body,
    fontWeight: '700',
    textAlign: 'center',
  },
  prompt: {
    color: THEME.foregroundMuted,
    fontSize: THEME.typography.body,
    textAlign: 'center',
    marginBottom: 2,
  },
  statusText: {
    color: '#9AA5BA',
    fontSize: THEME.typography.subtext,
    textAlign: 'center',
  },
  errorText: {
    color: '#FF7A7A',
    fontSize: THEME.typography.subtext,
    textAlign: 'center',
  },
  loadingRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  loadingText: {
    color: THEME.foregroundMuted,
    fontSize: THEME.typography.subtext,
  },
  cancelButton: {
    marginTop: -2,
  },
  closeIconHit: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeIcon: {
    color: '#8892A5',
    fontSize: 16,
    fontWeight: '700',
  },
});

export default EcdhBackupDialog;
