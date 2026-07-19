import { Ionicons } from '@expo/vector-icons';
import { useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { STARTER_WORDS } from '../constants/data';
import {
  WORDWIZ_STARTER_COLLECTIONS,
  type WordWizStarterCollection,
} from '../constants/wordCollections';
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
  onTogglePracticeExclusion,
  onAddStarterCollection,
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
  onTogglePracticeExclusion: (wordId: string) => void;
  onAddStarterCollection: (collection: WordWizStarterCollection) => Promise<{
    added: number;
    alreadySaved: number;
    blocked?: boolean;
  }>;
  freeWordUsage: { wordsAdded: number; limit: number } | null;
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [showFlaggedOnly, setShowFlaggedOnly] = useState(false);
  const [showCollections, setShowCollections] = useState(false);
  const [addingCollectionId, setAddingCollectionId] = useState<string | null>(null);
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

  async function addCollection(collection: WordWizStarterCollection) {
    setAddingCollectionId(collection.id);
    try {
      const result = await onAddStarterCollection(collection);
      if (!result.blocked) {
        const added = result.added
          ? `Added ${result.added} ${result.added === 1 ? 'word' : 'words'} to your collection.`
          : 'Every word in this collection is already saved.';
        const kept = result.alreadySaved
          ? ` ${result.alreadySaved} existing ${result.alreadySaved === 1 ? 'word was' : 'words were'} kept as-is.`
          : '';
        Alert.alert('Collection ready', `${added}${kept}`);
        setShowCollections(false);
      }
    } finally {
      setAddingCollectionId(null);
    }
  }

  function openPracticeSettings(word: Word) {
    const isPaused = word.mastery?.excludedFromPractice === true;
    Alert.alert(
      isPaused ? 'Resume automatic practice?' : 'Pause automatic practice?',
      isPaused
        ? `${word.term} will return to your quizzes and review queue.`
        : `${word.term} stays in your collection but will not appear in automatic quizzes or due reviews until you resume it.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: isPaused ? 'Resume practice' : 'Pause practice',
          onPress: () => onTogglePracticeExclusion(word.id),
        },
      ],
    );
  }

  return (
    <>
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

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Browse WordWiz starter collections"
              accessibilityHint="Preview optional word lists and add the ones you want."
              onPress={() => setShowCollections(true)}
              style={({ pressed }) => [styles.wordCollectionsButton, pressed && styles.pressed]}
            >
              <View style={styles.wordCollectionsIcon}>
                <Ionicons name="library" size={22} color={COLORS.purpleDark} />
              </View>
              <View style={styles.wordCollectionsCopy}>
                <Text style={styles.wordCollectionsTitle}>WordWiz collections</Text>
                <Text style={styles.wordCollectionsSubtitle}>
                  Add a ready-to-learn word set
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={21} color={COLORS.purpleDark} />
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
                Double-tap a word to pause practice · Press and hold to delete
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
            onDoublePress={openPracticeSettings}
            onRemove={onRemove}
            onToggleFlag={onToggleFlag}
          />
        )}
        />
      </KeyboardAvoidingView>

      <Modal
        animationType="slide"
        transparent
        visible={showCollections}
        onRequestClose={() => setShowCollections(false)}
      >
        <View style={styles.collectionModalBackdrop}>
          <Pressable
            accessibilityLabel="Close WordWiz collections"
            onPress={() => setShowCollections(false)}
            style={styles.collectionModalDismiss}
          />
          <View style={styles.collectionModalSheet}>
            <View style={styles.collectionModalHandle} />
            <View style={styles.collectionModalHeader}>
              <View style={styles.collectionModalHeaderCopy}>
                <Text style={styles.collectionModalEyebrow}>WORDWIZ COLLECTIONS</Text>
                <Text style={styles.collectionModalTitle}>Choose your next set</Text>
                <Text style={styles.collectionModalSubtitle}>
                  Preview a collection, then add only the words you want to learn.
                </Text>
              </View>
              <Pressable
                accessibilityLabel="Close WordWiz collections"
                onPress={() => setShowCollections(false)}
                style={styles.collectionModalClose}
              >
                <Ionicons name="close" size={21} color={COLORS.ink} />
              </Pressable>
            </View>

            <ScrollView
              bounces={false}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.collectionModalList}
            >
            {WORDWIZ_STARTER_COLLECTIONS.map((collection) => {
              const alreadySaved = collection.words.filter((collectionWord) =>
                words.some((word) => word.term.toLowerCase() === collectionWord.term.toLowerCase()),
              ).length;
              const isAdding = addingCollectionId === collection.id;
              const isPurple = collection.color === 'purple';
              const remainingCount = collection.words.length - alreadySaved;
              return (
                <View
                  key={collection.id}
                  style={[
                    styles.collectionCard,
                    isPurple ? styles.collectionCardPurple : styles.collectionCardOrange,
                  ]}
                >
                  <View style={styles.collectionCardTopRow}>
                    <View style={[
                      styles.collectionCardIcon,
                      isPurple ? styles.collectionIconPurple : styles.collectionIconOrange,
                    ]}>
                      <Ionicons
                        name={collection.icon}
                        size={22}
                        color={isPurple ? COLORS.purpleDark : COLORS.orange}
                      />
                    </View>
                    <View style={styles.collectionCardCopy}>
                      <Text style={styles.collectionCardTitle}>{collection.title}</Text>
                      <Text style={styles.collectionCardCount}>{collection.subtitle}</Text>
                    </View>
                  </View>
                  <Text style={styles.collectionCardDescription}>{collection.description}</Text>
                  <Text numberOfLines={1} style={styles.collectionCardPreview}>
                    Includes {collection.words.slice(0, 4).map((word) => word.term).join(' · ')}
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Add ${collection.title} collection`}
                    disabled={isAdding || remainingCount === 0}
                    onPress={() => void addCollection(collection)}
                    style={({ pressed }) => [
                      styles.collectionAddButton,
                      isPurple ? styles.collectionAddButtonPurple : styles.collectionAddButtonOrange,
                      (pressed || isAdding) && styles.pressed,
                      remainingCount === 0 && styles.collectionAddButtonDone,
                    ]}
                  >
                    {isAdding ? (
                      <ActivityIndicator size="small" color={COLORS.white} />
                    ) : (
                      <>
                        <Ionicons
                          name={remainingCount === 0 ? 'checkmark-circle' : 'add-circle-outline'}
                          size={17}
                          color={COLORS.white}
                        />
                        <Text style={styles.collectionAddButtonText}>
                          {remainingCount === 0 ? 'ADDED' : `ADD ${remainingCount} WORDS`}
                        </Text>
                      </>
                    )}
                  </Pressable>
                </View>
              );
            })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}
