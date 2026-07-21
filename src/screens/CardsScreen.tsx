import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AppState, FlatList, Pressable, ScrollView, Text, View } from 'react-native';
import { COLORS } from '../constants/theme';
import type { AnalyticsData, LegalPage, QuizAnswer, QuizProgress, QuizQuestion, ReminderSettings, SortMode, Word } from '../types';
import { styles } from '../styles';
import { buildQuiz, calculateStreakStats, formatReminderTime, formatStudyTime, formatWordAddedDate, formatWordFlaggedDate, getCompleteFlashcardDefinition, getDayKey, getNewStudyWords, getRecentDays, getStreakMessage, getStreakWeek, getStudySets, getWordLearningContexts, getWordMastery, getWordMasteryCategoryForWord, NEW_STUDY_GROUP, shuffle, sortWordsAlphabetically, WORD_MASTERY_CATEGORIES, type WordMasteryCategoryId } from '../utils';
import { DashboardSection, DashboardStat, EmptyPractice, HomeAction, HomeMiniCard, LegalLink, LevelRow, ProgressFill, QuizComplete, QuizFact, ReminderTimeButton, ScreenHeader, SpeakButton, SpeakDefinitionButton, StreakDay, WordInfoPanel, WordRow, SortButton } from '../components';

type CardsStudyGroupId = WordMasteryCategoryId | 'new' | 'flagged' | `set:${string}`;

type CardsStudyGroup = {
  id: CardsStudyGroupId;
  label: string;
  shortLabel: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  pale: string;
};

const FLAGGED_STUDY_GROUP = {
  id: 'flagged' as const,
  label: 'Flagged Words',
  shortLabel: 'Flagged',
  icon: 'bookmark' as const,
  color: COLORS.purpleDark,
  pale: COLORS.purplePale,
};

