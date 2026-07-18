import { Ionicons } from '@expo/vector-icons';
import { useMemo, useRef, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { STARTER_WORDS } from '../constants/data';
import { COLORS } from '../constants/theme';
import type { AnalyticsData, LegalPage, QuizAnswer, QuizProgress, QuizQuestion, ReminderSettings, SortMode, Word } from '../types';
import { styles } from '../styles';
import { buildQuiz, calculateStreakStats, formatReminderTime, formatStudyTime, getDayKey, getRecentDays, getStreakMessage, getStreakWeek, getWordMastery, shuffle } from '../utils';
import { DashboardSection, DashboardStat, EmptyPractice, HomeAction, HomeMiniCard, LegalLink, LevelRow, QuizComplete, QuizFact, ReminderTimeButton, ScreenHeader, StreakDay, WordInfoPanel, WordRow, SortButton } from '../components';

export function WordsScreen({
  words,
  sortMode,
  onChangeSort,
  onAdd,
  onRemove,
  onStudy,
  onOpenPlus,
  onToggleFlag,
  onSelectWord,
  freeWordUsage,
}: {
  words: Word[];
  sortMode: SortMode;
  onChangeSort: (mode: SortMode) => void;
  onAdd: () => void;
  onRemove: (word: Word) => void;
  onStudy: () => void;
  onOpenPlus: () => void;
  onToggleFlag: (wordId: string) => void;
  onSelectWord: (word: Word) => void;
  freeWordUsage: { wordsAdded: number; limit: number } | null;
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [showFlaggedOnly, setShowFlaggedOnly] = useState(false);
  const listRef = useRef<FlatList<Word>>(null);
  const searchBoxY = useRef(0);
  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const filteredWords = useMemo(() => {
    const searchableWords = showFlaggedOnly
      ? words.filter((word) => word.isFlagged)
      : words;
    if (!normalizedSearchQuery) return searchableWords;

    return searchableWords.filter((word) =>
      [
        word.term,
        word.definition,
        word.simpleDefinition,
        word.partOfSpeech,
        word.pronunciation,
        word.commonWords?.join(' '),
        word.synonyms?.join(' '),
        word.antonyms?.join(' '),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(normalizedSearchQuery),
    );
  }, [normalizedSearchQuery, showFlaggedOnly, words]);
  const isSampleCollection =
    words.length > 0 &&
    words.every((word) =>
      STARTER_WORDS.some((starterWord) => starterWord.id === word.id),
    );

  function scrollSearchIntoView() {
    setIsSearchFocused(true);

    setTimeout(
      () => {
        listRef.current?.scrollToOffset({
          animated: true,
          offset: Math.max(searchBoxY.current - 88, 0),
        });
      },
      Platform.OS === 'ios' ? 160 : 80,
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.screen}
    >
      <FlatList
        ref={listRef}
        data={filteredWords}
        keyExtractor={(item) => item.id}
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.listContent,
          isSearchFocused && styles.listContentKeyboard,
        ]}
        ListHeaderComponent={
          <>
            <ScreenHeader
              eyebrow="MY COLLECTION"
              title="Words worth knowing"
              subtitle="Save new discoveries and make them yours."
            />

            <View style={styles.progressCard}>
              <View style={styles.progressIcon}>
                <Ionicons name="book" size={25} color={COLORS.purpleDark} />
              </View>
              <View style={styles.progressCopy}>
                <Text style={styles.progressNumber}>{words.length} words</Text>
                <Text style={styles.progressLabel}>
                  {words.length === 0
                    ? 'Your collection is ready to grow'
                    : 'Your vocabulary is growing!'}
                </Text>
              </View>
              {words.length > 0 && (
                <Pressable onPress={onStudy} style={styles.studyButton}>
                  <Ionicons name="play" size={15} color={COLORS.white} />
                  <Text style={styles.studyButtonText}>STUDY</Text>
                </Pressable>
              )}
            </View>

            {freeWordUsage ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="View WordWiz Plus plans"
                onPress={onOpenPlus}
                style={({ pressed }) => [styles.freeWordUsageCard, pressed && styles.pressed]}
              >
                <Ionicons name="sparkles-outline" size={19} color={COLORS.purpleDark} />
                <Text style={styles.freeWordUsageText}>
                  {freeWordUsage.wordsAdded} of {freeWordUsage.limit} free words added this month
                </Text>
                <Ionicons name="chevron-forward" size={16} color={COLORS.purpleDark} />
              </Pressable>
            ) : null}

            <Pressable onPress={onAdd} style={styles.addButton}>
              <View style={styles.addIcon}>
                <Ionicons name="add" size={25} color={COLORS.white} />
              </View>
              <View style={styles.addButtonCopy}>
                <Text style={styles.addButtonTitle}>Add a new word</Text>
                <Text style={styles.addButtonSubtitle}>
                  What did you discover today?
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={23} color={COLORS.white} />
            </Pressable>

            {isSampleCollection ? (
              <View style={styles.sampleWordsCard}>
                <View style={styles.sampleWordsIcon}>
                  <Ionicons
                    name="sparkles"
                    size={20}
                    color={COLORS.purpleDark}
                  />
                </View>
                <View style={styles.sampleWordsCopy}>
                  <Text style={styles.sampleWordsTitle}>Sample words</Text>
                  <Text style={styles.sampleWordsText}>
                    These examples let you try cards and quizzes. Add your own
                    first word whenever you are ready.
                  </Text>
                </View>
                <Pressable onPress={onAdd} style={styles.sampleWordsButton}>
                  <Text style={styles.sampleWordsButtonText}>Add</Text>
                </Pressable>
              </View>
            ) : null}

            <View style={styles.listToolbar}>
              <Text style={styles.sectionTitle}>
                {showFlaggedOnly ? 'FLAGGED WORDS' : 'YOUR WORDS'}
              </Text>
              <View style={styles.segmentedControl}>
                <SortButton
                  active={sortMode === 'alphabetical'}
                  icon="text"
                  onPress={() => onChangeSort('alphabetical')}
                />
                <SortButton
                  active={sortMode === 'recent'}
                  icon="time"
                  onPress={() => onChangeSort('recent')}
                />
                <SortButton
                  active={showFlaggedOnly}
                  icon="bookmark"
                  onPress={() => setShowFlaggedOnly((shown) => !shown)}
                />
              </View>
            </View>

            {words.length > 0 ? (
              <Text style={styles.wordListGestureHint}>
                Press and hold a word to delete it
              </Text>
            ) : null}

            {words.length > 0 && (
              <View
                onLayout={(event) => {
                  searchBoxY.current = event.nativeEvent.layout.y;
                }}
                style={styles.wordSearchBox}
              >
                <Ionicons name="search" size={18} color={COLORS.muted} />
                <TextInput
                  autoCapitalize="none"
                  autoCorrect={false}
                  clearButtonMode="never"
                  placeholder="Search words"
                  placeholderTextColor={COLORS.muted}
                  returnKeyType="search"
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  onBlur={() => setIsSearchFocused(false)}
                  onFocus={scrollSearchIntoView}
                  style={styles.wordSearchInput}
                />
                {searchQuery.length > 0 && (
                  <Pressable
                    accessibilityLabel="Clear word search"
                    onPress={() => setSearchQuery('')}
                    style={({ pressed }) => [
                      styles.wordSearchClear,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Ionicons name="close" size={15} color={COLORS.muted} />
                  </Pressable>
                )}
              </View>
            )}
          </>
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <View style={styles.emptyIcon}>
              <Ionicons
                name={normalizedSearchQuery ? 'search-outline' : 'leaf-outline'}
                size={38}
                color={COLORS.green}
              />
            </View>
            <Text style={styles.emptyTitle}>
              {normalizedSearchQuery
                ? 'No words found'
                : showFlaggedOnly
                  ? 'No flagged words yet'
                  : 'Start your collection'}
            </Text>
            <Text style={styles.emptyText}>
              {normalizedSearchQuery
                ? 'Try a different word, meaning, or synonym.'
                : showFlaggedOnly
                  ? 'Flag words while studying to review them here.'
                  : 'Add a word you heard, read, or wondered about.'}
            </Text>
          </View>
        }
        renderItem={({ item, index }) => (
          <WordRow
            word={item}
            index={index}
            onPress={onSelectWord}
            onRemove={onRemove}
            onToggleFlag={onToggleFlag}
          />
        )}
      />
    </KeyboardAvoidingView>
  );
}
