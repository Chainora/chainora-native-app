import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import NfcManager from 'react-native-nfc-manager';

import { AppButton } from '../AppButton';
import { PinInput } from './PinInput';
import { THEME } from '../../types/theme/colors';
import { useNfcEnabled } from '../../features/nfc/hooks/useNfcEnabled';
import { parseEther, sendEthTransaction, type SendEthResult } from '../../services/transactionService';
import { getActiveNetwork, getNetworkList, setActiveNetwork, type NetworkKey } from '../../config/network';

const ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;
const PIN_LENGTH = 4;

type Phase = 'details' | 'pin' | 'scan' | 'result';

type SendTransactionDialogProps = {
  visible: boolean;
  fromAddress: string;
  onClose: () => void;
  onSuccess?: (result: SendEthResult) => void;
};

export const SendTransactionDialog: React.FC<SendTransactionDialogProps> = ({
  visible,
  fromAddress,
  onClose,
  onSuccess,
}) => {
  const { isEnabled } = useNfcEnabled();
  const [phase, setPhase] = useState<Phase>('details');
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [pin, setPin] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SendEthResult | null>(null);
  const [pendingWei, setPendingWei] = useState<bigint | null>(null);
  const [isSubmitting, setSubmitting] = useState(false);
  const [network, setNetwork] = useState(getActiveNetwork());
  const networkOptions = useMemo(() => getNetworkList(), []);

  useEffect(() => {
    if (!visible) {
      return;
    }
    setPhase('details');
    setRecipient('');
    setAmount('');
    setPin('');
    setStatus('');
    setError(null);
    setResult(null);
    setPendingWei(null);
    setSubmitting(false);
    setNetwork(getActiveNetwork());
  }, [visible]);

  const isCloseDisabled = useMemo(() => phase === 'scan' && isSubmitting, [phase, isSubmitting]);

  const handleSelectNetwork = useCallback(
    (key: NetworkKey) => {
      const next = setActiveNetwork(key);
      setNetwork(next);
      setError(null);
    },
    [],
  );

  const handleValidateDetails = useCallback(() => {
    const trimmedRecipient = recipient.trim();
    const trimmedAmount = amount.trim();

    if (!ADDRESS_REGEX.test(trimmedRecipient)) {
      setError('Enter a valid 42 character Ethereum address.');
      return;
    }

    if (trimmedAmount.length === 0) {
      setError('Enter an amount to send.');
      return;
    }

    try {
      const wei = parseEther(trimmedAmount);
      if (wei <= 0n) {
        setError('Amount must be greater than zero.');
        return;
      }
      setPendingWei(wei);
      setError(null);
      setPhase('pin');
      setStatus('Enter your PIN to authorise the transfer.');
    } catch (parseError) {
      const message = parseError instanceof Error ? parseError.message : String(parseError);
      setError(message);
    }
  }, [recipient, amount]);

  const handleBackToDetails = useCallback(() => {
    if (isSubmitting) {
      return;
    }
    setPhase('details');
    setStatus('');
    setPin('');
    setError(null);
  }, [isSubmitting]);

  const ensureNfcReady = useCallback(() => {
    if (isEnabled === false) {
      Alert.alert('NFC Disabled', 'Turn on NFC to sign the transaction.', [
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

  const handleSignTransaction = useCallback(async () => {
    if (pin.length < PIN_LENGTH) {
      setError(`Enter a ${PIN_LENGTH}-digit PIN.`);
      return;
    }

    if (!pendingWei) {
      setError('Enter transaction details first.');
      setPhase('details');
      return;
    }

    if (!ensureNfcReady()) {
      return;
    }

    setSubmitting(true);
    setPhase('scan');
    setStatus('Hold your Chainora card near the device to sign.');
    setError(null);

    try {
      const outcome = await sendEthTransaction({
        from: fromAddress,
        to: recipient.trim(),
        valueWei: pendingWei,
        pin,
      });

      setResult(outcome);
      setStatus('Transaction signed and broadcast successfully.');
      setPhase('result');
      onSuccess?.(outcome);
    } catch (signError) {
      const message = signError instanceof Error ? signError.message : String(signError);
      setError(message);
      setStatus('');
      setPhase('pin');
    } finally {
      setSubmitting(false);
    }
  }, [pin, pendingWei, ensureNfcReady, fromAddress, recipient, onSuccess]);

  const handleClose = useCallback(() => {
    if (isCloseDisabled) {
      return;
    }
    onClose();
  }, [isCloseDisabled, onClose]);

  const renderDetails = () => (
    <View style={styles.section}>
      <Text style={styles.title}>Send {network.currencySymbol}</Text>
      <Text style={styles.subtitle}>Transfer funds using your Chainora card.</Text>

      <View style={styles.networkSelector}>
        {networkOptions.map(option => (
          <Pressable
            key={option.key}
            onPress={() => handleSelectNetwork(option.key)}
            style={({ pressed }) => [
              styles.networkPill,
              option.key === network.key && styles.networkPillActive,
              pressed && styles.networkPillPressed,
            ]}
          >
            <Text
              style={[
                styles.networkPillText,
                option.key === network.key && styles.networkPillTextActive,
              ]}
            >
              {option.name}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.fieldGroup}>
        <Text style={styles.fieldLabel}>Recipient Address</Text>
        <TextInput
          value={recipient}
          onChangeText={text => setRecipient(text)}
          placeholder="0x..."
          placeholderTextColor="#64748B"
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.input}
        />
      </View>

      <View style={styles.fieldGroup}>
        <Text style={styles.fieldLabel}>Amount ({network.currencySymbol})</Text>
        <TextInput
          value={amount}
          onChangeText={text => setAmount(text)}
          placeholder="0.01"
          placeholderTextColor="#64748B"
          keyboardType="decimal-pad"
          style={styles.input}
        />
      </View>

      {error && <Text style={styles.errorText}>{error}</Text>}

      <AppButton label="Continue" onPress={handleValidateDetails} />
      <AppButton label="Cancel" onPress={handleClose} variant="text" style={styles.secondaryAction} />
    </View>
  );

  const renderPin = () => (
    <View style={styles.section}>
      <Text style={styles.title}>Authorise Transfer</Text>
      <Text style={styles.subtitle}>{status || 'Enter your card PIN to continue.'}</Text>

      <PinInput value={pin} onChange={setPin} autoFocus length={PIN_LENGTH} />

      {error && <Text style={styles.errorText}>{error}</Text>}

      <AppButton label="Start Scan" onPress={handleSignTransaction} disabled={isSubmitting} />
      <AppButton label="Back" onPress={handleBackToDetails} variant="text" style={styles.secondaryAction} />
    </View>
  );

  const renderScan = () => (
    <View style={styles.section}>
      <Text style={styles.title}>Ready To Scan</Text>
      <Text style={styles.subtitle}>{status || 'Hold the card near your device until the scan completes.'}</Text>
      <View style={styles.loadingArea}>
        <ActivityIndicator size="large" color={THEME.primary} />
      </View>
      <AppButton label="Scanning..." disabled style={styles.disabledButton} />
    </View>
  );

  const renderResult = () => (
    <View style={styles.section}>
      <Text style={styles.title}>Transaction Sent</Text>
      <Text style={styles.subtitle}>{status}</Text>
      {result && (
        <View style={styles.resultCard}>
          <Text style={styles.resultLabel}>Transaction Hash</Text>
          <Text style={styles.resultValue} selectable>
            {result.transactionHash}
          </Text>
        </View>
      )}
      <AppButton label="Done" onPress={handleClose} />
    </View>
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose} statusBarTranslucent>
      <View style={styles.backdrop}>
        <KeyboardAvoidingView
          style={styles.dialogContainer}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.dialog}>
              {phase === 'details' && renderDetails()}
              {phase === 'pin' && renderPin()}
              {phase === 'scan' && renderScan()}
              {phase === 'result' && renderResult()}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.8)',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  dialogContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  dialog: {
    backgroundColor: 'rgba(15, 23, 42, 0.95)',
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.2)',
  },
  section: {
    gap: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#F8FAFC',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 14,
    color: '#94A3B8',
    lineHeight: 20,
  },
  fieldGroup: {
    gap: 8,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: THEME.foregroundMuted,
    letterSpacing: 0.5,
  },
  networkSelector: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  networkPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(30, 41, 59, 0.4)',
  },
  networkPillActive: {
    borderColor: 'rgba(56, 189, 248, 0.6)',
    backgroundColor: 'rgba(56, 189, 248, 0.2)',
  },
  networkPillPressed: {
    opacity: 0.8,
  },
  networkPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: THEME.foregroundMuted,
  },
  networkPillTextActive: {
    color: '#F8FAFC',
  },
  input: {
    backgroundColor: 'rgba(30, 41, 59, 0.6)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.25)',
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#E2E8F0',
    fontSize: 16,
  },
  errorText: {
    color: THEME.danger,
    fontSize: 13,
  },
  secondaryAction: {
    marginTop: -8,
  },
  loadingArea: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  disabledButton: {
    opacity: 0.8,
  },
  resultCard: {
    backgroundColor: 'rgba(30, 41, 59, 0.6)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.2)',
    padding: 16,
    gap: 8,
  },
  resultLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: THEME.foregroundMuted,
  },
  resultValue: {
    fontSize: 14,
    color: '#F8FAFC',
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'Menlo' }),
  },
});

export default SendTransactionDialog;
