import { Ionicons } from '@expo/vector-icons';
import type { ReactNode, RefObject } from 'react';
import { useEffect, useRef, useState } from 'react';
import { Alert, Keyboard, KeyboardAvoidingView, Linking, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS } from '../constants/theme';
import type { DefinitionOption, Word, WordDetails } from '../types';
import { styles } from '../styles';
import { lookupWordDetails, suggestWordSpellings } from '../services';
import { InfoChip } from '../components';
import {
  formatTimePeriodSnapshot,
  formatWordHistoryNarrative,
  inferOriginPeriod,
  makeSimpleDefinition,
} from '../utils';

export function AddWordModal({
  visible,
  onClose,
  onAdd,
  wordToEdit,
  words = [],
  onEditExisting,
}: {
  visible: boolean;
  onClose: () => void;
  onAdd: (
    term: string,
    definition: string,
    example: string,
    details?: Partial<WordDetails>,
    options?: { closeAfterSave?: boolean },
  ) => boolean | Promise<boolean>;
  wordToEdit?: Word | null;
  words?: Word[];
  onEditExisting?: (word: Word) => void;
}) {
  const [term, setTerm] = useState('');
  const [definition, setDefinition] = useState('');
  const [simpleDefinition, setSimpleDefinition] = useState('');
  const [example, setExample] = useState('');
  const [partOfSpeech, setPartOfSpeech] = useState('');
  const [pronunciation, setPronunciation] = useState('');
  const [origin, setOrigin] = useState('');
  const [originPeriod, setOriginPeriod] = useState('');
  const [basicInfo, setBasicInfo] = useState('');
  const [synonyms, setSynonyms] = useState<string[]>([]);
  const [antonyms, setAntonyms] = useState<string[]>([]);
  const [antonymsText, setAntonymsText] = useState('');
  const [commonWordsText, setCommonWordsText] = useState('');
  const [wordnikDetails, setWordnikDetails] = useState<Partial<WordDetails>>({});
  const [definitionOptions, setDefinitionOptions] = useState<DefinitionOption[]>([]);
  const [definitionOptionIndex, setDefinitionOptionIndex] = useState(0);
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [lookupStatus, setLookupStatus] = useState('');
  const [spellingSuggestions, setSpellingSuggestions] = useState<string[]>([]);
  const [isEditingBasicInfo, setIsEditingBasicInfo] = useState(false);
  const [isEditingTimePeriod, setIsEditingTimePeriod] = useState(false);
  const [isEditingHistory, setIsEditingHistory] = useState(false);
  const [basicInfoDraft, setBasicInfoDraft] = useState({
    partOfSpeech: '',
    pronunciation: '',
    basicInfo: '',
    synonymsText: '',
    antonymsText: '',
    commonWordsText: '',
  });
  const [timePeriodDraft, setTimePeriodDraft] = useState('');
  const [historyDraft, setHistoryDraft] = useState('');
  const synonymsInputRef = useRef<TextInput>(null);
  const basicInfoInputRef = useRef<TextInput>(null);
  const timePeriodInputRef = useRef<TextInput>(null);
  const historyInputRef = useRef<TextInput>(null);
  const duplicateWord = words.find(
    (word) =>
      word.id !== wordToEdit?.id &&
      word.term.trim().toLowerCase() === term.trim().toLowerCase(),
  );

  useEffect(() => {
    if (!visible) {
      return;
    }

    if (!wordToEdit) {
      resetForm();
      return;
    }

    setTerm(wordToEdit.term);
    setDefinition(wordToEdit.definition);
    setSimpleDefinition(wordToEdit.simpleDefinition ?? '');
    setExample(wordToEdit.example);
    setPartOfSpeech(wordToEdit.partOfSpeech ?? '');
    setPronunciation(wordToEdit.pronunciation ?? '');
    setOrigin(wordToEdit.origin ?? '');
    setOriginPeriod(wordToEdit.originPeriod ?? '');
    setBasicInfo(wordToEdit.basicInfo ?? '');
    setSynonyms(wordToEdit.synonyms ?? []);
    setAntonyms(wordToEdit.antonyms ?? []);
    setAntonymsText((wordToEdit.antonyms ?? []).join(', '));
    setCommonWordsText((wordToEdit.commonWords ?? []).join(', '));
    setWordnikDetails(pickWordnikDetails(wordToEdit));
    setDefinitionOptions([]);
    setDefinitionOptionIndex(0);
    setLookupStatus('Edit anything, then save your changes.');
    setSpellingSuggestions([]);
    closeSectionEditors();
  }, [visible, wordToEdit]);

  function close() {
    resetForm();
    onClose();
  }

  function resetForm() {
    setTerm('');
    setDefinition('');
    setSimpleDefinition('');
    setExample('');
    setPartOfSpeech('');
    setPronunciation('');
    setOrigin('');
    setOriginPeriod('');
    setBasicInfo('');
    setSynonyms([]);
    setAntonyms([]);
    setAntonymsText('');
    setCommonWordsText('');
    setWordnikDetails({});
    setDefinitionOptions([]);
    setDefinitionOptionIndex(0);
    setLookupStatus('');
    setSpellingSuggestions([]);
    closeSectionEditors();
  }

  async function autoDefine(nextTerm = term) {
    const cleanTerm = nextTerm.trim();
    if (!cleanTerm) {
      Alert.alert('Type a word first', 'Enter the word you want WordWiz to define.');
      return;
    }

    if (cleanTerm !== term) {
      setTerm(cleanTerm);
    }

    setIsLookingUp(true);
    setLookupStatus('');
    setSpellingSuggestions([]);
    try {
      const details = await lookupWordDetails(cleanTerm);
      const nextDefinition = details.definition.trim();
      setDefinition(nextDefinition);
      setDefinitionOptions(details.definitionOptions ?? []);
      setDefinitionOptionIndex(0);
      setSimpleDefinition(details.simpleDefinition ?? '');
      setExample(details.example);
      setPartOfSpeech(details.partOfSpeech ?? '');
      setPronunciation(details.pronunciation ?? '');
      setOrigin(details.origin ?? '');
      setOriginPeriod(details.originPeriod ?? '');
      setBasicInfo(details.basicInfo ?? '');
      setSynonyms(details.synonyms ?? []);
      setAntonyms(details.antonyms ?? []);
      setAntonymsText((details.antonyms ?? []).join(', '));
      setCommonWordsText((details.commonWords ?? []).join(', '));
      setWordnikDetails(pickWordnikDetails(details));
      closeSectionEditors();
      setLookupStatus(
        nextDefinition
          ? 'Definition found. You can edit anything before saving.'
          : 'WordWiz found word details, but this source did not include a full definition. Add one before saving.',
      );
      Keyboard.dismiss();
    } catch {
      setWordnikDetails({});
      setDefinitionOptions([]);
      setDefinitionOptionIndex(0);
      const suggestions = await suggestWordSpellings(cleanTerm);
      setSpellingSuggestions(suggestions);
      setLookupStatus(
        suggestions.length
          ? 'WordWiz could not find that spelling. Try one of these?'
          : 'WordWiz could not find that word. You can still add your own meaning.',
      );
    } finally {
      setIsLookingUp(false);
    }
  }

  function getCommonWords() {
    return parseListText(commonWordsText);
  }

  function getSubmissionDetails(
    overrides: Partial<WordDetails> = {},
  ): Partial<WordDetails> {
    return {
      simpleDefinition,
      partOfSpeech,
      pronunciation,
      origin,
      originPeriod,
      synonyms,
      antonyms: parseListText(antonymsText),
      commonWords: getCommonWords(),
      basicInfo,
      ...wordnikDetails,
      ...overrides,
    };
  }

  function persistSavedWordEdits(overrides: Partial<WordDetails> = {}) {
    if (!wordToEdit || !term.trim() || !definition.trim() || !example.trim()) {
      return;
    }

    void onAdd(term, definition, example, getSubmissionDetails(overrides), {
      closeAfterSave: false,
    });
  }

  function getBasicInfoDraftValues() {
    const nextCommonWordsText = basicInfoDraft.commonWordsText.trim();

    return {
      partOfSpeech: basicInfoDraft.partOfSpeech.trim(),
      pronunciation: basicInfoDraft.pronunciation.trim(),
      basicInfo: basicInfoDraft.basicInfo.trim(),
      synonyms: parseListText(basicInfoDraft.synonymsText),
      antonyms: parseListText(basicInfoDraft.antonymsText),
      commonWordsText: nextCommonWordsText,
      commonWords: parseListText(nextCommonWordsText),
    };
  }

  function getPendingSectionDetails() {
    const pendingDetails: Partial<WordDetails> = {};

    if (isEditingBasicInfo) {
      const nextBasicInfo = getBasicInfoDraftValues();
      pendingDetails.partOfSpeech = nextBasicInfo.partOfSpeech;
      pendingDetails.pronunciation = nextBasicInfo.pronunciation;
      pendingDetails.basicInfo = nextBasicInfo.basicInfo;
      pendingDetails.synonyms = nextBasicInfo.synonyms;
      pendingDetails.antonyms = nextBasicInfo.antonyms;
      pendingDetails.commonWords = nextBasicInfo.commonWords;
    }

    if (isEditingTimePeriod) {
      pendingDetails.originPeriod = timePeriodDraft.trim();
    }

    if (isEditingHistory) {
      const nextOrigin = historyDraft.trim();
      pendingDetails.origin = nextOrigin;
      pendingDetails.originPeriod =
        pendingDetails.originPeriod || originPeriod || inferOriginPeriod(nextOrigin);
    }

    return pendingDetails;
  }

  function closeSectionEditors() {
    setIsEditingBasicInfo(false);
    setIsEditingTimePeriod(false);
    setIsEditingHistory(false);
  }

  function toggleBasicInfoEditing() {
    if (!isEditingBasicInfo) {
      setBasicInfoDraft({
        partOfSpeech,
        pronunciation,
        basicInfo,
        synonymsText: synonyms.join(', '),
        antonymsText,
        commonWordsText,
      });
      setIsEditingBasicInfo(true);
      requestAnimationFrame(() => basicInfoInputRef.current?.focus());
      return;
    }

    const nextBasicInfo = getBasicInfoDraftValues();

    setPartOfSpeech(nextBasicInfo.partOfSpeech);
    setPronunciation(nextBasicInfo.pronunciation);
    setBasicInfo(nextBasicInfo.basicInfo);
    setSynonyms(nextBasicInfo.synonyms);
    setAntonyms(nextBasicInfo.antonyms);
    setAntonymsText(nextBasicInfo.antonyms.join(', '));
    setCommonWordsText(nextBasicInfo.commonWordsText);
    setIsEditingBasicInfo(false);
    Keyboard.dismiss();
    persistSavedWordEdits({
      partOfSpeech: nextBasicInfo.partOfSpeech,
      pronunciation: nextBasicInfo.pronunciation,
      basicInfo: nextBasicInfo.basicInfo,
      synonyms: nextBasicInfo.synonyms,
      antonyms: nextBasicInfo.antonyms,
      commonWords: nextBasicInfo.commonWords,
    });
  }

  function toggleTimePeriodEditing() {
    if (!isEditingTimePeriod) {
      setTimePeriodDraft(originPeriod);
      setIsEditingTimePeriod(true);
      requestAnimationFrame(() => timePeriodInputRef.current?.focus());
      return;
    }

    const nextOriginPeriod = timePeriodDraft.trim();
    setOriginPeriod(nextOriginPeriod);
    setIsEditingTimePeriod(false);
    Keyboard.dismiss();
    persistSavedWordEdits({ originPeriod: nextOriginPeriod });
  }

  function toggleHistoryEditing() {
    if (!isEditingHistory) {
      setHistoryDraft(formatWordHistoryNarrative(origin, term));
      setIsEditingHistory(true);
      requestAnimationFrame(() => historyInputRef.current?.focus());
      return;
    }

    const nextOrigin = historyDraft.trim();
    const nextOriginPeriod = originPeriod || inferOriginPeriod(nextOrigin);
    setOrigin(nextOrigin);
    setOriginPeriod(nextOriginPeriod);
    setIsEditingHistory(false);
    Keyboard.dismiss();
    persistSavedWordEdits({
      origin: nextOrigin,
      originPeriod: nextOriginPeriod,
    });
  }

  async function submit() {
    if (duplicateWord) {
      Keyboard.dismiss();
      return;
    }

    if (!term.trim() || !definition.trim() || !example.trim()) {
      Alert.alert(
        'A little more detail',
        'Add the word, its meaning, and an example sentence.',
      );
      return;
    }
    const saved = await onAdd(
      term,
      definition,
      example,
      getSubmissionDetails(getPendingSectionDetails()),
    );
    if (saved) resetForm();
  }

  const hasLookupDefinition =
    lookupStatus.startsWith('Definition found') && definition.trim().length > 0;
  const definitionSourceCount = new Set(
    definitionOptions.map((option) => option.source),
  ).size;
  const viewedDefinitionOption = definitionOptions[definitionOptionIndex];
  const viewedDefinitionIsSelected =
    viewedDefinitionOption?.text.trim() === definition.trim();

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={close}
    >
      <SafeAreaView style={styles.modalSafeArea}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalKeyboard}
        >
          <ScrollView
            contentContainerStyle={styles.modalContent}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.modalTopRow}>
              <View style={styles.modalTopActionSlot}>
                <Pressable onPress={close} style={styles.closeButton}>
                  <Ionicons name="close" size={23} color={COLORS.ink} />
                </Pressable>
              </View>
              <View style={styles.modalStep}>
                <Ionicons name="sparkles" size={16} color={COLORS.purpleDark} />
                <Text style={styles.modalStepText}>NEW DISCOVERY</Text>
              </View>
              <View style={styles.modalTopActionSlot} />
            </View>

            <Text style={styles.modalTitle}>
              {wordToEdit ? 'Edit word' : 'Add a word'}
            </Text>
            <Text style={styles.modalSubtitle}>
              Writing it in your own words helps it stick.
            </Text>

            <InputGroup
              label="THE WORD"
              icon="text-outline"
              value={term}
              onChangeText={(value) => {
                setTerm(value);
                setLookupStatus('');
                setSpellingSuggestions([]);
                setWordnikDetails({});
                setDefinitionOptions([]);
                setDefinitionOptionIndex(0);
              }}
              placeholder="e.g. Serendipity"
              autoCapitalize="words"
              returnKeyType="search"
              onSubmitEditing={() => autoDefine()}
            />

            {duplicateWord ? (
              <View style={styles.duplicateWordNotice}>
                <View style={styles.duplicateWordIcon}>
                  <Ionicons name="bookmark" size={19} color={COLORS.orange} />
                </View>
                <View style={styles.duplicateWordCopy}>
                  <Text style={styles.duplicateWordTitle}>Already in your words</Text>
                  <Text style={styles.duplicateWordText}>
                    {duplicateWord.term} is saved already. Open it to review or update it.
                  </Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Edit saved word ${duplicateWord.term}`}
                  onPress={() => onEditExisting?.(duplicateWord)}
                  style={({ pressed }) => [
                    styles.duplicateWordAction,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={styles.duplicateWordActionText}>Edit</Text>
                  <Ionicons name="arrow-forward" size={13} color={COLORS.orange} />
                </Pressable>
              </View>
            ) : null}

            <Pressable
              onPress={() => autoDefine()}
              disabled={isLookingUp}
              style={({ pressed }) => [
                styles.lookupButton,
                isLookingUp && styles.lookupButtonDisabled,
                pressed && !isLookingUp && styles.pressed,
              ]}
            >
              <View style={styles.lookupButtonIcon}>
                <Ionicons
                  name={isLookingUp ? 'hourglass-outline' : 'sparkles'}
                  size={20}
                  color={COLORS.white}
                />
              </View>
              <View style={styles.lookupButtonCopy}>
                <Text style={styles.lookupButtonTitle}>
                  {isLookingUp ? 'Looking it up...' : 'Auto define this word'}
                </Text>
                <Text style={styles.lookupButtonSubtitle}>
                  Fill meaning, sentence, word history, and basic info.
                </Text>
              </View>
            </Pressable>

            {lookupStatus ? (
              <View
                style={[
                  styles.lookupStatus,
                  hasLookupDefinition
                    ? styles.lookupStatusSuccess
                    : styles.lookupStatusSoft,
                ]}
              >
                <Ionicons
                  name={
                    hasLookupDefinition
                      ? 'checkmark-circle'
                      : 'information-circle'
                  }
                  size={18}
                  color={hasLookupDefinition ? COLORS.purpleDark : COLORS.blue}
                />
                {hasLookupDefinition ? (
                  <>
                    <View style={styles.lookupStatusCopy}>
                      <Text style={styles.lookupStatusTitle}>
                        Definition found
                      </Text>
                      <Text style={styles.lookupStatusHelper}>
                        Review the details or add it now.
                      </Text>
                    </View>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Quick save word"
                      onPress={() => void submit()}
                      style={({ pressed }) => [
                        styles.lookupQuickAddButton,
                        pressed && styles.pressed,
                      ]}
                    >
                      <Ionicons name="checkmark" size={16} color={COLORS.white} />
                      <Text style={styles.lookupQuickAddButtonText}>
                        Quick save
                      </Text>
                    </Pressable>
                  </>
                ) : (
                  <Text style={styles.lookupStatusText}>{lookupStatus}</Text>
                )}
              </View>
            ) : null}

            {spellingSuggestions.length > 0 ? (
              <View style={styles.spellingSuggestionCard}>
                <View style={styles.spellingSuggestionHeader}>
                  <Ionicons name="sparkles" size={18} color={COLORS.purple} />
                  <Text style={styles.spellingSuggestionTitle}>
                    Did you mean...
                  </Text>
                </View>
                <View style={styles.spellingSuggestionList}>
                  {spellingSuggestions.map((suggestion) => (
                    <Pressable
                      key={suggestion}
                      onPress={() => autoDefine(suggestion)}
                      disabled={isLookingUp}
                      style={({ pressed }) => [
                        styles.spellingSuggestionChip,
                        pressed && !isLookingUp && styles.pressed,
                      ]}
                    >
                      <Text style={styles.spellingSuggestionChipText}>
                        {suggestion}
                      </Text>
                      <Ionicons
                        name="arrow-forward"
                        size={14}
                        color={COLORS.purpleDark}
                      />
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : null}

            {definitionOptions.length > 0 ? (
              <View style={styles.definitionPicker}>
                <View style={styles.definitionPickerHeader}>
                  <View style={styles.definitionPickerIcon}>
                    <Ionicons name="layers-outline" size={18} color={COLORS.blue} />
                  </View>
                  <View style={styles.definitionPickerToggleCopy}>
                    <Text style={styles.definitionPickerTitle}>Definition options</Text>
                    <Text style={styles.definitionPickerHelper}>
                      {definitionOptions.length > 1
                        ? `Recommended · ${definitionOptions.length} options from ${definitionSourceCount} ${definitionSourceCount === 1 ? 'source' : 'sources'}`
                        : 'Recommended · 1 source available'}
                    </Text>
                  </View>
                </View>

                {viewedDefinitionOption ? (
                  <Pressable
                    accessibilityRole="radio"
                    accessibilityState={{ checked: viewedDefinitionIsSelected }}
                    accessibilityLabel={`Use definition from ${viewedDefinitionOption.source}`}
                    onPress={() => {
                      setDefinition(viewedDefinitionOption.text);
                      setSimpleDefinition(
                        makeSimpleDefinition(viewedDefinitionOption.text, term),
                      );
                      if (viewedDefinitionOption.partOfSpeech) {
                        setPartOfSpeech(viewedDefinitionOption.partOfSpeech);
                      }
                    }}
                    style={({ pressed }) => [
                      styles.definitionOptionCard,
                      viewedDefinitionIsSelected && styles.definitionOptionCardSelected,
                      pressed && styles.pressed,
                    ]}
                  >
                    <View style={styles.definitionOptionHeader}>
                      <View style={styles.definitionSourceRow}>
                        <Text style={styles.definitionSource}>
                          {viewedDefinitionOption.source}
                        </Text>
                        {viewedDefinitionOption.partOfSpeech ? (
                          <Text style={styles.definitionPartOfSpeech}>
                            {viewedDefinitionOption.partOfSpeech}
                          </Text>
                        ) : null}
                        {viewedDefinitionOption.recommended ? (
                          <View style={styles.definitionRecommendedBadge}>
                            <Text style={styles.definitionRecommendedText}>
                              RECOMMENDED
                            </Text>
                          </View>
                        ) : null}
                      </View>
                      <View
                        style={[
                          styles.definitionSelectionMark,
                          viewedDefinitionIsSelected &&
                            styles.definitionSelectionMarkSelected,
                        ]}
                      >
                        {viewedDefinitionIsSelected ? (
                          <Ionicons name="checkmark" size={13} color={COLORS.white} />
                        ) : null}
                      </View>
                    </View>
                    <Text style={styles.definitionOptionText}>
                      {viewedDefinitionOption.text}
                    </Text>
                    <View style={styles.definitionOptionAction}>
                      <Ionicons
                        name={
                          viewedDefinitionIsSelected
                            ? 'checkmark-circle'
                            : 'add-circle-outline'
                        }
                        size={15}
                        color={
                          viewedDefinitionIsSelected
                            ? COLORS.greenDark
                            : COLORS.blue
                        }
                      />
                      <Text
                        style={[
                          styles.definitionOptionActionText,
                          viewedDefinitionIsSelected &&
                            styles.definitionOptionActionTextSelected,
                        ]}
                      >
                        {viewedDefinitionIsSelected
                          ? 'Selected'
                          : 'Use this definition'}
                      </Text>
                    </View>
                  </Pressable>
                ) : null}

                {definitionOptions.length > 1 ? (
                <View style={styles.definitionCarouselControls}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Previous definition"
                    disabled={definitionOptionIndex === 0}
                    onPress={() =>
                      setDefinitionOptionIndex((index) => Math.max(0, index - 1))
                    }
                    style={({ pressed }) => [
                      styles.definitionCarouselArrow,
                      definitionOptionIndex === 0 &&
                        styles.definitionCarouselArrowDisabled,
                      pressed && definitionOptionIndex > 0 && styles.pressed,
                    ]}
                  >
                    <Ionicons name="chevron-back" size={17} color={COLORS.blue} />
                  </Pressable>
                  <View style={styles.definitionCarouselDots}>
                    <Text style={styles.definitionOptionPosition}>
                      {definitionOptionIndex + 1} of {definitionOptions.length}
                    </Text>
                    <View style={styles.definitionCarouselDotRow}>
                      {definitionOptions.map((option, index) => (
                        <View
                          key={`${option.source}-${index}`}
                          style={[
                            styles.definitionCarouselDot,
                            index === definitionOptionIndex &&
                              styles.definitionCarouselDotActive,
                          ]}
                        />
                      ))}
                    </View>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Next definition"
                    disabled={definitionOptionIndex === definitionOptions.length - 1}
                    onPress={() =>
                      setDefinitionOptionIndex((index) =>
                        Math.min(definitionOptions.length - 1, index + 1),
                      )
                    }
                    style={({ pressed }) => [
                      styles.definitionCarouselArrow,
                      definitionOptionIndex === definitionOptions.length - 1 &&
                        styles.definitionCarouselArrowDisabled,
                      pressed &&
                        definitionOptionIndex < definitionOptions.length - 1 &&
                        styles.pressed,
                    ]}
                  >
                    <Ionicons name="chevron-forward" size={17} color={COLORS.blue} />
                  </Pressable>
                </View>
                ) : null}

                <Text style={styles.definitionPickerFootnote}>
                  Use the arrows to compare meanings, then tap a card to select it.
                </Text>
              </View>
            ) : null}

            <InputGroup
              label="WHAT IT MEANS"
              icon="bulb-outline"
              value={definition}
              onChangeText={setDefinition}
              placeholder="Full dictionary meaning..."
              multiline
            />
            <InputGroup
              label="VERY SIMPLE DEFINITION"
              icon="happy-outline"
              value={simpleDefinition}
              onChangeText={setSimpleDefinition}
              placeholder="Say it in easy words..."
              multiline
            />
            <InputGroup
              label="SYNONYMS"
              icon="people-outline"
              value={commonWordsText}
              onChangeText={setCommonWordsText}
              placeholder="quick, start, move"
              inputRef={synonymsInputRef}
            />
            <InputGroup
              label="ANTONYMS"
              icon="swap-horizontal-outline"
              value={antonymsText}
              onChangeText={setAntonymsText}
              placeholder="slow, stop, stay"
            />
            <InputGroup
              label="USE IT IN A SENTENCE"
              icon="chatbox-ellipses-outline"
              value={example}
              onChangeText={setExample}
              placeholder="I felt serendipity when..."
              multiline
            />

            {(partOfSpeech ||
              pronunciation ||
              synonyms.length > 0 ||
              antonymsText.trim() ||
              commonWordsText ||
              basicInfo) && (
              <View style={styles.lookupInfoCard}>
                <View style={styles.lookupInfoHeader}>
                  <View style={styles.lookupInfoHeaderTitle}>
                    <Ionicons name="reader-outline" size={19} color={COLORS.blue} />
                    <Text style={styles.lookupInfoTitle}>BASIC WORD INFO</Text>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={
                      isEditingBasicInfo
                        ? 'Save basic word info'
                        : 'Edit basic word info'
                    }
                    onPress={toggleBasicInfoEditing}
                    style={({ pressed }) => [
                      styles.lookupInfoEditButton,
                      isEditingBasicInfo && styles.lookupInfoEditButtonActive,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Ionicons
                      name={isEditingBasicInfo ? 'checkmark' : 'pencil'}
                      size={14}
                      color={isEditingBasicInfo ? COLORS.white : COLORS.purpleDark}
                    />
                  </Pressable>
                </View>
                {isEditingBasicInfo ? (
                  <View style={styles.sectionEditStack}>
                    <SectionEditField
                      label="Part of speech"
                      value={basicInfoDraft.partOfSpeech}
                      onChangeText={(value) =>
                        setBasicInfoDraft((draft) => ({
                          ...draft,
                          partOfSpeech: value,
                        }))
                      }
                      placeholder="noun"
                      inputRef={basicInfoInputRef}
                    />
                    <SectionEditField
                      label="Pronunciation"
                      value={basicInfoDraft.pronunciation}
                      onChangeText={(value) =>
                        setBasicInfoDraft((draft) => ({
                          ...draft,
                          pronunciation: value,
                        }))
                      }
                      placeholder="/ap.el/"
                    />
                    <SectionEditField
                      label="Basic info"
                      value={basicInfoDraft.basicInfo}
                      onChangeText={(value) =>
                        setBasicInfoDraft((draft) => ({
                          ...draft,
                          basicInfo: value,
                        }))
                      }
                      placeholder="Quick context about this word..."
                      multiline
                    />
                    <SectionEditField
                      label="Similar words"
                      value={basicInfoDraft.synonymsText}
                      onChangeText={(value) =>
                        setBasicInfoDraft((draft) => ({
                          ...draft,
                          synonymsText: value,
                        }))
                      }
                      placeholder="similar, related, nearby"
                    />
                    <SectionEditField
                      label="Synonyms"
                      value={basicInfoDraft.commonWordsText}
                      onChangeText={(value) =>
                        setBasicInfoDraft((draft) => ({
                          ...draft,
                          commonWordsText: value,
                        }))
                      }
                      placeholder="quick, start, move"
                    />
                    <SectionEditField
                      label="Antonyms"
                      value={basicInfoDraft.antonymsText}
                      onChangeText={(value) =>
                        setBasicInfoDraft((draft) => ({
                          ...draft,
                          antonymsText: value,
                        }))
                      }
                      placeholder="opposite, contrary"
                    />
                  </View>
                ) : (
                  <>
                    <View style={styles.infoChipRow}>
                      {partOfSpeech ? (
                        <InfoChip icon="pricetag-outline" text={partOfSpeech} />
                      ) : null}
                      {pronunciation ? (
                        <InfoChip icon="volume-medium-outline" text={pronunciation} />
                      ) : null}
                    </View>
                    {basicInfo ? (
                      <Text style={styles.lookupInfoText}>{basicInfo}</Text>
                    ) : null}
                    {synonyms.length > 0 ? (
                      <Text style={styles.lookupInfoText}>
                        Similar words: {synonyms.join(', ')}
                      </Text>
                    ) : null}
                    {parseListText(antonymsText).length > 0 ? (
                      <Text style={styles.lookupInfoText}>
                        Antonyms: {parseListText(antonymsText).join(', ')}
                      </Text>
                    ) : null}
                    {commonWordsText ? (
                      <Text style={styles.lookupInfoText}>
                        Synonyms: {commonWordsText}
                      </Text>
                    ) : null}
                  </>
                )}
              </View>
            )}

            {(origin || originPeriod) ? (
              <View style={styles.historyCard}>
                <View style={styles.lookupInfoHeader}>
                  <View style={styles.lookupInfoHeaderTitle}>
                    <Ionicons name="library-outline" size={19} color={COLORS.purple} />
                    <Text style={styles.historyTitle}>TIME PERIOD</Text>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={
                      isEditingTimePeriod
                        ? 'Save time period'
                        : 'Edit time period'
                    }
                    onPress={toggleTimePeriodEditing}
                    style={({ pressed }) => [
                      styles.lookupInfoEditButton,
                      isEditingTimePeriod && styles.lookupInfoEditButtonActive,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Ionicons
                      name={isEditingTimePeriod ? 'checkmark' : 'pencil'}
                      size={14}
                      color={isEditingTimePeriod ? COLORS.white : COLORS.purpleDark}
                    />
                  </Pressable>
                </View>
                {isEditingTimePeriod ? (
                  <SectionEditField
                    label="Time period note"
                    value={timePeriodDraft}
                    onChangeText={setTimePeriodDraft}
                    placeholder="First recorded, origin, or time period notes..."
                    multiline
                    inputRef={timePeriodInputRef}
                  />
                ) : (
                  <View style={styles.historyDetailRow}>
                    <Text style={styles.historyText}>
                      {formatTimePeriodSnapshot(originPeriod, origin, term)}
                    </Text>
                  </View>
                )}
                <Pressable
                  onPress={() => openEtymonline(term)}
                  style={({ pressed }) => [
                    styles.historyExternalLink,
                    pressed && styles.pressed,
                  ]}
                >
                  <Ionicons name="open-outline" size={14} color={COLORS.blue} />
                  <Text style={styles.historyExternalLinkText}>
                    View deeper history on Etymonline
                  </Text>
                </Pressable>
              </View>
            ) : null}

            {origin ? (
              <View style={[styles.historyCard, styles.wordHistoryCard]}>
                <View style={styles.lookupInfoHeader}>
                  <View style={styles.lookupInfoHeaderTitle}>
                    <Ionicons
                      name="library-outline"
                      size={19}
                      color={COLORS.greenDark}
                    />
                    <Text style={styles.wordHistoryTitle}>WORD HISTORY</Text>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={
                      isEditingHistory
                        ? 'Save word history'
                        : 'Edit word history'
                    }
                    onPress={toggleHistoryEditing}
                    style={({ pressed }) => [
                      styles.lookupInfoEditButton,
                      isEditingHistory && styles.lookupInfoEditButtonActive,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Ionicons
                      name={isEditingHistory ? 'checkmark' : 'pencil'}
                      size={14}
                      color={isEditingHistory ? COLORS.white : COLORS.purpleDark}
                    />
                  </Pressable>
                </View>
                {isEditingHistory ? (
                  <TextInput
                    ref={historyInputRef}
                    value={historyDraft}
                    onChangeText={setHistoryDraft}
                    placeholder="Tell the story of how the word developed..."
                    placeholderTextColor="#9B95B9"
                    multiline
                    style={[
                      styles.input,
                      styles.inputMultiline,
                      styles.wordHistoryInput,
                    ]}
                  />
                ) : (
                  <Text style={styles.wordHistoryText}>
                    {formatWordHistoryNarrative(origin, term)}
                  </Text>
                )}
              </View>
            ) : null}

            <View style={styles.memoryTip}>
              <View style={styles.memoryTipIcon}>
                <Ionicons name="heart" size={18} color={COLORS.purple} />
              </View>
              <Text style={styles.memoryTipText}>
                Make the example personal or funny. Your brain remembers
                meaningful moments best.
              </Text>
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={wordToEdit ? 'Save changes' : 'Save word'}
              onPress={() => void submit()}
              style={({ pressed }) => [
                styles.primaryButton,
                pressed && styles.primaryButtonPressed,
              ]}
            >
              <Text style={styles.primaryButtonText}>
                {wordToEdit ? 'SAVE CHANGES' : 'SAVE TO MY WORDS'}
              </Text>
              <Ionicons name="checkmark" size={22} color={COLORS.white} />
            </Pressable>

          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

function openEtymonline(term: string) {
  const query = encodeURIComponent(term.trim().toLowerCase());
  if (!query) {
    return;
  }

  Linking.openURL(`https://www.etymonline.com/search?q=${query}`);
}

function pickWordnikDetails(details: WordDetails): Partial<WordDetails> {
  return {
    wordnik_definitions: details.wordnik_definitions,
    wordnik_examples: details.wordnik_examples,
    wordnik_pronunciations: details.wordnik_pronunciations,
    wordnik_etymology: details.wordnik_etymology,
    wordnik_related_words: details.wordnik_related_words,
    wordnik_antonyms: details.wordnik_antonyms,
    wordnik_syllables: details.wordnik_syllables,
    wordnik_attribution: details.wordnik_attribution,
    wordnik_url: details.wordnik_url,
  };
}

function parseListText(value: string) {
  return value
    .split(',')
    .map((word) => word.trim())
    .filter(Boolean);
}

function InputGroup({
  label,
  icon,
  value,
  onChangeText,
  placeholder,
  multiline = false,
  autoCapitalize = 'sentences',
  returnKeyType,
  onSubmitEditing,
  inputRef,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  multiline?: boolean;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  returnKeyType?: 'done' | 'go' | 'next' | 'search' | 'send';
  onSubmitEditing?: () => void;
  inputRef?: RefObject<TextInput | null>;
}) {
  return (
    <View style={styles.inputGroup}>
      <View style={styles.inputLabelRow}>
        <Ionicons name={icon} size={17} color={COLORS.purpleDark} />
        <Text style={styles.inputLabel}>{label}</Text>
      </View>
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#B5ABC9"
        multiline={multiline}
        autoCapitalize={autoCapitalize}
        returnKeyType={returnKeyType}
        onSubmitEditing={onSubmitEditing}
        style={[styles.input, multiline && styles.inputMultiline]}
      />
    </View>
  );
}

function SectionEditField({
  label,
  value,
  onChangeText,
  placeholder,
  multiline = false,
  inputRef,
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  multiline?: boolean;
  inputRef?: RefObject<TextInput | null>;
}) {
  return (
    <View style={styles.sectionEditField}>
      <Text style={styles.sectionEditLabel}>{label}</Text>
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#9B95B9"
        multiline={multiline}
        style={[
          styles.sectionEditInput,
          multiline && styles.sectionEditInputMultiline,
        ]}
      />
    </View>
  );
}
