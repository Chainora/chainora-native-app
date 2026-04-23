import React, { useMemo } from 'react';
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppButton } from '../../components/AppButton';
import { useSettings } from '../settings';
import type { WalletConnectSessionProposal } from '../../services/walletconnect';

type Props = {
  proposal: WalletConnectSessionProposal | null;
  onApprove: () => void;
  onReject: () => void;
};

const shortenAddress = (value: string): string => {
  if (!value) {
    return '';
  }
  return value.length <= 12 ? value : `${value.slice(0, 6)}...${value.slice(-4)}`;
};

export const SessionProposalModal: React.FC<Props> = ({ proposal, onApprove, onReject }) => {
  const { themeTokens } = useSettings();
  const styles = useMemo(
    () => createStyles(themeTokens.background, themeTokens.foreground),
    [themeTokens.background, themeTokens.foreground],
  );

  return (
    <Modal
      visible={Boolean(proposal)}
      animationType="slide"
      transparent
      onRequestClose={onReject}
    >
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>Connect with dApp?</Text>
          <Text style={styles.subtitle}>
            {proposal?.proposerName ?? 'Unknown dApp'} requests a WalletConnect session.
          </Text>

          {proposal?.proposerUrl ? (
            <Text style={styles.meta}>Origin: {proposal.proposerUrl}</Text>
          ) : null}

          <ScrollView style={styles.detailScroll} contentContainerStyle={styles.detailContent}>
            <Text style={styles.sectionLabel}>Account shared</Text>
            <Text style={styles.sectionValue}>{shortenAddress(proposal?.expectedAddress ?? '')}</Text>

            {proposal?.requestedChains.length ? (
              <>
                <Text style={styles.sectionLabel}>Chains</Text>
                {proposal.requestedChains.map(chain => (
                  <Text key={chain} style={styles.sectionItem}>
                    {chain}
                  </Text>
                ))}
              </>
            ) : null}

            {proposal?.requestedMethods.length ? (
              <>
                <Text style={styles.sectionLabel}>Methods</Text>
                <Text style={styles.sectionItem}>
                  {proposal.requestedMethods.join(', ')}
                </Text>
              </>
            ) : null}

            {proposal?.requestedEvents.length ? (
              <>
                <Text style={styles.sectionLabel}>Events</Text>
                <Text style={styles.sectionItem}>
                  {proposal.requestedEvents.join(', ')}
                </Text>
              </>
            ) : null}
          </ScrollView>

          <View style={styles.actionRow}>
            <AppButton label="Reject" variant="text" onPress={onReject} style={styles.actionButton} />
            <AppButton label="Approve" onPress={onApprove} style={styles.actionButton} />
          </View>
        </View>
      </View>
    </Modal>
  );
};

const createStyles = (background: string, foreground: string) =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(15, 23, 42, 0.65)',
      justifyContent: 'center',
      padding: 20,
    },
    card: {
      borderRadius: 16,
      backgroundColor: background,
      borderWidth: 1,
      borderColor: 'rgba(148, 163, 184, 0.35)',
      padding: 16,
      gap: 10,
    },
    title: {
      fontSize: 18,
      fontWeight: '700',
      color: foreground,
    },
    subtitle: {
      fontSize: 14,
      color: foreground,
    },
    meta: {
      fontSize: 12,
      color: 'rgba(100, 116, 139, 1)',
    },
    detailScroll: {
      maxHeight: 220,
    },
    detailContent: {
      gap: 6,
      paddingBottom: 6,
    },
    sectionLabel: {
      marginTop: 8,
      fontSize: 11,
      fontWeight: '700',
      color: 'rgba(100, 116, 139, 1)',
      letterSpacing: 0.5,
      textTransform: 'uppercase',
    },
    sectionValue: {
      fontSize: 13,
      color: foreground,
    },
    sectionItem: {
      fontSize: 12,
      color: foreground,
    },
    actionRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: 12,
      marginTop: 8,
    },
    actionButton: {
      flex: 1,
    },
  });
