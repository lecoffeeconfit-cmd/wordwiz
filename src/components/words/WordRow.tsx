import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';
import { COLORS, TILE_COLORS } from '../../constants/theme';
import type { Word } from '../../types';
import { styles } from '../../styles';
import { formatWordAddedDate } from '../../utils';
import { SpeakButton } from '../shared/SpeakButton';

function getLetterColor(term: string) {
  const firstLetter = term.trim().charAt(0).toUpperCase();
  const alphabetIndex = Math.max(0, firstLetter.charCodeAt(0) - 65);

  return TILE_COLORS[alphabetIndex % TILE_COLORS.length].accent;
}

export function WordRow({
  word,
  onPress,
  onRemove,
}: {
  word: Word;
  index: number;
  onPress?: (word: Word) => void;
  onRemove: (word: Word) => void;
}) {
  const letterColor = getLetterColor(word.term);
  const hasLongTerm = word.term.trim().length > 8;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Study ${word.term} flashcard`}
      accessibilityHint="Opens this word in flashcards"
      onPress={() => onPress?.(word)}
      onLongPress={() => onRemove(word)}
      style={({ pressed }) => [
        styles.wordRow,
        pressed && styles.pressed,
      ]}
    >
      <View style={[styles.letterBadge, { backgroundColor: `${letterColor}18` }]}>
        <Text style={[styles.letterText, { color: letterColor }]}>
          {word.term.charAt(0).toUpperCase()}
        </Text>
      </View>
      <View style={styles.wordRowCopy}>
        <View
          style={[
            styles.wordTitleRow,
            hasLongTerm && styles.wordTitleRowWrapped,
          ]}
        >
          <Text
            minimumFontScale={0.82}
            style={[styles.wordTerm, hasLongTerm && styles.wordTermLong]}
          >
            {word.term}
          </Text>
          {word.partOfSpeech && (
            <Text style={styles.partOfSpeechPill}>{word.partOfSpeech}</Text>
          )}
          <SpeakButton term={word.term} />
        </View>
        <Text numberOfLines={2} style={styles.wordDefinition}>
          {word.simpleDefinition || word.definition}
        </Text>
        {word.commonWords && word.commonWords.length > 0 && (
          <Text numberOfLines={1} style={styles.commonWordsLine}>
            Synonyms: {word.commonWords.slice(0, 3).join(', ')}
          </Text>
        )}
        {word.pronunciation && (
          <Text numberOfLines={1} style={styles.wordMeta}>
            {word.pronunciation}
          </Text>
        )}
        <View style={styles.wordAddedMeta}>
          <Ionicons name="calendar-outline" size={11} color={COLORS.muted} />
          <Text style={styles.wordAddedText}>
            {formatWordAddedDate(word.createdAt)}
          </Text>
        </View>
      </View>
      <View style={styles.reviewCount}>
        <Ionicons name="refresh" size={13} color={COLORS.muted} />
        <Text style={styles.reviewText}>{word.reviews}</Text>
      </View>
    </Pressable>
  );
}
