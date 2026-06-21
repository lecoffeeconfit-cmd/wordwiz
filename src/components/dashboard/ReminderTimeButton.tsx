import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { COLORS, TILE_COLORS } from '../../constants/theme';
import type { Tab, Word } from '../../types';
import { styles } from '../../styles';

export function ReminderTimeButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.reminderTimeButton,
        active && styles.reminderTimeButtonActive,
        pressed && styles.pressed,
      ]}
    >
      <Text
        style={[
          styles.reminderTimeText,
          active && styles.reminderTimeTextActive,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}
