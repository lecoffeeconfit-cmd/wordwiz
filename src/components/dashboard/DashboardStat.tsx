import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { COLORS, TILE_COLORS, WORDWIZ_GRADIENT_COLORS } from '../../constants/theme';
import type { Tab, Word } from '../../types';
import { styles } from '../../styles';

export function DashboardStat({
  icon,
  color,
  background,
  value,
  label,
  onPress,
  grandmaster = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  background: string;
  value: string;
  label: string;
  onPress?: () => void;
  grandmaster?: boolean;
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
        { backgroundColor: grandmaster ? 'transparent' : background },
        pressed && styles.dashboardStatPressed,
      ]}
    >
      {grandmaster ? (
        <LinearGradient
          colors={WORDWIZ_GRADIENT_COLORS}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.dashboardStatGrandmasterBackdrop}
        />
      ) : null}
      <View style={[styles.dashboardStatIcon, { backgroundColor: COLORS.white }]}>
        <Ionicons name={icon} size={20} color={color} />
      </View>
      <Text style={styles.dashboardStatValue}>{value}</Text>
      <Text style={styles.dashboardStatLabel}>{label}</Text>
      <Ionicons name="chevron-forward" size={14} color={color} style={styles.dashboardStatChevron} />
    </Pressable>
  );
}
