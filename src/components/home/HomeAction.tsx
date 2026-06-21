import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { COLORS, TILE_COLORS } from '../../constants/theme';
import type { Tab, Word } from '../../types';
import { styles } from '../../styles';

export function HomeAction({
  accent,
  pale,
  icon,
  label,
  onPress,
}: {
  accent: string;
  pale: string;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.homeActionButton,
        { backgroundColor: pale, borderColor: pale },
        pressed && styles.pressed,
      ]}
    >
      <Ionicons name={icon} size={23} color={accent} />
      <Text style={styles.homeActionLabel}>{label}</Text>
    </Pressable>
  );
}
