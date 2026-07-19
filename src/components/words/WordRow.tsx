import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef } from 'react';
import { Pressable, Text, View } from 'react-native';
import { COLORS, TILE_COLORS } from '../../constants/theme';
import type { Word } from '../../types';
import { styles } from '../../styles';
import { formatWordAddedDate, formatWordFlaggedDate } from '../../utils';
import { SpeakButton, SpeakDefinitionButton } from '../shared/SpeakButton';

function getLetterColor(term: string) {
  const firstLetter = term.trim().charAt(0).toUpperCase();
  const alphabetIndex = Math.max(0, firstLetter.charCodeAt(0) - 65);

  return TILE_COLORS[alphabetIndex % TILE_COLORS.length].accent;
}

export function WordRow({
  word,
  onPress,
  onDoublePress,
  onRemove,
  onToggleFlag,
}: {
  word: Word;
  index: number;
  onPress?: (word: Word) => void;
  onDoublePress?: (word: Word) => void;
  onRemove: (word: Word) => void;
  onToggleFlag: (wordId: string) => void;
}) {
  const letterColor = getLetterColor(word.term);
  const lastPressAt = useRef(0);
  const singlePressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (singlePressTimer.current) clearTimeout(singlePressTimer.current);
  }, []);

  function handlePress() {
    if (!onDoublePress) {
      onPress?.(word);
      return;
    }

    const now = Date.now();
    if (now - lastPressAt.current < 280) {
      if (singlePressTimer.current) clearTimeout(singlePressTimer.current);
      singlePressTimer.current = null;
      lastPressAt.current = 0;
      onDoublePress(word);
      return;
    }

    lastPressAt.current = now;
    singlePressTimer.current = setTimeout(() => {
      lastPressAt.current = 0;
      onPress?.(word);
    }, 280);
  }

  return (
    <View style={styles.wordRow}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Study ${word.term} flashcard`}
        accessibilityHint="Opens this word in flashcards. Double tap to pause or resume automatic practice; press and hold to delete it."
        onPress={handlePress}
        onLongPress={() => onRemove(word)}
        style={({ pressed }) => [
          styles.wordRowMain,
          pressed && styles.pressed,
        ]}
      >
        <View style={[styles.letterBadge, { backgroundColor: `${letterColor}18` }]}>
          <Text style={[styles.letterText, { color: letterColor }]}>
            {word.term.charAt(0).toUpperCase()}
          </Text>
        </View>
        <View style={styles.wordRowCopy}>
          <View style={styles.wordTitleRow}>
            <View style={styles.wordTermMeta}>
            <Text
              ellipsizeMode="tail"
              maxFontSizeMultiplier={1.18}
              numberOfLines={1}
              style={styles.wordTerm}
            >
              {word.term}
            </Text>
            {word.partOfSpeech && (
              <Text maxFontSizeMultiplier={1.1} style={styles.partOfSpeechPill}>
                {word.partOfSpeech}
              </Text>
            )}
            </View>
          </View>
          <View style={styles.wordDefinitionRow}>
            <Text maxFontSizeMultiplier={1.2} numberOfLines={2} style={styles.wordDefinition}>
              {word.simpleDefinition || word.definition}
            </Text>
          </View>
          {word.commonWords && word.commonWords.length > 0 && (
            <Text maxFontSizeMultiplier={1.18} numberOfLines={1} style={styles.commonWordsLine}>
              Synonyms: {word.commonWords.slice(0, 3).join(', ')}
            </Text>
          )}
          {word.pronunciation && (
            <Text maxFontSizeMultiplier={1.15} numberOfLines={1} style={styles.wordMeta}>
              {word.pronunciation}
            </Text>
          )}
          <View style={styles.wordDateMetaRow}>
            <View style={styles.wordAddedMeta}>
              <Ionicons name="calendar-outline" size={11} color={COLORS.muted} />
              <Text maxFontSizeMultiplier={1.15} style={styles.wordAddedText}>
                {formatWordAddedDate(word.createdAt)}
              </Text>
            </View>
            {word.isFlagged ? (
              <View style={styles.wordFlaggedMeta}>
                <Ionicons name="bookmark" size={11} color={COLORS.purpleDark} />
                <Text maxFontSizeMultiplier={1.15} style={styles.wordFlaggedText}>
                  {formatWordFlaggedDate(word.flaggedAt)}
                </Text>
              </View>
            ) : null}
            {word.mastery?.excludedFromPractice ? (
              <View style={styles.wordPausedMeta}>
                <Ionicons name="pause-circle" size={11} color={COLORS.orange} />
                <Text maxFontSizeMultiplier={1.15} style={styles.wordPausedText}>
                  Practice paused
                </Text>
              </View>
            ) : null}
          </View>
        </View>
      </Pressable>
      <View style={styles.wordRowActions}>
        <View style={styles.wordRowAudioActions}>
          <SpeakButton term={word.term} />
          <SpeakDefinitionButton
            definition={word.simpleDefinition || word.definition}
            term={word.term}
          />
          <View style={styles.reviewCount}>
            <Ionicons name="refresh" size={13} color={COLORS.muted} />
            <Text maxFontSizeMultiplier={1.15} style={styles.reviewText}>{word.reviews}</Text>
          </View>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            word.isFlagged ? 'Remove word from flagged words' : 'Flag word'
          }
          accessibilityState={{ selected: word.isFlagged }}
          onPress={() => onToggleFlag(word.id)}
          style={({ pressed }) => [
            styles.wordFlagButton,
            word.isFlagged && styles.wordFlagButtonActive,
            pressed && styles.pressed,
          ]}
        >
          <Ionicons
            name={word.isFlagged ? 'bookmark' : 'bookmark-outline'}
            size={17}
            color={word.isFlagged ? COLORS.purpleDark : COLORS.muted}
          />
        </Pressable>
      </View>
    </View>
  );
}
