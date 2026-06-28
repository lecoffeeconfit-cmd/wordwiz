import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, Text, View } from 'react-native';
import { COLORS } from '../constants/theme';
import type { AnalyticsData, LegalPage, QuizAnswer, QuizProgress, QuizQuestion, ReminderSettings, SortMode, Word } from '../types';
import { styles } from '../styles';
import { buildQuiz, calculateStreakStats, formatReminderTime, formatStudyTime, getDayKey, getRecentDays, getStreakMessage, getStreakWeek, getWordMastery, shuffle } from '../utils';
import { DashboardSection, DashboardStat, EmptyPractice, HomeAction, HomeMiniCard, LegalLink, LevelRow, QuizComplete, QuizFact, ReminderTimeButton, ScreenHeader, StreakDay, WordInfoPanel, WordRow, SortButton } from '../components';

export function CardsScreen({
  words,
  initialWordId,
  onReview,
}: {
  words: Word[];
  initialWordId?: string | null;
  onReview: (
    wordId: string,
    remembered: boolean,
    durationSeconds: number,
  ) => void;
}) {
  const [cardIndex, setCardIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [cardStartedAt, setCardStartedAt] = useState(Date.now());
  const studyWords = useMemo(() => {
    const shuffledWords = shuffle(words);
    if (!initialWordId) {
      return shuffledWords;
    }

    const selectedIndex = shuffledWords.findIndex(
      (word) => word.id === initialWordId,
    );
    if (selectedIndex <= 0) {
      return shuffledWords;
    }

    const selectedWord = shuffledWords[selectedIndex];
    return [
      selectedWord,
      ...shuffledWords.slice(0, selectedIndex),
      ...shuffledWords.slice(selectedIndex + 1),
    ];
  }, [initialWordId, words]);
  const current = studyWords[cardIndex % Math.max(studyWords.length, 1)];

  useEffect(() => {
    setCardIndex(0);
    setShowAnswer(false);
    setCardStartedAt(Date.now());
  }, [initialWordId, words.length]);

  function nextCard(remembered: boolean) {
    if (!current) return;
    const durationSeconds = Math.max(
      1,
      Math.min(120, Math.round((Date.now() - cardStartedAt) / 1000)),
    );
    onReview(current.id, remembered, durationSeconds);
    setShowAnswer(false);
    setCardIndex((index) => (index + 1) % studyWords.length);
    setCardStartedAt(Date.now());
  }

  if (words.length === 0) {
    return (
      <ScrollView contentContainerStyle={styles.singleScreenContent}>
        <ScreenHeader
          eyebrow="FLASHCARDS"
          title="Practice makes progress"
          subtitle="Your saved words will turn into study cards."
        />
        <EmptyPractice icon="albums-outline" label="Add a word to begin studying." />
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.cardScreenContent}
      showsVerticalScrollIndicator={false}
    >
      <ScreenHeader
        eyebrow="FLASHCARDS"
        title="Practice makes progress"
        subtitle="Tap the card, then tell us how it felt."
      />

      <View style={styles.cardProgressRow}>
        <Text style={styles.cardProgressText}>
          CARD {(cardIndex % studyWords.length) + 1} OF {studyWords.length}
        </Text>
        <View style={styles.progressTrack}>
          <View
            style={[
              styles.progressFill,
              {
                width: `${
                  (((cardIndex % studyWords.length) + 1) / studyWords.length) *
                  100
                }%`,
              },
            ]}
          />
        </View>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={showAnswer ? 'Definition shown' : 'Reveal definition'}
        onPress={() => setShowAnswer((shown) => !shown)}
        style={({ pressed }) => [
          styles.flashcard,
          showAnswer && styles.flashcardRevealed,
          pressed && styles.flashcardPressed,
        ]}
      >
        <View style={styles.cardTopRow}>
          <View
            style={[
              styles.cardLabel,
              showAnswer && styles.cardLabelRevealed,
            ]}
          >
            <Text
              style={[
                styles.cardLabelText,
                showAnswer && styles.cardLabelTextRevealed,
              ]}
            >
              {showAnswer ? 'MEANING' : 'YOUR WORD'}
            </Text>
          </View>
          <Ionicons
            name={showAnswer ? 'bulb' : 'eye-outline'}
            size={23}
            color={showAnswer ? COLORS.yellow : COLORS.blue}
          />
        </View>

        <View style={styles.flashcardBody}>
          <Text style={styles.flashcardWord}>{current.term}</Text>
          {!showAnswer && (
            <View style={styles.flashcardMetaRow}>
              {current.partOfSpeech && (
                <Text style={styles.flashcardMetaPill}>
                  {current.partOfSpeech}
                </Text>
              )}
              {current.pronunciation && (
                <Text style={styles.flashcardPronunciation}>
                  {current.pronunciation}
                </Text>
              )}
            </View>
          )}
          {showAnswer ? (
            <>
              <Text style={styles.flashcardDefinition}>
                {current.simpleDefinition || current.definition}
              </Text>
              {current.simpleDefinition && (
                <Text style={styles.fullDefinitionText}>
                  Full meaning: {current.definition}
                </Text>
              )}
              <WordInfoPanel word={current} />
              <View style={styles.exampleBox}>
                <Ionicons
                  name="chatbox-ellipses-outline"
                  size={19}
                  color={COLORS.purple}
                />
                <Text style={styles.exampleText}>“{current.example}”</Text>
              </View>
            </>
          ) : (
            <View style={styles.tapHint}>
              <Ionicons name="finger-print" size={23} color={COLORS.muted} />
              <Text style={styles.tapHintText}>Tap to reveal the meaning</Text>
            </View>
          )}
        </View>
      </Pressable>

      {showAnswer ? (
        <View style={styles.cardActions}>
          <Pressable
            onPress={() => nextCard(false)}
            style={({ pressed }) => [
              styles.answerButton,
              styles.againButton,
              pressed && styles.pressed,
            ]}
          >
            <Ionicons name="refresh" size={21} color={COLORS.red} />
            <Text style={[styles.answerButtonText, { color: COLORS.red }]}>
              AGAIN
            </Text>
          </Pressable>
          <Pressable
            onPress={() => nextCard(true)}
            style={({ pressed }) => [
              styles.answerButton,
              styles.gotItButton,
              pressed && styles.pressed,
            ]}
          >
            <Ionicons name="checkmark-circle" size={22} color={COLORS.white} />
            <Text style={[styles.answerButtonText, { color: COLORS.white }]}>
              GOT IT
            </Text>
          </Pressable>
        </View>
      ) : (
        <Text style={styles.cardTip}>
          Try saying the definition before you flip the card.
        </Text>
      )}
    </ScrollView>
  );
}
