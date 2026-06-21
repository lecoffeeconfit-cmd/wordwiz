import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { COLORS, TILE_COLORS } from '../../constants/theme';
import type { Tab, Word } from '../../types';
import { styles } from '../../styles';

export function HomeMiniCard({
  color,
  accent,
  icon,
  title,
  subtitle,
}: {
  color: string;
  accent: string;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
}) {
  return (
    <View style={[styles.homeMiniCard, { backgroundColor: color }]}>
      <View style={styles.homeMiniIcon}>
        <Ionicons name={icon} size={18} color={accent} />
      </View>
      <Text style={styles.homeMiniTitle}>{title}</Text>
      <Text style={styles.homeMiniSubtitle}>{subtitle}</Text>
    </View>
  );
}
