import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { COLORS, TILE_COLORS } from '../../constants/theme';
import type { Tab, Word } from '../../types';
import { styles } from '../../styles';

export function EmptyPractice({
  icon,
  label,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
}) {
  return (
    <View style={styles.emptyPractice}>
      <View style={styles.emptyPracticeIcon}>
        <Ionicons name={icon} size={44} color={COLORS.blue} />
      </View>
      <Text style={styles.emptyPracticeTitle}>Your practice space is ready</Text>
      <Text style={styles.emptyPracticeText}>{label}</Text>
    </View>
  );
}
