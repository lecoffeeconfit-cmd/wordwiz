import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState } from 'react';
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
import { getStudySets } from '../utils';
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
  onAddStarterCollection: (collection: WordWizStarterCollection) => Promise<{
    added: number;
    alreadySaved: number;
    blocked?: boolean;
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
  const [showStudySetBuilder, setShowStudySetBuilder] = useState(false);
  const [showStudySetManager, setShowStudySetManager] = useState(false);
  const [studySetName, setStudySetName] = useState('');
  const [selectedStudySetId, setSelectedStudySetId] = useState<string | null>(null);
  const [selectedStudyWordIds, setSelectedStudyWordIds] = useState<string[]>([]);
  const [isSavingStudySet, setIsSavingStudySet] = useState(false);
  const [addingCollectionId, setAddingCollectionId] = useState<string | null>(null);
  const listRef = useRef<FlatList<Word>>(null);
  const searchBoxY = useRef(0);
  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const studySets = useMemo(() => getStudySets(words), [words]);
  const activeStudySet = studySets.find((set) => set.id === selectedStudySetId);
  const filteredWords = useMemo(() => {
    const setWords = activeStudySet
      ? words.filter((word) => activeStudySet.wordIds.includes(word.id))
      : words;
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
  }, [activeStudySet, normalizedSearchQuery, showFlaggedOnly, words]);
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

  function openStudySetBuilder() {
    setStudySetName('');
    setSelectedStudyWordIds([]);
    setShowStudySetBuilder(true);
  }

  function openStudySetManager() {
    if (studySets.length === 0) {
      openStudySetBuilder();
      return;
    }
    setShowStudySetManager(true);
  }

  function confirmDeleteStudySet(studySetId: string, studySetName: string) {
    Alert.alert(
      `Delete “${studySetName}”?`,
      'This removes the set only. Every word stays saved in your WordWiz library.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete set',
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
        Alert.alert('Study set ready', 'Find it on the Quiz page whenever you want a focused practice session.');
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

            <View style={styles.wordResourcesRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Browse WordWiz starter collections"
                accessibilityHint="Preview optional word lists and add the ones you want."
                onPress={() => setShowCollections(true)}
                style={({ pressed }) => [styles.wordResourceButton, pressed && styles.pressed]}
              >
                <View style={styles.wordResourceIcon}>
                  <Ionicons name="library" size={20} color={COLORS.purpleDark} />
                </View>
                <View style={styles.wordResourceCopy}>
                  <Text numberOfLines={1} style={styles.wordResourceTitle}>Collections</Text>
                  <Text numberOfLines={1} style={styles.wordResourceSubtitle}>Ready-made</Text>
                </View>
                <Ionicons name="chevron-forward" size={17} color={COLORS.purpleDark} />
              </Pressable>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Manage study sets"
                accessibilityHint="Create or delete focused word sets for flashcards and quizzes."
                onPress={openStudySetManager}
                style={({ pressed }) => [styles.wordResourceButton, styles.wordStudySetsResourceButton, pressed && styles.pressed]}
              >
                <View style={[styles.wordResourceIcon, styles.wordStudySetsResourceIcon]}>
                  <Ionicons name="layers" size={20} color={COLORS.blue} />
                </View>
                <View style={styles.wordResourceCopy}>
                  <Text numberOfLines={1} style={styles.wordResourceTitle}>Study sets</Text>
                  <Text numberOfLines={1} style={styles.wordResourceSubtitle}>
                    {studySets.length ? `${studySets.length} saved` : 'Create one'}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={17} color={COLORS.blue} />
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
                  ]}>All words</Text>
                </Pressable>
                {studySets.map((set) => {
                  const isActive = set.id === selectedStudySetId;
                  return (
                    <Pressable
                      key={set.id}
                      accessibilityRole="button"
                      accessibilityLabel={`Show ${set.name} study set`}
                      accessibilityState={{ selected: isActive }}
                      onPress={() => setSelectedStudySetId(isActive ? null : set.id)}
                      style={[styles.studySetFilterChip, isActive && styles.studySetFilterChipActive]}
                    >
                      <Ionicons name="layers-outline" size={14} color={isActive ? COLORS.white : COLORS.blue} />
                      <Text numberOfLines={1} style={[styles.studySetFilterText, isActive && styles.studySetFilterTextActive]}>
                        {set.name}
                      </Text>
                      <Text style={[styles.studySetFilterCount, isActive && styles.studySetFilterTextActive]}>{set.wordIds.length}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            ) : null}

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
                  Pick the words you want together. Your new set will appear in Quiz.
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
                  selectedStudyWordIds.length === words.length ? [] : words.map((word) => word.id),
                )}
              >
                <Text style={styles.studySetSelectAllText}>
                  {selectedStudyWordIds.length === words.length ? 'CLEAR ALL' : 'SELECT ALL'}
                </Text>
              </Pressable>
            </View>
            <ScrollView
              bounces={false}
              showsVerticalScrollIndicator={false}
              style={styles.studySetBuilderList}
              contentContainerStyle={styles.studySetWordList}
            >
              {words.map((word) => {
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
                <Text style={styles.collectionModalEyebrow}>MY STUDY SETS</Text>
                <Text style={styles.collectionModalTitle}>Practice your way</Text>
                <Text style={styles.collectionModalSubtitle}>
                  These focused decks are ready in Flashcards and Quiz. Deleting a set never deletes its words.
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
              {studySets.map((set) => (
                <View key={set.id} style={styles.studySetManagerItem}>
                  <View style={styles.studySetManagerIcon}>
                    <Ionicons name="layers" size={19} color={COLORS.blue} />
                  </View>
                  <View style={styles.studySetManagerCopy}>
                    <Text numberOfLines={1} style={styles.studySetManagerName}>{set.name}</Text>
                    <Text style={styles.studySetManagerMeta}>
                      {set.wordIds.length} {set.wordIds.length === 1 ? 'word' : 'words'} · ready to practice
                    </Text>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Delete ${set.name} study set`}
                    accessibilityHint="Removes this set but keeps every word saved."
                    onPress={() => confirmDeleteStudySet(set.id, set.name)}
                    style={({ pressed }) => [styles.studySetDeleteButton, pressed && styles.pressed]}
                  >
                    <Ionicons name="trash-outline" size={18} color={COLORS.red} />
                  </Pressable>
                </View>
              ))}
            </ScrollView>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Create a new study set"
              onPress={() => {
                setShowStudySetManager(false);
                openStudySetBuilder();
              }}
              style={({ pressed }) => [styles.studySetManagerCreateButton, pressed && styles.pressed]}
            >
              <Ionicons name="add" size={20} color={COLORS.white} />
              <Text style={styles.studySetManagerCreateText}>CREATE A NEW SET</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
}
