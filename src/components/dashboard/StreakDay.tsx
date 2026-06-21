import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { COLORS, TILE_COLORS } from '../../constants/theme';
import type { Tab, Word } from '../../types';
import { styles } from '../../styles';

export function StreakDay({
  day,
}: {
  day: { label: string; active: boolean; today: boolean };
}) {
  return (
    <View style={styles.streakDay}>
      <View
        style={[
          styles.streakDayCircle,
          day.active && styles.streakDayCircleActive,
          day.today && styles.streakDayCircleToday,
        ]}
      >
        <Ionicons
          name={day.active ? 'flame' : 'ellipse'}
          size={day.active ? 16 : 8}
          color={day.active ? COLORS.white : '#C9D2DB'}
        />
      </View>
      <Text style={[styles.streakDayLabel, day.today && styles.streakDayToday]}>
        {day.label}
      </Text>
    </View>
  );
}
