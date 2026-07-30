import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
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
import {
  WORDWIZ_STARTER_COLLECTIONS,
  type WordWizStarterCollection,
} from '../constants/wordCollections';
import { COLORS } from '../constants/theme';
import type { AnalyticsData, LegalPage, QuizAnswer, QuizProgress, QuizQuestion, ReminderSettings, SortMode, Word } from '../types';
import { styles } from '../styles';
import { getStudySets, isPersonalLibraryWord } from '../utils';
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
  onAddCollectionWordsToMyWords,
  onRemoveCollectionWordsFromMyWords,
  onAddStarterCollection,
  onCreateStudySet,
  onDeleteStudySet,
  openStudySetBuilderOnMount = false,
  onStudySetBuilderOpened,
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
  onAddCollectionWordsToMyWords: (wordIds: string[]) => Promise<number>;
  onRemoveCollectionWordsFromMyWords: (wordIds: string[]) => Promise<number>;
  onAddStarterCollection: (collection: WordWizStarterCollection) => Promise<{
    added: number;
    alreadySaved: number;
    blocked?: boolean;
    enrichmentScheduled?: boolean;
  }>;
  onCreateStudySet: (name: string, wordIds: string[]) => Promise<boolean>;
  onDeleteStudySet: (studySetId: string) => Promise<boolean>;
  openStudySetBuilderOnMount?: boolean;
  onStudySetBuilderOpened?: () => void;
  freeWordUsage: { wordsAdded: number; limit: number } | null;
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [showFlaggedOnly, setShowFlaggedOnly] = useState(false);
  const [showCollections, setShowCollections] = useState(false);
  const [selectedStarterCollection, setSelectedStarterCollection] = useState<WordWizStarterCollection | null>(null);
  const [selectedCollectionTerms, setSelectedCollectionTerms] = useState<string[]>([]);
  const [showStudySetBuilder, setShowStudySetBuilder] = useState(false);
  const [showStudySetManager, setShowStudySetManager] = useState(false);
  const [showStudySetReady, setShowStudySetReady] = useState(false);
  const [createdStudySet, setCreatedStudySet] = useState<{
    name: string;
    wordCount: number;
  } | null>(null);
  const [studySetName, setStudySetName] = useState('');
  const [selectedStudySetId, setSelectedStudySetId] = useState<string | null>(null);
  const [managedCollectionStudySetId, setManagedCollectionStudySetId] = useState<string | null>(null);
  const [selectedManagedCollectionWordIds, setSelectedManagedCollectionWordIds] = useState<string[]>([]);
  const [managedCollectionSelectionMode, setManagedCollectionSelectionMode] = useState<'add' | 'remove' | null>(null);
  const [isAddingCollectionWordsToMyWords, setIsAddingCollectionWordsToMyWords] = useState(false);
  const [selectedStudyWordIds, setSelectedStudyWordIds] = useState<string[]>([]);
  const [isSavingStudySet, setIsSavingStudySet] = useState(false);
  const [addingCollectionId, setAddingCollectionId] = useState<string | null>(null);
  const listRef = useRef<FlatList<Word>>(null);
  const addingCollectionRef = useRef(false);
  const collectionSetPressRef = useRef<{ id: string; at: number; timer: ReturnType<typeof setTimeout> | null } | null>(null);
  const searchBoxY = useRef(0);
  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const personalWords = useMemo(
    () => words.filter(isPersonalLibraryWord),
    [words],
  );
  const studySets = useMemo(() => getStudySets(words), [words]);
  const activeStudySet = studySets.find((set) => set.id === selectedStudySetId);
  const managedCollectionStudySet = studySets.find(
    (set) => set.id === managedCollectionStudySetId,
  );
  const managedCollectionWords = useMemo(
    () =>
      managedCollectionStudySet
        ? words.filter((word) => managedCollectionStudySet.wordIds.includes(word.id))
        : [],
    [managedCollectionStudySet, words],
  );
  const managedCollectionWordsToAdd = useMemo(
    () => managedCollectionWords.filter((word) => !isPersonalLibraryWord(word)),
    [managedCollectionWords],
  );
  const selectedManagedCollectionWords = useMemo(() => {
    const selectedIds = new Set(selectedManagedCollectionWordIds);
    return managedCollectionWords.filter((word) => selectedIds.has(word.id));
  }, [managedCollectionWords, selectedManagedCollectionWordIds]);
  const managedCollectionWordsInMyWords = useMemo(
    () => managedCollectionWords.filter(isPersonalLibraryWord),
    [managedCollectionWords],
  );
  const managedSelectionMode = managedCollectionSelectionMode ??
    (managedCollectionWordsToAdd.length > 0 ? 'add' : 'remove');
  const managedSelectableWords = managedSelectionMode === 'add'
    ? managedCollectionWordsToAdd
    : managedCollectionWordsInMyWords;
  const areAllManagedCollectionWordsSelected =
    managedSelectableWords.length > 0 &&
    selectedManagedCollectionWords.length === managedSelectableWords.length;
  const filteredWords = useMemo(() => {
    const setWords = activeStudySet
      ? words.filter((word) => activeStudySet.wordIds.includes(word.id))
      : personalWords;
    const searchableWords = showFlaggedOnly
      ? setWords.filter((word) => word.isFlagged)
      : setWords;
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
  }, [activeStudySet, normalizedSearchQuery, personalWords, showFlaggedOnly, words]);

  useEffect(() => () => {
    if (collectionSetPressRef.current?.timer) {
      clearTimeout(collectionSetPressRef.current.timer);
    }
  }, []);
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
    if (addingCollectionRef.current) return;

    const selectedTerms = new Set(selectedCollectionTerms);
    const selectedCollection = {
      ...collection,
      words: collection.words.filter((word) => selectedTerms.has(word.term.toLowerCase())),
    };
    if (selectedCollection.words.length === 0) return;

    addingCollectionRef.current = true;
    setAddingCollectionId(collection.id);
    // Close first so the sheet animation stays responsive while Supabase saves
    // the collection in the background. Completion still updates the deck list.
    closeCollections();
    try {
      // Yield one frame so the closing sheet and immediate deck update paint
      // before preparing or sending the collection batch.
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const result = await onAddStarterCollection(selectedCollection);
      if (!result.blocked) {
        const added = result.added
          ? `${result.added} ${result.added === 1 ? 'word is' : 'words are'} ready in this collection.`
          : 'This collection is ready to study.';
        const kept = result.alreadySaved
          ? ` ${result.alreadySaved} existing ${result.alreadySaved === 1 ? 'word was' : 'words were'} kept in the collection.`
          : '';
        const enrichment = result.enrichmentScheduled
          ? ' Pronunciations, word history, related words, and extra examples will fill in quietly in the background.'
          : '';
        Alert.alert('Collection ready', `${added}${kept} Add any word to My Words from inside the deck.${enrichment}`);
        setSelectedStudySetId(`wordwiz-collection:${collection.id}`);
      }
    } finally {
      addingCollectionRef.current = false;
      setAddingCollectionId(null);
    }
  }

  function openCollections() {
    setSelectedStarterCollection(null);
    setSelectedCollectionTerms([]);
    setShowCollections(true);
  }

  function closeCollections() {
    setSelectedStarterCollection(null);
    setSelectedCollectionTerms([]);
    setShowCollections(false);
  }

  function openCollectionDetails(collection: WordWizStarterCollection) {
    setSelectedStarterCollection(collection);
    setSelectedCollectionTerms(collection.words.map((word) => word.term.toLowerCase()));
  }

  function toggleCollectionWord(term: string) {
    const normalizedTerm = term.toLowerCase();
    setSelectedCollectionTerms((current) =>
      current.includes(normalizedTerm)
        ? current.filter((selectedTerm) => selectedTerm !== normalizedTerm)
        : [...current, normalizedTerm],
    );
  }

  function openStudySetBuilder() {
    setStudySetName('');
    setSelectedStudyWordIds([]);
    setShowStudySetBuilder(true);
  }

  function openStudySetManager() {
    setShowStudySetManager(true);
  }

  function confirmDeleteStudySet(studySetId: string, studySetName: string) {
    Alert.alert(
      `Remove “${studySetName}”?`,
      studySetId.startsWith('wordwiz-collection:')
        ? 'This removes the curated deck. Words you added to My Words stay saved; collection-only words are removed with the deck.'
        : 'This removes the deck from Flashcards and Quiz. Every word stays saved in your WordWiz library.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove deck',
          style: 'destructive',
          onPress: () => {
            void onDeleteStudySet(studySetId).then((didDelete) => {
              if (!didDelete) {
                Alert.alert('Could not delete set', 'Please try again in a moment.');
                return;
              }
              if (selectedStudySetId === studySetId) {
                setSelectedStudySetId(null);
              }
            });
          },
        },
      ],
    );
  }

  useEffect(() => {
    if (!openStudySetBuilderOnMount) return;

    openStudySetBuilder();
    onStudySetBuilderOpened?.();
  }, [onStudySetBuilderOpened, openStudySetBuilderOnMount]);

  function toggleStudySetWord(wordId: string) {
    setSelectedStudyWordIds((current) =>
      current.includes(wordId)
        ? current.filter((id) => id !== wordId)
        : [...current, wordId],
    );
  }

  async function saveStudySet() {
    const normalizedSetName = studySetName.trim().replace(/\s+/g, ' ');
    if (!normalizedSetName) {
      Alert.alert('Name your set', 'Give this study set a short, recognizable name.');
      return;
    }
    if (
      studySets.some(
        (set) => set.name.toLocaleLowerCase() === normalizedSetName.toLocaleLowerCase(),
      )
    ) {
      Alert.alert('That set already exists', 'Choose a different name so it stays easy to find in Quiz.');
      return;
    }
    if (selectedStudyWordIds.length === 0) {
      Alert.alert('Choose a word', 'Select at least one word to add to this set.');
      return;
    }

    setIsSavingStudySet(true);
    try {
      const didSave = await onCreateStudySet(normalizedSetName, selectedStudyWordIds);
      if (didSave) {
        setShowStudySetBuilder(false);
        setCreatedStudySet({
          name: normalizedSetName,
          wordCount: selectedStudyWordIds.length,
        });
        setShowStudySetReady(true);
      }
    } finally {
      setIsSavingStudySet(false);
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

  function selectStudySet(studySetId: string) {
    setSelectedStudySetId((current) => current === studySetId ? null : studySetId);
  }

  function openCollectionWordManager(studySetId: string) {
    setSelectedStudySetId(studySetId);
    setSelectedManagedCollectionWordIds([]);
    setManagedCollectionSelectionMode(null);
    setManagedCollectionStudySetId(studySetId);
  }

  function handleStudySetPress(studySetId: string, isCollection: boolean) {
    if (!isCollection) {
      selectStudySet(studySetId);
      return;
    }

    const now = Date.now();
    const previousPress = collectionSetPressRef.current;
    if (previousPress?.id === studySetId && now - previousPress.at < 280) {
      if (previousPress.timer) clearTimeout(previousPress.timer);
      collectionSetPressRef.current = null;
      openCollectionWordManager(studySetId);
      return;
    }

    if (previousPress?.timer) clearTimeout(previousPress.timer);
    const timer = setTimeout(() => {
      selectStudySet(studySetId);
      collectionSetPressRef.current = null;
    }, 280);
    collectionSetPressRef.current = { id: studySetId, at: now, timer };
  }

  async function addSelectedCollectionWordsToMyWords() {
    if (selectedManagedCollectionWords.length === 0 || isAddingCollectionWordsToMyWords) {
      return;
    }

    setIsAddingCollectionWordsToMyWords(true);
    try {
      const savedCount = await onAddCollectionWordsToMyWords(
        selectedManagedCollectionWords.map((word) => word.id),
      );
      const requestedCount = selectedManagedCollectionWords.length;
      setSelectedManagedCollectionWordIds([]);
      if (savedCount !== requestedCount) {
        Alert.alert(
          'Some words were not added',
          `${savedCount} of ${requestedCount} words were added to My Words. Please try the rest again.`,
        );
      }
    } finally {
      setIsAddingCollectionWordsToMyWords(false);
    }
  }

  function confirmRemoveSelectedCollectionWordsFromMyWords() {
    if (selectedManagedCollectionWords.length === 0 || isAddingCollectionWordsToMyWords) {
      return;
    }
    const requestedCount = selectedManagedCollectionWords.length;
    Alert.alert(
      `Remove ${requestedCount} ${requestedCount === 1 ? 'word' : 'words'} from My Words?`,
      'They will remain safely available in this WordWiz collection.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove from My Words',
          style: 'destructive',
          onPress: () => void removeSelectedCollectionWordsFromMyWords(),
        },
      ],
    );
  }

  async function removeSelectedCollectionWordsFromMyWords() {
    if (selectedManagedCollectionWords.length === 0 || isAddingCollectionWordsToMyWords) {
      return;
    }

    setIsAddingCollectionWordsToMyWords(true);
    try {
      const requestedCount = selectedManagedCollectionWords.length;
      const savedCount = await onRemoveCollectionWordsFromMyWords(
        selectedManagedCollectionWords.map((word) => word.id),
      );
      setSelectedManagedCollectionWordIds([]);
      setManagedCollectionSelectionMode(null);
      if (savedCount !== requestedCount) {
        Alert.alert(
          'Some words were not removed',
          `${savedCount} of ${requestedCount} words were removed from My Words. Please try the rest again.`,
        );
      }
    } finally {
      setIsAddingCollectionWordsToMyWords(false);
    }
  }

  function toggleManagedCollectionWord(wordId: string) {
    const word = managedCollectionWords.find((item) => item.id === wordId);
    if (!word) return;
    const nextMode = isPersonalLibraryWord(word) ? 'remove' : 'add';
    setSelectedManagedCollectionWordIds((current) =>
      managedCollectionSelectionMode && managedCollectionSelectionMode !== nextMode
        ? [wordId]
        : current.includes(wordId)
        ? current.filter((id) => id !== wordId)
        : [...current, wordId],
    );
    setManagedCollectionSelectionMode(nextMode);
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
                <Text style={styles.progressNumber}>{personalWords.length} words</Text>
                <Text style={styles.progressLabel}>
                  {personalWords.length === 0
                    ? 'Your collection is ready to grow'
                    : 'Your vocabulary is growing!'}
                </Text>
              </View>
              {personalWords.length > 0 && (
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
                  You can add {Math.max(0, freeWordUsage.limit - freeWordUsage.wordsAdded)} more {Math.max(0, freeWordUsage.limit - freeWordUsage.wordsAdded) === 1 ? 'word' : 'words'} this month
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

            <View style={styles.wordResourcesRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Browse WordWiz collections"
                accessibilityHint="Preview a ready-made word collection before adding it to your decks."
                onPress={openCollections}
                style={({ pressed }) => [styles.wordResourceButton, pressed && styles.pressed]}
              >
                <View style={styles.wordResourceTopRow}>
                  <View style={styles.wordResourceIcon}>
                    <Ionicons name="library" size={20} color={COLORS.purpleDark} />
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={COLORS.purpleDark} />
                </View>
                <View style={styles.wordResourceCopy}>
                  <Text style={styles.wordResourceLabel}>CURATED</Text>
                  <Text numberOfLines={2} style={styles.wordResourceTitle}>WordWiz collections</Text>
                  <Text numberOfLines={2} style={styles.wordResourceSubtitle}>
                    Ready-made themed decks
                  </Text>
                </View>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Manage personal study sets"
                accessibilityHint="Create, organize, or remove a personal study set."
                onPress={openStudySetManager}
                style={({ pressed }) => [styles.wordResourceButton, styles.wordStudySetsResourceButton, pressed && styles.pressed]}
              >
                <View style={styles.wordResourceTopRow}>
                  <View style={[styles.wordResourceIcon, styles.wordStudySetsResourceIcon]}>
                    <Ionicons name="layers" size={20} color={COLORS.blue} />
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={COLORS.blue} />
                </View>
                <View style={styles.wordResourceCopy}>
                  <Text style={[styles.wordResourceLabel, styles.wordStudySetsResourceLabel]}>PERSONAL</Text>
                  <Text numberOfLines={2} style={styles.wordResourceTitle}>My study sets</Text>
                  <Text numberOfLines={2} style={styles.wordResourceSubtitle}>
                    {addingCollectionId
                      ? 'Adding collection…'
                      : studySets.length
                        ? 'Personally created study sets'
                        : 'Create a set from your words'}
                  </Text>
                </View>
              </Pressable>
            </View>

            {studySets.length > 0 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.studySetFilterList}
              >
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: selectedStudySetId === null }}
                  onPress={() => setSelectedStudySetId(null)}
                  style={[
                    styles.studySetFilterChip,
                    selectedStudySetId === null && styles.studySetFilterChipActive,
                  ]}
                >
                  <Text style={[
                    styles.studySetFilterText,
                    selectedStudySetId === null && styles.studySetFilterTextActive,
                  ]}>My words</Text>
                </Pressable>
                {studySets.map((set) => {
                  const isActive = set.id === selectedStudySetId;
                  const isCollection =
                    set.kind === 'collection' ||
                    set.id.startsWith('wordwiz-collection:');
                  const isAdding = set.id === `wordwiz-collection:${addingCollectionId}`;
                  return (
                    <Pressable
                      key={set.id}
                      accessibilityRole="button"
                      accessibilityLabel={`${isAdding ? 'Adding' : 'Show'} ${set.name} study set`}
                      accessibilityHint={isCollection
                        ? 'Tap once to view this collection. Double tap to choose words to add to My Words.'
                        : undefined}
                      accessibilityState={{ selected: isActive, busy: isAdding }}
                      onPress={() => handleStudySetPress(set.id, isCollection)}
                      style={[styles.studySetFilterChip, isActive && styles.studySetFilterChipActive]}
                    >
                      <Ionicons name="layers-outline" size={14} color={isActive ? COLORS.white : COLORS.blue} />
                      <Text numberOfLines={1} style={[styles.studySetFilterText, isActive && styles.studySetFilterTextActive]}>
                        {set.name}
                      </Text>
                      {isAdding ? (
                        <ActivityIndicator size="small" color={isActive ? COLORS.white : COLORS.purpleDark} />
                      ) : (
                        <Text style={[styles.studySetFilterCount, isActive && styles.studySetFilterTextActive]}>{set.wordIds.length}</Text>
                      )}
                    </Pressable>
                  );
                })}
              </ScrollView>
            ) : null}

            <View style={styles.listToolbar}>
              <Text numberOfLines={1} ellipsizeMode="tail" style={styles.sectionTitle}>
                {showFlaggedOnly
                  ? 'FLAGGED WORDS'
                  : activeStudySet
                    ? activeStudySet.name.toUpperCase()
                    : 'YOUR WORDS'}
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

            {filteredWords.length > 0 ? (
              <Text style={styles.wordListGestureHint}>
                Need to remove a word? Press and hold it · Double-tap to pause practice
              </Text>
            ) : null}

            {filteredWords.length > 0 && (
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
                  : activeStudySet
                    ? 'No words in this set'
                  : 'Start your collection'}
            </Text>
            <Text style={styles.emptyText}>
              {normalizedSearchQuery
                ? 'Try a different word, meaning, or synonym.'
                : showFlaggedOnly
                  ? 'Flag words while studying to review them here.'
                  : activeStudySet
                    ? 'Choose another study set or add more words to this one.'
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
        onRequestClose={closeCollections}
      >
        <View style={styles.collectionModalBackdrop}>
          <Pressable
            accessibilityLabel="Close WordWiz collections"
            onPress={closeCollections}
            style={styles.collectionModalDismiss}
          />
          <View style={[
            styles.collectionModalSheet,
            selectedStarterCollection && styles.collectionDetailSheet,
          ]}>
            <View style={styles.collectionModalHandle} />
            <View style={styles.collectionModalHeader}>
              <View style={styles.collectionModalHeaderCopy}>
                <Text style={styles.collectionModalEyebrow}>
                  {selectedStarterCollection ? 'WORDWIZ COLLECTION' : 'WORDWIZ COLLECTIONS'}
                </Text>
                <Text style={styles.collectionModalTitle}>
                  {selectedStarterCollection?.title ?? 'Choose your next set'}
                </Text>
                <Text style={styles.collectionModalSubtitle}>
                  {selectedStarterCollection
                    ? 'Choose which words to include in this collection. You can add collection words to My Words later.'
                    : 'Open a collection to preview every word and choose what to include.'}
                </Text>
              </View>
              <Pressable
                accessibilityLabel={selectedStarterCollection ? 'Back to WordWiz collections' : 'Close WordWiz collections'}
                onPress={() => {
                  if (selectedStarterCollection) {
                    setSelectedStarterCollection(null);
                    setSelectedCollectionTerms([]);
                    return;
                  }
                  closeCollections();
                }}
                style={styles.collectionModalClose}
              >
                <Ionicons name={selectedStarterCollection ? 'arrow-back' : 'close'} size={21} color={COLORS.ink} />
              </Pressable>
            </View>

            {selectedStarterCollection ? (() => {
              const collection = selectedStarterCollection;
              const selectedTerms = new Set(selectedCollectionTerms);
              const selectedWords = collection.words.filter((collectionWord) =>
                selectedTerms.has(collectionWord.term.toLowerCase()),
              );
              const isAdding = addingCollectionId === collection.id;
              const collectionSetId = `wordwiz-collection:${collection.id}`;
              const alreadyIncluded = selectedWords.filter((collectionWord) =>
                words.some(
                  (word) =>
                    word.term.toLowerCase() === collectionWord.term.toLowerCase() &&
                    word.mastery?.studySets?.some((set) => set.id === collectionSetId),
                ),
              ).length;
              const remainingCount = selectedWords.length - alreadyIncluded;
              const isInMyDecks = studySets.some((set) => set.id === collectionSetId);
              const hasSelectedWords = selectedWords.length > 0;
              const isComplete = hasSelectedWords && remainingCount === 0 && isInMyDecks;
              const allWordsSelected = selectedWords.length === collection.words.length;
              const actionLabel = !hasSelectedWords
                ? 'SELECT WORDS TO INCLUDE'
                : isComplete
                ? 'COLLECTION READY'
                : remainingCount === 0
                  ? 'UPDATE COLLECTION'
                  : `START ${remainingCount} WORDS`;
              return (
                <>
                  <View style={styles.collectionDetailSummary}>
                    <Ionicons name={collection.icon} size={18} color={collection.color === 'purple' ? COLORS.purpleDark : COLORS.orange} />
                    <Text style={styles.collectionDetailSummaryText}>{collection.subtitle}</Text>
                  </View>
                  <View style={styles.collectionDetailSelectionRow}>
                    <Text style={styles.collectionDetailSelectionText}>
                      {selectedWords.length} of {collection.words.length} selected
                    </Text>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={allWordsSelected ? 'Deselect every word from this collection' : 'Select every word in this collection'}
                      onPress={() => setSelectedCollectionTerms(
                        allWordsSelected ? [] : collection.words.map((word) => word.term.toLowerCase()),
                      )}
                      style={({ pressed }) => [styles.collectionDetailSelectionAction, pressed && styles.pressed]}
                    >
                      <Text style={styles.collectionDetailSelectionActionText}>
                        {allWordsSelected ? 'DESELECT ALL' : 'SELECT ALL'}
                      </Text>
                    </Pressable>
                  </View>
                  <ScrollView
                    bounces={false}
                    showsVerticalScrollIndicator={false}
                    style={styles.collectionDetailList}
                    contentContainerStyle={styles.collectionDetailListContent}
                  >
                    {collection.words.map((collectionWord) => {
                      const isSelected = selectedTerms.has(collectionWord.term.toLowerCase());
                      return (
                        <Pressable
                          key={collectionWord.term}
                          accessibilityRole="checkbox"
                          accessibilityState={{ checked: isSelected }}
                          accessibilityLabel={`${isSelected ? 'Remove' : 'Include'} ${collectionWord.term} in this collection`}
                          onPress={() => toggleCollectionWord(collectionWord.term)}
                          style={({ pressed }) => [
                            styles.collectionDetailWord,
                            isSelected && styles.collectionDetailWordSelected,
                            pressed && styles.pressed,
                          ]}
                        >
                          <View style={styles.collectionDetailWordMainRow}>
                            <View style={[
                              styles.collectionDetailCheckbox,
                              !isSelected && styles.collectionDetailCheckboxEmpty,
                            ]}>
                              {isSelected ? <Ionicons name="checkmark" size={14} color={COLORS.white} /> : null}
                            </View>
                            <View style={styles.collectionDetailWordCopy}>
                              <View style={styles.collectionDetailWordTopRow}>
                                <Text style={styles.collectionDetailWordTerm}>{collectionWord.term}</Text>
                              </View>
                              <Text style={styles.collectionDetailWordGroup}>{collectionWord.group}</Text>
                              <Text style={styles.collectionDetailWordDefinition}>{collectionWord.definition}</Text>
                              <Text numberOfLines={1} style={styles.collectionDetailWordExample}>{collectionWord.example}</Text>
                            </View>
                          </View>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${actionLabel.toLowerCase()} for ${collection.title}`}
                    disabled={isAdding || isComplete || !hasSelectedWords}
                    onPress={() => void addCollection(collection)}
                    style={({ pressed }) => [
                      styles.collectionAddButton,
                      collection.color === 'purple' ? styles.collectionAddButtonPurple : styles.collectionAddButtonOrange,
                      (pressed || isAdding) && styles.pressed,
                      (isComplete || !hasSelectedWords) && styles.collectionAddButtonDone,
                    ]}
                  >
                    {isAdding ? <ActivityIndicator size="small" color={COLORS.white} /> : <>
                      <Ionicons name={isComplete ? 'checkmark-circle' : 'add-circle-outline'} size={17} color={COLORS.white} />
                      <Text style={styles.collectionAddButtonText}>{actionLabel}</Text>
                    </>}
                  </Pressable>
                </>
              );
            })() : (
              <ScrollView
                bounces={false}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.collectionModalList}
              >
                {WORDWIZ_STARTER_COLLECTIONS.map((collection) => {
                  const isPurple = collection.color === 'purple';
                  return (
                    <Pressable
                      key={collection.id}
                      accessibilityRole="button"
                      accessibilityLabel={`View ${collection.title} collection`}
                      onPress={() => openCollectionDetails(collection)}
                      style={({ pressed }) => [
                        styles.collectionCard,
                        isPurple ? styles.collectionCardPurple : styles.collectionCardOrange,
                        pressed && styles.pressed,
                      ]}
                    >
                      <View style={styles.collectionCardTopRow}>
                        <View style={[
                          styles.collectionCardIcon,
                          isPurple ? styles.collectionIconPurple : styles.collectionIconOrange,
                        ]}>
                          <Ionicons name={collection.icon} size={22} color={isPurple ? COLORS.purpleDark : COLORS.orange} />
                        </View>
                        <View style={styles.collectionCardCopy}>
                          <Text style={styles.collectionCardTitle}>{collection.title}</Text>
                          <Text style={styles.collectionCardCount}>{collection.subtitle}</Text>
                        </View>
                        <Ionicons name="chevron-forward" size={20} color={isPurple ? COLORS.purpleDark : COLORS.orange} />
                      </View>
                      <Text style={styles.collectionCardDescription}>{collection.description}</Text>
                      <Text numberOfLines={1} style={styles.collectionCardPreview}>
                        Includes {collection.words.slice(0, 4).map((word) => word.term).join(' · ')}
                      </Text>
                      <View style={styles.collectionViewButton}>
                        <Text style={[styles.collectionViewButtonText, { color: isPurple ? COLORS.purpleDark : COLORS.orange }]}>VIEW FULL COLLECTION</Text>
                        <Ionicons name="arrow-forward" size={15} color={isPurple ? COLORS.purpleDark : COLORS.orange} />
                      </View>
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      <Modal
        animationType="slide"
        transparent
        visible={Boolean(managedCollectionStudySet)}
        onRequestClose={() => setManagedCollectionStudySetId(null)}
      >
        <View style={styles.collectionModalBackdrop}>
          <Pressable
            accessibilityLabel="Close collection word picker"
            onPress={() => setManagedCollectionStudySetId(null)}
            style={styles.collectionModalDismiss}
          />
          <View style={[styles.collectionModalSheet, styles.collectionDetailSheet]}>
            <View style={styles.collectionModalHandle} />
            <View style={styles.collectionModalHeader}>
              <View style={styles.collectionModalHeaderCopy}>
                <Text style={styles.collectionModalEyebrow}>WORDWIZ COLLECTION</Text>
                <Text style={styles.collectionModalTitle}>
                  {managedCollectionStudySet?.name ?? 'Collection'}
                </Text>
                <Text style={styles.collectionModalSubtitle}>
                  Choose the words you want to add to My Words. They will stay available in this collection too.
                </Text>
              </View>
              <Pressable
                accessibilityLabel="Close collection word picker"
                onPress={() => setManagedCollectionStudySetId(null)}
                style={styles.collectionModalClose}
              >
                <Ionicons name="arrow-back" size={21} color={COLORS.ink} />
              </Pressable>
            </View>

            <View style={styles.collectionDetailSummary}>
              <Ionicons name="layers-outline" size={18} color={COLORS.purpleDark} />
              <Text style={styles.collectionDetailSummaryText}>
                {managedCollectionWordsToAdd.length > 0
                  ? `${managedCollectionWordsToAdd.length} words are ready to add to My Words`
                  : 'Every word from this collection is already in My Words'}
              </Text>
            </View>
            <View style={styles.collectionDetailSelectionRow}>
              <Text style={styles.collectionDetailSelectionText}>
                {selectedManagedCollectionWords.length} of {managedSelectableWords.length} selected
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={managedSelectableWords.length === 0
                  ? 'No collection words are available for this action'
                  : areAllManagedCollectionWordsSelected
                    ? `Deselect every ${managedSelectionMode === 'add' ? 'collection word ready to add' : 'word in My Words'}`
                    : `Select every ${managedSelectionMode === 'add' ? 'collection word ready to add' : 'word in My Words'}`}
                disabled={managedSelectableWords.length === 0}
                onPress={() => setSelectedManagedCollectionWordIds(
                  areAllManagedCollectionWordsSelected
                    ? []
                    : managedSelectableWords.map((word) => word.id),
                )}
                style={({ pressed }) => [
                  styles.collectionDetailSelectionAction,
                  managedSelectableWords.length === 0 && styles.collectionDetailSelectionActionDisabled,
                  pressed && managedSelectableWords.length > 0 && styles.pressed,
                ]}
              >
                <Text style={styles.collectionDetailSelectionActionText}>
                  {managedSelectableWords.length === 0
                    ? 'NOTHING TO SELECT'
                    : areAllManagedCollectionWordsSelected
                      ? 'DESELECT ALL'
                      : managedSelectionMode === 'remove'
                        ? 'SELECT ALL MY WORDS'
                        : 'SELECT ALL'}
                </Text>
              </Pressable>
            </View>
            <ScrollView
              bounces={false}
              showsVerticalScrollIndicator={false}
              style={styles.collectionDetailList}
              contentContainerStyle={styles.collectionDetailListContent}
            >
              {managedCollectionWords.map((word) => {
                const isInMyWords = isPersonalLibraryWord(word);
                const isSelected = selectedManagedCollectionWordIds.includes(word.id);
                return (
                  <Pressable
                    key={word.id}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: isSelected }}
                    accessibilityLabel={isInMyWords
                      ? `${isSelected ? 'Deselect' : 'Select'} ${word.term} to remove from My Words`
                      : `${isSelected ? 'Deselect' : 'Select'} ${word.term} to add to My Words`}
                    onPress={() => toggleManagedCollectionWord(word.id)}
                    style={({ pressed }) => [
                      styles.collectionDetailWord,
                      isSelected && styles.collectionDetailWordSelected,
                      pressed && styles.pressed,
                    ]}
                  >
                    <View style={styles.collectionDetailWordMainRow}>
                      <View style={[
                        styles.collectionDetailCheckbox,
                        !isSelected && styles.collectionDetailCheckboxEmpty,
                      ]}>
                        {isSelected ? (
                          <Ionicons name="checkmark" size={14} color={COLORS.white} />
                        ) : null}
                      </View>
                      <View style={styles.collectionDetailWordCopy}>
                        <View style={styles.collectionDetailWordTopRow}>
                          <Text style={styles.collectionDetailWordTerm}>{word.term}</Text>
                          {isInMyWords ? (
                            <View style={styles.collectionDetailWordSaved}>
                              <Ionicons name="checkmark" size={11} color={COLORS.teal} />
                              <Text style={styles.collectionDetailWordSavedText}>MY WORDS</Text>
                            </View>
                          ) : null}
                        </View>
                        {word.commonWords?.[0] ? (
                          <Text style={styles.collectionDetailWordGroup}>{word.commonWords[0]}</Text>
                        ) : null}
                        <Text style={styles.collectionDetailWordDefinition}>{word.simpleDefinition || word.definition}</Text>
                        <Text numberOfLines={1} style={styles.collectionDetailWordExample}>{word.example}</Text>
                      </View>
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={managedSelectionMode === 'remove'
                ? `Remove ${selectedManagedCollectionWords.length} selected words from My Words`
                : `Add ${selectedManagedCollectionWords.length} selected words to My Words`}
              disabled={isAddingCollectionWordsToMyWords || selectedManagedCollectionWords.length === 0}
              onPress={() => {
                if (managedSelectionMode === 'remove') {
                  confirmRemoveSelectedCollectionWordsFromMyWords();
                  return;
                }
                void addSelectedCollectionWordsToMyWords();
              }}
              style={({ pressed }) => [
                styles.collectionAddButton,
                managedSelectionMode === 'remove'
                  ? styles.collectionRemoveFromMyWordsButton
                  : styles.collectionAddButtonPurple,
                (pressed || isAddingCollectionWordsToMyWords) && styles.pressed,
                selectedManagedCollectionWords.length === 0 && styles.collectionAddButtonDone,
              ]}
            >
              {isAddingCollectionWordsToMyWords ? (
                <ActivityIndicator size="small" color={COLORS.white} />
              ) : (
                <Ionicons
                  name={managedSelectionMode === 'remove' ? 'remove-circle-outline' : 'add-circle-outline'}
                  size={17}
                  color={COLORS.white}
                />
              )}
              <Text style={styles.collectionAddButtonText}>
                {managedSelectionMode === 'remove' ? 'REMOVE' : 'ADD'} {selectedManagedCollectionWords.length} {selectedManagedCollectionWords.length === 1 ? 'WORD' : 'WORDS'} {managedSelectionMode === 'remove' ? 'FROM' : 'TO'} MY WORDS
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal
        animationType="slide"
        transparent
        visible={showStudySetBuilder}
        onRequestClose={() => setShowStudySetBuilder(false)}
      >
        <View style={styles.collectionModalBackdrop}>
          <Pressable
            accessibilityLabel="Close study set builder"
            onPress={() => setShowStudySetBuilder(false)}
            style={styles.collectionModalDismiss}
          />
          <View style={[styles.collectionModalSheet, styles.studySetModalSheet]}>
            <View style={styles.collectionModalHandle} />
            <View style={styles.collectionModalHeader}>
              <View style={styles.collectionModalHeaderCopy}>
                <Text style={styles.collectionModalEyebrow}>MY STUDY SET</Text>
                <Text style={styles.collectionModalTitle}>Build a focused set</Text>
                <Text style={styles.collectionModalSubtitle}>
                  Pick from your personal words. Your new set will appear in Quiz.
                </Text>
              </View>
              <Pressable
                accessibilityLabel="Close study set builder"
                onPress={() => setShowStudySetBuilder(false)}
                style={styles.collectionModalClose}
              >
                <Ionicons name="close" size={21} color={COLORS.ink} />
              </Pressable>
            </View>

            <TextInput
              autoCapitalize="words"
              maxLength={36}
              placeholder="Set name, e.g. Interview words"
              placeholderTextColor={COLORS.muted}
              value={studySetName}
              onChangeText={setStudySetName}
              style={styles.studySetNameInput}
            />
            <View style={styles.studySetSelectHeader}>
              <Text style={styles.studySetSelectLabel}>CHOOSE WORDS</Text>
              <Pressable
                onPress={() => setSelectedStudyWordIds(
                  selectedStudyWordIds.length === personalWords.length ? [] : personalWords.map((word) => word.id),
                )}
              >
                <Text style={styles.studySetSelectAllText}>
                  {selectedStudyWordIds.length === personalWords.length ? 'CLEAR ALL' : 'SELECT ALL'}
                </Text>
              </Pressable>
            </View>
            <ScrollView
              bounces={false}
              showsVerticalScrollIndicator={false}
              style={styles.studySetBuilderList}
              contentContainerStyle={styles.studySetWordList}
            >
              {personalWords.map((word) => {
                const selected = selectedStudyWordIds.includes(word.id);
                return (
                  <Pressable
                    key={word.id}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: selected }}
                    onPress={() => toggleStudySetWord(word.id)}
                    style={[styles.studySetWordOption, selected && styles.studySetWordOptionSelected]}
                  >
                    <View style={[
                      styles.studySetWordCheckbox,
                      !selected && styles.studySetWordCheckboxEmpty,
                    ]}>
                      {selected ? <Ionicons name="checkmark" size={15} color={COLORS.white} /> : null}
                    </View>
                    <View style={styles.studySetWordCopy}>
                      <Text numberOfLines={1} style={styles.studySetWordTerm}>{word.term}</Text>
                      <Text numberOfLines={1} style={styles.studySetWordDefinition}>{word.simpleDefinition || word.definition}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
            <Pressable
              accessibilityRole="button"
              disabled={isSavingStudySet}
              onPress={() => void saveStudySet()}
              style={({ pressed }) => [styles.studySetSaveButton, (pressed || isSavingStudySet) && styles.pressed]}
            >
              {isSavingStudySet ? <ActivityIndicator size="small" color={COLORS.white} /> : <Ionicons name="sparkles" size={18} color={COLORS.white} />}
              <Text style={styles.studySetSaveButtonText}>
                CREATE SET · {selectedStudyWordIds.length} {selectedStudyWordIds.length === 1 ? 'WORD' : 'WORDS'}
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal
        animationType="slide"
        transparent
        visible={showStudySetManager}
        onRequestClose={() => setShowStudySetManager(false)}
      >
        <View style={styles.collectionModalBackdrop}>
          <Pressable
            accessibilityLabel="Close study set manager"
            onPress={() => setShowStudySetManager(false)}
            style={styles.collectionModalDismiss}
          />
          <View style={styles.studySetManagerSheet}>
            <View style={styles.collectionModalHandle} />
            <View style={styles.collectionModalHeader}>
              <View style={styles.collectionModalHeaderCopy}>
                <Text style={styles.collectionModalEyebrow}>MY DECKS</Text>
                <Text style={styles.collectionModalTitle}>Keep practice organized</Text>
                <Text style={styles.collectionModalSubtitle}>
                  Ready-made collections and personal sets appear here, in Flashcards, and in Quiz. Removing a collection keeps only the words you added to My Words.
                </Text>
              </View>
              <Pressable
                accessibilityLabel="Close study set manager"
                onPress={() => setShowStudySetManager(false)}
                style={styles.collectionModalClose}
              >
                <Ionicons name="close" size={21} color={COLORS.ink} />
              </Pressable>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.studySetManagerList}
            >
              {studySets.length === 0 ? (
                <View style={styles.studySetManagerEmpty}>
                  <View style={styles.studySetManagerEmptyIcon}>
                    <Ionicons name="library-outline" size={23} color={COLORS.purpleDark} />
                  </View>
                  <Text style={styles.studySetManagerEmptyTitle}>Your first deck starts here</Text>
                  <Text style={styles.studySetManagerEmptyText}>
                    Add a WordWiz collection or group your own saved words for focused practice.
                  </Text>
                </View>
              ) : studySets.map((set) => {
                const isCollection = set.kind === 'collection' || set.id.startsWith('wordwiz-collection:');
                return (
                <View key={set.id} style={[styles.studySetManagerItem, isCollection && styles.studySetManagerCollectionItem]}>
                  <View style={[styles.studySetManagerIcon, isCollection && styles.studySetManagerCollectionIcon]}>
                    <Ionicons name={isCollection ? 'library' : 'layers'} size={19} color={isCollection ? COLORS.purpleDark : COLORS.blue} />
                  </View>
                  <View style={styles.studySetManagerCopy}>
                    <Text numberOfLines={1} style={styles.studySetManagerName}>{set.name}</Text>
                    <Text style={styles.studySetManagerMeta}>
                      {set.wordIds.length} {set.wordIds.length === 1 ? 'word' : 'words'} · {isCollection ? 'WordWiz collection' : 'personal deck'}
                    </Text>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${set.name} deck`}
                    accessibilityHint={isCollection
                      ? 'Removes this collection. Words in My Words stay saved.'
                      : 'Removes this deck but keeps every word saved.'}
                    onPress={() => confirmDeleteStudySet(set.id, set.name)}
                    style={({ pressed }) => [styles.studySetDeleteButton, pressed && styles.pressed]}
                  >
                    <Ionicons name="trash-outline" size={18} color={COLORS.red} />
                  </Pressable>
                </View>
              );
              })}
            </ScrollView>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Add a WordWiz collection"
              onPress={() => {
                setShowStudySetManager(false);
                openCollections();
              }}
              style={({ pressed }) => [styles.studySetManagerCollectionButton, pressed && styles.pressed]}
            >
              <Ionicons name="library" size={19} color={COLORS.white} />
              <Text style={styles.studySetManagerCreateText}>ADD WORDWIZ COLLECTION</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Create a new personal deck"
              onPress={() => {
                setShowStudySetManager(false);
                openStudySetBuilder();
              }}
              style={({ pressed }) => [styles.studySetManagerCreateButton, pressed && styles.pressed]}
            >
              <Ionicons name="add" size={20} color={COLORS.white} />
              <Text style={styles.studySetManagerCreateText}>CREATE A PERSONAL DECK</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
      <StudySetReadyModal
        visible={showStudySetReady}
        studySet={createdStudySet}
        onClose={() => setShowStudySetReady(false)}
      />
    </>
  );
}

function StudySetReadyModal({
  visible,
  studySet,
  onClose,
}: {
  visible: boolean;
  studySet: { name: string; wordCount: number } | null;
  onClose: () => void;
}) {
  const cardProgress = useRef(new Animated.Value(0)).current;
  const magicScale = useRef(new Animated.Value(0.55)).current;
  const sparkleProgress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) return;

    cardProgress.setValue(0);
    magicScale.setValue(0.55);
    sparkleProgress.setValue(0);
    const animation = Animated.sequence([
      Animated.delay(80),
      Animated.parallel([
        Animated.timing(cardProgress, {
          toValue: 1,
          duration: 260,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.spring(magicScale, {
          toValue: 1,
          friction: 5,
          tension: 90,
          useNativeDriver: true,
        }),
      ]),
      Animated.timing(sparkleProgress, {
        toValue: 1,
        duration: 340,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]);
    animation.start();
    return () => animation.stop();
  }, [cardProgress, magicScale, sparkleProgress, visible]);

  const translateY = cardProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [25, 0],
  });
  const sparkleTranslateY = sparkleProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [8, 0],
  });
  const wordCount = studySet?.wordCount ?? 0;

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <View style={styles.studySetReadyBackdrop}>
        <Animated.View
          style={[
            styles.studySetReadyCard,
            { opacity: cardProgress, transform: [{ translateY }] },
          ]}
        >
          <Animated.View
            pointerEvents="none"
            style={[
              styles.studySetReadySparkleTop,
              { opacity: sparkleProgress, transform: [{ translateY: sparkleTranslateY }] },
            ]}
          >
            <Ionicons name="sparkles" size={24} color={COLORS.purple} />
          </Animated.View>
          <Animated.View
            pointerEvents="none"
            style={[
              styles.studySetReadySparkleSide,
              { opacity: sparkleProgress, transform: [{ translateY: sparkleTranslateY }] },
            ]}
          >
            <Ionicons name="star" size={13} color={COLORS.teal} />
          </Animated.View>
          <Animated.View style={[styles.studySetReadyIcon, { transform: [{ scale: magicScale }] }]}>
            <Ionicons name="layers" size={36} color={COLORS.purpleDark} />
          </Animated.View>
          <Text style={styles.studySetReadyEyebrow}>A FRESH FOCUS DECK</Text>
          <Text style={styles.studySetReadyTitle}>Your study set is ready!</Text>
          <View style={styles.studySetReadyNamePill}>
            <Ionicons name="sparkles" size={14} color={COLORS.purpleDark} />
            <Text numberOfLines={1} style={styles.studySetReadyName}>{studySet?.name ?? 'Your study set'}</Text>
          </View>
          <Text style={styles.studySetReadyBody}>
            {wordCount} {wordCount === 1 ? 'word is' : 'words are'} grouped and ready for a focused practice session in Quiz.
          </Text>
          <View style={styles.studySetReadyHint}>
            <Ionicons name="trophy-outline" size={16} color={COLORS.greenDark} />
            <Text style={styles.studySetReadyHintText}>Look for it under “My study sets” in Quiz.</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={onClose}
            style={({ pressed }) => [styles.studySetReadyButton, pressed && styles.pressed]}
          >
            <Text style={styles.studySetReadyButtonText}>MAGIC, LET’S GO</Text>
            <Ionicons name="arrow-forward" size={19} color={COLORS.white} />
          </Pressable>
        </Animated.View>
      </View>
    </Modal>
  );
}
