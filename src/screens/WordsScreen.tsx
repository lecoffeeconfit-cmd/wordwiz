import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
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
}: {
  words: Word[];
  sortMode: SortMode;
  onChangeSort: (mode: SortMode) => void;
  onAdd: () => void;
  onRemove: (word: Word) => void;
  onStudy: () => void;
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const filteredWords = useMemo(() => {
    if (!normalizedSearchQuery) {
      return words;
    }

    return words.filter((word) =>
      [
        word.term,
        word.definition,
        word.simpleDefinition,
        word.partOfSpeech,
        word.pronunciation,
        word.commonWords?.join(' '),
        word.synonyms?.join(' '),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(normalizedSearchQuery),
    );
  }, [normalizedSearchQuery, words]);
  const isSampleCollection =
    words.length > 0 &&
    words.every((word) =>
      STARTER_WORDS.some((starterWord) => starterWord.id === word.id),
    );

  return (
    <View style={styles.screen}>
      <FlatList
        data={filteredWords}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
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
              <Text style={styles.sectionTitle}>YOUR WORDS</Text>
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
              </View>
            </View>

            {words.length > 0 && (
              <View style={styles.wordSearchBox}>
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
              {normalizedSearchQuery ? 'No words found' : 'Start your collection'}
            </Text>
            <Text style={styles.emptyText}>
              {normalizedSearchQuery
                ? 'Try a different word, meaning, or synonym.'
                : 'Add a word you heard, read, or wondered about.'}
            </Text>
          </View>
        }
        renderItem={({ item, index }) => (
          <WordRow word={item} index={index} onRemove={onRemove} />
        )}
      />
    </View>
  );
}
