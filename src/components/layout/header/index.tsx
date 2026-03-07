import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { NavigationProp, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@react-native-vector-icons/ionicons';

import { styles } from './styles';
import { THEME } from '../../../types/theme/colors';

export type HeaderProps = {
  title?: string;
  subtitle?: string;
  showBackButton?: boolean;
  rightSlot?: React.ReactNode;
};

export default function Header({
  title,
  subtitle,
  showBackButton = true,
  rightSlot,
}: HeaderProps) {
  const navigation =
    useNavigation<NavigationProp<Record<string, object | undefined>>>();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
      {showBackButton ? (
        <Pressable
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="chevron-back" size={22} color={THEME.foreground} />
        </Pressable>
      ) : (
        <View style={styles.backButton} />
      )}

      <View style={styles.titleSection}>
        {!!title && <Text style={styles.title}>{title}</Text>}
        {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
      </View>

      <View style={styles.rightSlot}>{rightSlot ?? null}</View>
    </View>
  );
}
