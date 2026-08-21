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
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  background: string;
  value: string;
  label: string;
  onPress?: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`View ${label.toLowerCase()} details`}
      accessibilityHint="Opens a detailed learning summary"
      onPress={onPress}
      style={({ pressed }) => [
        styles.dashboardStat,
        styles.dashboardStatInteractive,
        { backgroundColor: background },
        pressed && styles.dashboardStatPressed,
      ]}
    >
      <View style={[styles.dashboardStatIcon, { backgroundColor: COLORS.white }]}>
        <Ionicons name={icon} size={20} color={color} />
      </View>
      <Text style={styles.dashboardStatValue}>{value}</Text>
      <Text style={styles.dashboardStatLabel}>{label}</Text>
      <Ionicons name="chevron-forward" size={14} color={color} style={styles.dashboardStatChevron} />
    </Pressable>
  );
}
