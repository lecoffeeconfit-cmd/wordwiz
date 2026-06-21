import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { COLORS, TILE_COLORS } from '../../constants/theme';
import type { Tab, Word } from '../../types';
import { styles } from '../../styles';

export function LevelRow({
  color,
  label,
  value,
}: {
  color: string;
  label: string;
  value: number;
}) {
  return (
    <View style={styles.levelRow}>
      <View style={[styles.levelDot, { backgroundColor: color }]} />
      <Text style={styles.levelLabel}>{label}</Text>
      <Text style={styles.levelValue}>{value}</Text>
    </View>
  );
}
