import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { COLORS, TILE_COLORS } from '../../constants/theme';
import type { Tab, Word } from '../../types';
import { styles } from '../../styles';

export function DashboardStat({
  icon,
  color,
  background,
  value,
  label,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  background: string;
  value: string;
  label: string;
}) {
  return (
    <View style={[styles.dashboardStat, { backgroundColor: background }]}>
      <View style={[styles.dashboardStatIcon, { backgroundColor: COLORS.white }]}>
        <Ionicons name={icon} size={20} color={color} />
      </View>
      <Text style={styles.dashboardStatValue}>{value}</Text>
      <Text style={styles.dashboardStatLabel}>{label}</Text>
    </View>
  );
}
