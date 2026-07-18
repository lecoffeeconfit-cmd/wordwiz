import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { COLORS, TILE_COLORS } from '../../constants/theme';
import type { Tab, Word } from '../../types';
import { styles } from '../../styles';

export function SortButton({
  active,
  icon,
  onPress,
}: {
  active: boolean;
  icon: 'text' | 'time' | 'bookmark';
  onPress: () => void;
}) {
  const labels = {
    text: 'Sort alphabetically',
    time: 'Sort by newest',
    bookmark: active ? 'Show all words' : 'Show flagged words',
  };

  const icons = {
    text: 'text-outline',
    time: 'time-outline',
    bookmark: active ? 'bookmark' : 'bookmark-outline',
  } as const;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={labels[icon]}
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[styles.sortButton, active && styles.sortButtonActive]}
    >
      <Ionicons
        name={icons[icon]}
        size={17}
        color={active ? COLORS.purpleDark : COLORS.muted}
      />
    </Pressable>
  );
}
