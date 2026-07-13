import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, Text, View } from 'react-native';
import { COLORS } from '../constants/theme';
import type { AnalyticsData, LegalPage, QuizAnswer, QuizProgress, QuizQuestion, ReminderSettings, SortMode, Word } from '../types';
import { styles } from '../styles';
import { buildQuiz, calculateStreakStats, formatReminderTime, formatStudyTime, formatWordAddedDate, getCompleteFlashcardDefinition, getDayKey, getRecentDays, getStreakMessage, getStreakWeek, getWordMastery, getWordMasteryCategoryId, shuffle, sortWordsAlphabetically, WORD_MASTERY_CATEGORIES, type WordMasteryCategoryId } from '../utils';
import { DashboardSection, DashboardStat, EmptyPractice, HomeAction, HomeMiniCard, LegalLink, LevelRow, QuizComplete, QuizFact, ReminderTimeButton, ScreenHeader, SpeakButton, StreakDay, WordInfoPanel, WordRow, SortButton } from '../components';

export function CardsScreen({
  words,
  analytics,
  initialWordId,
  onEditWord,
  onReview,
}: {
  words: Word[];
  analytics: AnalyticsData;
  initialWordId?: string | null;
  onEditWord?: (word: Word) => void;
  onReview: (
    wordId: string,
    remembered: boolean,
    durationSeconds: number,
  ) => void;
}) {
  const [cardIndex, setCardIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [cardStartedAt, setCardStartedAt] = useState(Date.now());
  const [deckOrder, setDeckOrder] = useState<'alphabetical' | 'random'>(
    'alphabetical',
  );
  const [shuffleVersion, setShuffleVersion] = useState(0);
  const [selectedCategory, setSelectedCategory] =
    useState<WordMasteryCategoryId>('all');
  const wordMastery = useMemo(
    () =>
      words.map((word) => ({
        word,
        categoryId: getWordMasteryCategoryId(getWordMastery(word, analytics)),
      })),
    [analytics, words],
  );
  const categoryCounts = useMemo(
    () =>
      WORD_MASTERY_CATEGORIES.reduce(
        (counts, category) => ({
          ...counts,
          [category.id]:
            category.id === 'all'
              ? words.length
              : wordMastery.filter((item) => item.categoryId === category.id)
                  .length,
        }),
        {} as Record<WordMasteryCategoryId, number>,
      ),
    [wordMastery, words.length],
  );
  const filteredWords = useMemo(
    () =>
      selectedCategory === 'all'
        ? words
        : wordMastery
            .filter((item) => item.categoryId === selectedCategory)
            .map((item) => item.word),
    [selectedCategory, wordMastery, words],
  );
  const selectedCategoryDetails =
    WORD_MASTERY_CATEGORIES.find(
      (category) => category.id === selectedCategory,
    ) ?? WORD_MASTERY_CATEGORIES[0];
  const alphabeticalWords = useMemo(
    () => sortWordsAlphabetically(filteredWords),
    [filteredWords],
  );
  const studyWords = useMemo(() => {
    return deckOrder === 'random' ? shuffle(alphabeticalWords) : alphabeticalWords;
  }, [alphabeticalWords, deckOrder, shuffleVersion]);
  const current = studyWords[cardIndex % Math.max(studyWords.length, 1)];
  const currentTermLength = current?.term.trim().length ?? 0;
  const cardDefinition = current
    ? getCompleteFlashcardDefinition(current.definition, current.simpleDefinition)
    : '';
  const showsSimplifiedDefinition = Boolean(
    current && cardDefinition !== current.definition.trim(),
  );

  useEffect(() => {
    const selectedIndex =
      deckOrder === 'alphabetical' && initialWordId
        ? studyWords.findIndex((word) => word.id === initialWordId)
        : -1;

    setCardIndex(Math.max(selectedIndex, 0));
    setShowAnswer(false);
    setCardStartedAt(Date.now());
  }, [
    deckOrder,
    initialWordId,
    selectedCategory,
    shuffleVersion,
    studyWords.length,
  ]);

  function showAlphabeticalDeck() {
    setDeckOrder('alphabetical');
  }

  function randomizeDeck() {
    setDeckOrder('random');
    setShuffleVersion((version) => version + 1);
  }

  const categorySelector = (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.practiceCategoryList}
      style={styles.practiceCategoryScroller}
    >
      {WORD_MASTERY_CATEGORIES.map((category) => {
        const isActive = selectedCategory === category.id;
        const count = categoryCounts[category.id] ?? 0;

        return (
          <Pressable
            key={category.id}
            accessibilityRole="button"
            accessibilityLabel={`Study ${category.label.toLowerCase()}`}
            accessibilityState={{ selected: isActive }}
            onPress={() => setSelectedCategory(category.id)}
            style={[
              styles.practiceCategoryChip,
              isActive && styles.practiceCategoryChipActive,
              { borderColor: isActive ? category.color : '#E5DEF5' },
            ]}
          >
            <View
              style={[
                styles.practiceCategoryIcon,
                { backgroundColor: category.pale },
              ]}
            >
              <Ionicons name={category.icon} size={15} color={category.color} />
            </View>
            <Text
              style={[
                styles.practiceCategoryText,
                isActive && { color: category.color },
              ]}
            >
              {category.shortLabel}
            </Text>
            <Text
              style={[
                styles.practiceCategoryCount,
                isActive && { color: category.color },
              ]}
            >
              {count}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );

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

  function browseCard(direction: 'previous' | 'next') {
    setShowAnswer(false);
    setCardIndex((index) => {
      const nextIndex = direction === 'next' ? index + 1 : index - 1;
      return (nextIndex + studyWords.length) % studyWords.length;
    });
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

  if (studyWords.length === 0) {
    return (
      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.cardScreenContent}
        showsVerticalScrollIndicator={false}
      >
        <ScreenHeader
          eyebrow="FLASHCARDS"
          title="Practice makes progress"
          subtitle="Choose a word group to study."
        />
        {categorySelector}
        <View
          style={[
            styles.practiceCategoryBanner,
            { backgroundColor: selectedCategoryDetails.pale },
          ]}
        >
          <Ionicons
            name={selectedCategoryDetails.icon}
            size={17}
            color={selectedCategoryDetails.color}
          />
          <Text
            style={[
              styles.practiceCategoryBannerText,
              { color: selectedCategoryDetails.color },
            ]}
          >
            No {selectedCategoryDetails.shortLabel.toLowerCase()} words yet
          </Text>
        </View>
        <EmptyPractice
          icon="albums-outline"
          label="Pick another group or keep reviewing to move words here."
        />
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

      {categorySelector}
      <View
        style={[
          styles.practiceCategoryBanner,
          { backgroundColor: selectedCategoryDetails.pale },
        ]}
      >
        <Ionicons
          name={selectedCategoryDetails.icon}
          size={17}
          color={selectedCategoryDetails.color}
        />
        <Text
          style={[
            styles.practiceCategoryBannerText,
            { color: selectedCategoryDetails.color },
          ]}
        >
          {studyWords.length} {selectedCategoryDetails.shortLabel.toLowerCase()} words in this deck
        </Text>
      </View>

      <View style={styles.flashcardOrderRow}>
        <Text style={styles.flashcardOrderLabel}>Deck order</Text>
        <View style={styles.flashcardOrderControl}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Sort flashcards alphabetically"
            accessibilityState={{ selected: deckOrder === 'alphabetical' }}
            onPress={showAlphabeticalDeck}
            style={({ pressed }) => [
              styles.flashcardOrderButton,
              deckOrder === 'alphabetical' && styles.flashcardOrderButtonActive,
              pressed && styles.pressed,
            ]}
          >
            <Ionicons
              name="text-outline"
              size={14}
              color={
                deckOrder === 'alphabetical'
                  ? COLORS.purpleDark
                  : COLORS.muted
              }
            />
            <Text
              style={[
                styles.flashcardOrderButtonText,
                deckOrder === 'alphabetical' &&
                  styles.flashcardOrderButtonTextActive,
              ]}
            >
              A–Z
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Randomize flashcard order"
            accessibilityState={{ selected: deckOrder === 'random' }}
            onPress={randomizeDeck}
            style={({ pressed }) => [
              styles.flashcardOrderButton,
              deckOrder === 'random' && styles.flashcardOrderButtonActive,
              pressed && styles.pressed,
            ]}
          >
            <Ionicons
              name="shuffle"
              size={14}
              color={deckOrder === 'random' ? COLORS.purpleDark : COLORS.muted}
            />
            <Text
              style={[
                styles.flashcardOrderButtonText,
                deckOrder === 'random' && styles.flashcardOrderButtonTextActive,
              ]}
            >
              Shuffle
            </Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.cardStudyToolbar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Previous flashcard"
          onPress={() => browseCard('previous')}
          style={({ pressed }) => [
            styles.cardNavigationButton,
            pressed && styles.pressed,
          ]}
        >
          <Ionicons name="chevron-back" size={22} color={COLORS.purpleDark} />
        </Pressable>

        <View style={styles.cardProgressRow}>
          {(() => {
            const cardProgress =
              (((cardIndex % studyWords.length) + 1) / studyWords.length) * 100;

            return (
              <>
                <Text style={styles.cardProgressText}>
                  CARD {(cardIndex % studyWords.length) + 1} OF{' '}
                  {studyWords.length}
                </Text>
                <View style={styles.progressTrack}>
                  <View
                    style={[
                      styles.progressFill,
                      {
                        width: `${cardProgress}%`,
                      },
                    ]}
                  />
                </View>
              </>
            );
          })()}
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Next flashcard"
          onPress={() => browseCard('next')}
          style={({ pressed }) => [
            styles.cardNavigationButton,
            pressed && styles.pressed,
          ]}
        >
          <Ionicons name="chevron-forward" size={22} color={COLORS.purpleDark} />
        </Pressable>
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
          <View style={styles.flashcardWordRow}>
            <Text
              adjustsFontSizeToFit
              minimumFontScale={0.48}
              numberOfLines={1}
              style={[
                styles.flashcardWord,
                currentTermLength > 10 && styles.flashcardWordLong,
                currentTermLength > 14 && styles.flashcardWordExtraLong,
                currentTermLength > 20 && styles.flashcardWordTiny,
              ]}
            >
              {current.term}
            </Text>
            <SpeakButton term={current.term} size="large" />
          </View>
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
                {cardDefinition}
              </Text>
              {showsSimplifiedDefinition && (
                <Text style={styles.fullDefinitionText}>
                  Full meaning: {current.definition}
                </Text>
              )}
              <WordInfoPanel word={current} onEdit={onEditWord} />
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
          {!showAnswer && (
            <View
              accessible
              accessibilityLabel={formatWordAddedDate(current.createdAt)}
              style={[
                styles.flashcardAddedMeta,
                styles.flashcardFrontAddedMeta,
              ]}
            >
              <Ionicons
                name="calendar-outline"
                size={13}
                color={COLORS.muted}
              />
              <Text style={styles.flashcardAddedText}>
                {formatWordAddedDate(current.createdAt)}
              </Text>
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
