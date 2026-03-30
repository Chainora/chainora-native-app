import React, { useCallback } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import { Ionicons } from '@react-native-vector-icons/ionicons';

import { AppButton } from '../AppButton';
import { useSettings } from '../../features/settings';

type WalletDetailsDialogProps = {
  visible: boolean;
  onClose: () => void;
  address: string;
  publicKeyHex: string | undefined;
  networkName: string;
};

export const WalletDetailsDialog: React.FC<WalletDetailsDialogProps> = ({
  visible,
  onClose,
  address,
  publicKeyHex,
  networkName,
}) => {
  const { t, themeTokens } = useSettings();

  const copyAddress = useCallback(() => {
    Clipboard.setString(address);
  }, [address]);

  const copyPublicKey = useCallback(() => {
    if (!publicKeyHex) {
      return;
    }
    Clipboard.setString(publicKeyHex);
  }, [publicKeyHex]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={[styles.backdrop, { backgroundColor: themeTokens.overlay }]}> 
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.dialog, { backgroundColor: themeTokens.surface, borderColor: themeTokens.border }]}> 
          <View style={[styles.iconWrap, { borderColor: themeTokens.primaryLight, backgroundColor: themeTokens.glow }]}> 
            <Ionicons name="wallet-outline" size={24} color={themeTokens.primary} />
          </View>

          <Text style={[styles.title, { color: themeTokens.foreground }]}>{t('homeWalletDetailsTitle')}</Text>

          <View style={[styles.detailCard, { backgroundColor: themeTokens.surfaceHighlight, borderColor: themeTokens.border }]}> 
            <Text style={[styles.label, { color: themeTokens.foregroundMuted }]}>{t('homeAddressLine')}</Text>
            <Text style={[styles.value, { color: themeTokens.foreground }]} selectable>
              {address}
            </Text>
            <Pressable style={styles.copyRow} onPress={copyAddress}>
              <Ionicons name="copy-outline" size={14} color={themeTokens.primary} />
              <Text style={[styles.copyText, { color: themeTokens.primary }]}>{t('homeWalletCopyAddress')}</Text>
            </Pressable>
          </View>

          <View style={[styles.detailCard, { backgroundColor: themeTokens.surfaceHighlight, borderColor: themeTokens.border }]}> 
            <Text style={[styles.label, { color: themeTokens.foregroundMuted }]}>{t('homePublicKeyLine')}</Text>
            <Text style={[styles.value, { color: themeTokens.foreground }]} selectable>
              {publicKeyHex ?? t('homeUnavailable')}
            </Text>
            <Pressable style={styles.copyRow} onPress={copyPublicKey} disabled={!publicKeyHex}>
              <Ionicons name="copy-outline" size={14} color={publicKeyHex ? themeTokens.primary : themeTokens.foregroundMuted} />
              <Text
                style={[
                  styles.copyText,
                  { color: publicKeyHex ? themeTokens.primary : themeTokens.foregroundMuted },
                ]}
              >
                {t('homeWalletCopyPublicKey')}
              </Text>
            </Pressable>
          </View>

          <View style={[styles.networkRow, { borderColor: themeTokens.primaryLight, backgroundColor: themeTokens.glow }]}> 
            <Ionicons name="globe-outline" size={14} color={themeTokens.primary} />
            <Text style={[styles.networkText, { color: themeTokens.primary }]}>{networkName}</Text>
          </View>

          <AppButton label={t('commonDone')} onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  dialog: {
    width: '100%',
    borderRadius: 24,
    borderWidth: 1,
    padding: 20,
    gap: 12,
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  title: {
    textAlign: 'center',
    fontSize: 20,
    fontWeight: '800',
  },
  detailCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    gap: 8,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
  },
  value: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  copyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
  },
  copyText: {
    fontSize: 11,
    fontWeight: '700',
  },
  networkRow: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  networkText: {
    fontSize: 12,
    fontWeight: '700',
  },
});

export default WalletDetailsDialog;
