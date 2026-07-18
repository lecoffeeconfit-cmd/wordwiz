import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { COLORS, TILE_COLORS } from '../../constants/theme';
import type { Tab, Word } from '../../types';
import { styles } from '../../styles';

export function DashboardSection({
  title,
  badge,
  children,
}: {
  title: string;
  badge?: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.dashboardSection}>
      <View style={styles.dashboardSectionHeader}>
        <Text style={styles.dashboardSectionTitle}>{title}</Text>
        {badge ? (
          <View style={styles.dashboardBadge}>
            <Text style={styles.dashboardBadgeText}>{badge}</Text>
          </View>
        ) : null}
      </View>
      {children}
    </View>
  );
}
