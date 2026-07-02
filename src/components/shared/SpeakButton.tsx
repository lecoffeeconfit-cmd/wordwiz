import { Ionicons } from '@expo/vector-icons';
import type { GestureResponderEvent } from 'react-native';
import { Pressable } from 'react-native';
import { COLORS } from '../../constants/theme';
import { speakWord } from '../../services';
import { styles } from '../../styles';

export function SpeakButton({
  term,
  size = 'small',
}: {
  term: string;
  size?: 'small' | 'large';
}) {
  return (
    <Pressable
      role="button"
      accessibilityLabel={`Hear ${term} pronounced`}
      onPress={(event: GestureResponderEvent) => {
        event.stopPropagation();
        speakWord(term);
      }}
      style={({ pressed }) => [
        styles.speakButton,
        size === 'large' && styles.speakButtonLarge,
        pressed && styles.pressed,
      ]}
    >
      <Ionicons
        name="volume-high"
        size={size === 'large' ? 20 : 15}
        color={COLORS.blue}
      />
    </Pressable>
  );
}