export function CardsScreen({
  words,
  analytics,
  initialWordId,
  initialStudyGroup,
  onEditWord,
  onReview,
  onToggleFlag,
  onOpenStudySetBuilder,
}: {
  words: Word[];
  analytics: AnalyticsData;
  initialWordId?: string | null;
  initialStudyGroup?: 'flagged';
  onEditWord?: (word: Word) => void;
  onReview: (
    wordId: string,
    remembered: boolean,
    durationSeconds: number,
  ) => void;
  onToggleFlag: (wordId: string) => void;
  onOpenStudySetBuilder: () => void;
}) {
  const [cardIndex, setCardIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const cardActiveSince = useRef(Date.now());
  const cardActiveElapsedMs = useRef(0);
  const [deckOrder, setDeckOrder] = useState<'alphabetical' | 'random'>(
    'alphabetical',
  );
  const [shuffleVersion, setShuffleVersion] = useState(0);
  const [selectedCategory, setSelectedCategory] =
    useState<CardsStudyGroupId>(initialStudyGroup ?? 'all');
  const [flaggedSessionIds, setFlaggedSessionIds] = useState<string[] | null>(
    initialStudyGroup === 'flagged'
      ? words.filter((word) => word.isFlagged).map((word) => word.id)
      : null,
  );
  const wordMastery = useMemo(
    () =>
      words.map((word) => ({
        word,
        categoryId: getWordMasteryCategoryForWord(word, analytics).id,
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
  const flaggedCount = useMemo(
    () => words.filter((word) => word.isFlagged).length,
    [words],
  );
  const newWords = useMemo(
    () => getNewStudyWords(words, analytics),
    [analytics, words],
  );
  const studySets = useMemo(() => getStudySets(words), [words]);
  const filteredWords = useMemo(
    () =>
      selectedCategory === 'all'
        ? words
        : selectedCategory === 'new'
          ? newWords
        : selectedCategory === 'flagged'
          ? words.filter((word) =>
              (flaggedSessionIds ?? words.filter((item) => item.isFlagged).map((item) => item.id)).includes(word.id),
            )
        : selectedCategory.startsWith('set:')
          ? words.filter((word) =>
              word.mastery?.studySets?.some(
                (set) => set.id === selectedCategory.slice(4),
              ),
            )
        : wordMastery
            .filter((item) => item.categoryId === selectedCategory)
            .map((item) => item.word),
    [flaggedSessionIds, newWords, selectedCategory, wordMastery, words],
  );
  const studyGroups: CardsStudyGroup[] = [
    WORD_MASTERY_CATEGORIES[0],
    NEW_STUDY_GROUP,
    ...WORD_MASTERY_CATEGORIES.slice(1),
    FLAGGED_STUDY_GROUP,
  ];
  const studySetGroups: CardsStudyGroup[] = studySets.map((set) => ({
    id: `set:${set.id}`,
    label: set.name,
    shortLabel: set.name,
    icon: 'layers',
    color: COLORS.blue,
    pale: COLORS.bluePale,
  }));
  const selectedCategoryDetails =
    [...studyGroups, ...studySetGroups].find(
      (category) => category.id === selectedCategory,
    ) ?? studyGroups[0];
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
  const learningContexts = current ? getWordLearningContexts(current) : [];
  const showsSimplifiedDefinition = Boolean(
    current && cardDefinition !== current.definition.trim(),
  );

  function resetCardTimer() {
    cardActiveElapsedMs.current = 0;
    cardActiveSince.current = Date.now();
  }

  function getActiveCardDurationSeconds() {
    const activeSegment = cardActiveSince.current
      ? Date.now() - cardActiveSince.current
      : 0;
    return Math.max(
      1,
      Math.min(120, Math.round((cardActiveElapsedMs.current + activeSegment) / 1000)),
    );
  }

  useEffect(() => {
    if (initialStudyGroup === 'flagged') {
      setSelectedCategory('flagged');
      setFlaggedSessionIds(words.filter((word) => word.isFlagged).map((word) => word.id));
    }
  }, [initialStudyGroup]);

  useEffect(() => {
    if (
      selectedCategory.startsWith('set:') &&
      !studySets.some((set) => `set:${set.id}` === selectedCategory)
    ) {
      setSelectedCategory('all');
    }
  }, [selectedCategory, studySets]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        if (!cardActiveSince.current) {
          cardActiveSince.current = Date.now();
        }
        return;
      }

      if (cardActiveSince.current) {
        cardActiveElapsedMs.current += Date.now() - cardActiveSince.current;
        cardActiveSince.current = 0;
      }
    });

    return () => subscription.remove();
  }, []);

  useEffect(() => {
    const selectedIndex =
      deckOrder === 'alphabetical' && initialWordId
        ? studyWords.findIndex((word) => word.id === initialWordId)
        : -1;

    setCardIndex(Math.max(selectedIndex, 0));
    setShowAnswer(false);
    resetCardTimer();
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
      {studyGroups.map((category) => {
        const isActive = selectedCategory === category.id;
        const count =
          category.id === 'new'
            ? newWords.length
            : category.id === 'flagged'
            ? flaggedCount
            : categoryCounts[category.id as WordMasteryCategoryId] ?? 0;

        return (
          <Pressable
            key={category.id}
            accessibilityRole="button"
            accessibilityLabel={`Study ${category.label.toLowerCase()}`}
            accessibilityState={{ selected: isActive }}
            onPress={() => {
              setSelectedCategory(category.id);
              setFlaggedSessionIds(
                category.id === 'flagged'
                  ? words.filter((word) => word.isFlagged).map((word) => word.id)
                  : null,
              );
            }}
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

  const studySetSelector = (
    <View style={styles.practiceStudySetsRow}>
      <View style={styles.practiceStudySetsHeading}>
        <Ionicons name="layers-outline" size={15} color={COLORS.blue} />
        <Text style={styles.practiceStudySetsTitle}>MY SETS</Text>
      </View>
      {studySets.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.practiceStudySetsScroller}
          contentContainerStyle={styles.practiceStudySetsList}
        >
          {studySetGroups.map((set) => {
            const isActive = selectedCategory === set.id;
            const count = studySets.find((studySet) => `set:${studySet.id}` === set.id)?.wordIds.length ?? 0;
            return (
              <Pressable
                key={set.id}
                accessibilityRole="button"
                accessibilityLabel={`Study ${set.label}`}
                accessibilityState={{ selected: isActive }}
                onPress={() => {
                  setSelectedCategory(set.id);
                  setFlaggedSessionIds(null);
                }}
                style={[
                  styles.practiceStudySetChip,
                  isActive && styles.practiceStudySetChipActive,
                ]}
              >
                <Text
                  numberOfLines={1}
                  style={[
                    styles.practiceStudySetText,
                    isActive && styles.practiceStudySetTextActive,
                  ]}
                >
                  {set.shortLabel}
                </Text>
                <Text
                  style={[
                    styles.practiceStudySetCount,
                    isActive && styles.practiceStudySetTextActive,
                  ]}
                >
                  {count}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : (
        <Text numberOfLines={1} style={styles.practiceStudySetsEmpty}>
          Create a focused deck
        </Text>
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Create a study set"
        accessibilityHint="Choose saved words for a focused flashcard deck or quiz."
        onPress={onOpenStudySetBuilder}
        style={({ pressed }) => [
          styles.practiceStudySetAddButton,
          pressed && styles.pressed,
        ]}
      >
        <Ionicons name="add" size={19} color={COLORS.blue} />
      </Pressable>
    </View>
  );

  function nextCard(remembered: boolean) {
    if (!current) return;
    const durationSeconds = getActiveCardDurationSeconds();
    onReview(current.id, remembered, durationSeconds);
    setShowAnswer(false);
    setCardIndex((index) => (index + 1) % studyWords.length);
    resetCardTimer();
  }

  function browseCard(direction: 'previous' | 'next') {
    setShowAnswer(false);
    setCardIndex((index) => {
      const nextIndex = direction === 'next' ? index + 1 : index - 1;
      return (nextIndex + studyWords.length) % studyWords.length;
    });
    resetCardTimer();
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
        {studySetSelector}
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
          label={
            selectedCategory === 'new'
              ? 'Words you add will stay here until you study them once.'
              : selectedCategory === 'flagged'
                ? 'Flag words while studying to review them here.'
                : 'Pick another group or keep reviewing to move words here.'
          }
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
      {studySetSelector}
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
                  <ProgressFill
                    color={COLORS.teal}
                    progress={cardProgress}
                    radius={5}
                    style={{ width: `${cardProgress}%` }}
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

      <View style={styles.flashcardShell}>
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
              <View style={styles.flashcardDefinitionAction}>
                <SpeakDefinitionButton
                  definition={cardDefinition}
                  term={current.term}
                />
              </View>
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
                <View style={styles.contextExampleCopy}>
                  <Text style={styles.contextExampleTitle}>CONTEXT CLUES</Text>
                  {learningContexts.map((context) => (
                    <View key={context.text} style={styles.contextExampleRow}>
                      <Text style={styles.contextExampleLabel}>{context.label}</Text>
                      <Text style={styles.exampleText}>“{context.text}”</Text>
                    </View>
                  ))}
                </View>
              </View>
            </>
          ) : (
            <View style={styles.tapHint}>
              <Ionicons name="finger-print" size={23} color={COLORS.muted} />
              <Text style={styles.tapHintText}>Tap to reveal the meaning</Text>
            </View>
          )}
          {!showAnswer && (
            <View style={styles.flashcardFrontMetaRow}>
              <View
                accessible
                accessibilityLabel={formatWordAddedDate(current.createdAt)}
                style={styles.flashcardAddedMeta}
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
              {current.isFlagged ? (
                <View
                  accessible
                  accessibilityLabel={formatWordFlaggedDate(current.flaggedAt)}
                  style={[styles.flashcardAddedMeta, styles.flashcardFlaggedMeta]}
                >
                  <Ionicons name="bookmark" size={12} color={COLORS.purpleDark} />
                  <Text style={[styles.flashcardAddedText, styles.flashcardFlaggedText]}>
                    {formatWordFlaggedDate(current.flaggedAt)}
                  </Text>
                </View>
              ) : null}
            </View>
          )}
        </View>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          current.isFlagged
            ? 'Remove word from flagged words'
            : 'Flag word'
        }
        accessibilityState={{ selected: current.isFlagged }}
        onPress={() => onToggleFlag(current.id)}
        style={({ pressed }) => [
          styles.flashcardBookmarkButton,
          current.isFlagged && styles.flashcardBookmarkButtonActive,
          pressed && styles.pressed,
        ]}
      >
        <Ionicons
          name={current.isFlagged ? 'bookmark' : 'bookmark-outline'}
          size={19}
          color={current.isFlagged ? COLORS.purpleDark : COLORS.muted}
        />
      </Pressable>
      </View>

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
              STILL LEARNING
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
              I KNEW IT
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
