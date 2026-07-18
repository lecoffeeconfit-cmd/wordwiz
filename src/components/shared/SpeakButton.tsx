import { Ionicons } from '@expo/vector-icons';
import type { GestureResponderEvent } from 'react-native';
import { Pressable } from 'react-native';
import { COLORS } from '../../constants/theme';
import { speakDefinition, speakWord } from '../../services';
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
      accessibilityRole="button"
      accessibilityLabel={`Hear ${term} pronounced`}
      onPress={(event: GestureResponderEvent) => {
        event.stopPropagation();
        void speakWord(term);
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

export function SpeakDefinitionButton({
  definition,
  term,
}: {
  definition: string;
  term: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Hear the definition of ${term}`}
      onPress={(event: GestureResponderEvent) => {
        event.stopPropagation();
        void speakDefinition(definition);
      }}
      style={({ pressed }) => [styles.definitionSpeakButton, pressed && styles.pressed]}
    >
      <Ionicons name="volume-medium-outline" size={17} color={COLORS.purpleDark} />
    </Pressable>
  );
}
