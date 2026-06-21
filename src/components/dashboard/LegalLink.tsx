import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { COLORS, TILE_COLORS } from '../../constants/theme';
import type { Tab, Word } from '../../types';
import { styles } from '../../styles';

export function LegalLink({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.legalLink,
        pressed && styles.pressed,
      ]}
    >
      <Text style={styles.legalLinkText}>{label}</Text>
      <Ionicons name="chevron-forward" size={15} color={COLORS.blue} />
    </Pressable>
  );
}
