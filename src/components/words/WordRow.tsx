import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { COLORS, TILE_COLORS } from '../../constants/theme';
import type { Tab, Word } from '../../types';
import { styles } from '../../styles';

export function WordRow({
  word,
  index,
  onRemove,
}: {
  word: Word;
  index: number;
  onRemove: (word: Word) => void;
}) {
  const tile = TILE_COLORS[index % TILE_COLORS.length];
  return (
    <Pressable
      onLongPress={() => onRemove(word)}
      style={({ pressed }) => [
        styles.wordRow,
        { backgroundColor: tile.pale, borderColor: `${tile.accent}33` },
        pressed && styles.pressed,
      ]}
    >
      <View style={[styles.letterBadge, { backgroundColor: COLORS.white }]}>
        <Text style={[styles.letterText, { color: tile.accent }]}>
          {word.term.charAt(0).toUpperCase()}
        </Text>
      </View>
      <View style={styles.wordRowCopy}>
        <View style={styles.wordTitleRow}>
          <Text style={styles.wordTerm}>{word.term}</Text>
          {word.partOfSpeech && (
            <Text style={styles.partOfSpeechPill}>{word.partOfSpeech}</Text>
          )}
        </View>
        <Text numberOfLines={2} style={styles.wordDefinition}>
          {word.simpleDefinition || word.definition}
        </Text>
        {word.commonWords && word.commonWords.length > 0 && (
          <Text numberOfLines={1} style={styles.commonWordsLine}>
            Common words: {word.commonWords.slice(0, 3).join(', ')}
          </Text>
        )}
        {word.pronunciation && (
          <Text numberOfLines={1} style={styles.wordMeta}>
            {word.pronunciation}
          </Text>
        )}
      </View>
      <View style={styles.reviewCount}>
        <Ionicons name="refresh" size={13} color={COLORS.muted} />
        <Text style={styles.reviewText}>{word.reviews}</Text>
      </View>
    </Pressable>
  );
}
