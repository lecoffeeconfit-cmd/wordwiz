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
  icon: 'text' | 'time';
  onPress: () => void;
}) {
  return (
    <Pressable
      role="button"
      accessibilityLabel={
        icon === 'text' ? 'Sort alphabetically' : 'Sort by newest'
      }
      onPress={onPress}
      style={[styles.sortButton, active && styles.sortButtonActive]}
    >
      <Ionicons
        name={icon === 'text' ? 'text-outline' : 'time-outline'}
        size={17}
        color={active ? COLORS.purpleDark : COLORS.muted}
      />
    </Pressable>
  );
}
