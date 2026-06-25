import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS } from '../constants/theme';
import type { LegalPage, WordDetails } from '../types';
import { styles } from '../styles';
import { lookupWordDetails, suggestWordSpellings } from '../services';
import { InfoChip } from '../components';
import { inferOriginPeriod } from '../utils';

export function AddWordModal({
  visible,
  onClose,
  onAdd,
}: {
  visible: boolean;
  onClose: () => void;
  onAdd: (
    term: string,
    definition: string,
    example: string,
    details?: Partial<WordDetails>,
  ) => void;
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
  const [commonWordsText, setCommonWordsText] = useState('');
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [lookupStatus, setLookupStatus] = useState('');
  const [spellingSuggestions, setSpellingSuggestions] = useState<string[]>([]);

  function close() {
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
    setCommonWordsText('');
    setLookupStatus('');
    setSpellingSuggestions([]);
    onClose();
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
      setDefinition(details.definition);
      setSimpleDefinition(details.simpleDefinition ?? '');
      setExample(details.example);
      setPartOfSpeech(details.partOfSpeech ?? '');
      setPronunciation(details.pronunciation ?? '');
      setOrigin(details.origin ?? '');
      setOriginPeriod(details.originPeriod ?? '');
      setBasicInfo(details.basicInfo ?? '');
      setSynonyms(details.synonyms ?? []);
      setCommonWordsText((details.commonWords ?? []).join(', '));
      setLookupStatus('Definition found. You can edit anything before saving.');
    } catch {
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

  function submit() {
    if (!term.trim() || !definition.trim() || !example.trim()) {
      Alert.alert(
        'A little more detail',
        'Add the word, its meaning, and an example sentence.',
      );
      return;
    }
    onAdd(term, definition, example, {
      simpleDefinition,
      partOfSpeech,
      pronunciation,
      origin,
      originPeriod,
      synonyms,
      commonWords: commonWordsText
        .split(',')
        .map((word) => word.trim())
        .filter(Boolean),
      basicInfo,
    });
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
    setCommonWordsText('');
    setLookupStatus('');
    setSpellingSuggestions([]);
  }

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
              <Pressable onPress={close} style={styles.closeButton}>
                <Ionicons name="close" size={23} color={COLORS.ink} />
              </Pressable>
              <View style={styles.modalStep}>
                <Ionicons name="sparkles" size={16} color={COLORS.purpleDark} />
                <Text style={styles.modalStepText}>NEW DISCOVERY</Text>
              </View>
              <View style={styles.closeButtonPlaceholder} />
            </View>

            <Text style={styles.modalTitle}>Add a word</Text>
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
              }}
              placeholder="e.g. Serendipity"
              autoCapitalize="words"
            />

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
                  definition ? styles.lookupStatusSuccess : styles.lookupStatusSoft,
                ]}
              >
                <Ionicons
                  name={definition ? 'checkmark-circle' : 'information-circle'}
                  size={18}
                  color={definition ? COLORS.purpleDark : COLORS.blue}
                />
                <Text style={styles.lookupStatusText}>{lookupStatus}</Text>
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
              label="COMMON WORDS"
              icon="people-outline"
              value={commonWordsText}
              onChangeText={setCommonWordsText}
              placeholder="easy, simple, plain"
            />
            <InputGroup
              label="USE IT IN A SENTENCE"
              icon="chatbox-ellipses-outline"
              value={example}
              onChangeText={setExample}
              placeholder="I felt serendipity when..."
              multiline
            />

            {(partOfSpeech || pronunciation || synonyms.length > 0 || commonWordsText) && (
              <View style={styles.lookupInfoCard}>
                <View style={styles.lookupInfoHeader}>
                  <Ionicons name="reader-outline" size={19} color={COLORS.blue} />
                  <Text style={styles.lookupInfoTitle}>BASIC WORD INFO</Text>
                </View>
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
                {commonWordsText ? (
                  <Text style={styles.lookupInfoText}>
                    Common words: {commonWordsText}
                  </Text>
                ) : null}
              </View>
            )}

            {origin ? (
              <View style={styles.historyCard}>
                <View style={styles.lookupInfoHeader}>
                  <Ionicons name="library-outline" size={19} color={COLORS.purple} />
                  <Text style={styles.historyTitle}>WORD HISTORY</Text>
                </View>
                <View style={styles.historyDetailRow}>
                  <Text style={styles.historyDetailLabel}>WHERE FROM</Text>
                  <Text style={styles.historyText}>{origin}</Text>
                </View>
                <View style={styles.historyDetailRow}>
                  <Text style={styles.historyDetailLabel}>TIME PERIOD</Text>
                  <Text style={styles.historyText}>
                    {originPeriod ||
                      'Time period not available from this dictionary source.'}
                  </Text>
                </View>
              </View>
            ) : null}

            <InputGroup
              label="WORD HISTORY"
              icon="library-outline"
              value={origin}
              onChangeText={(value) => {
                setOrigin(value);
                if (!originPeriod) setOriginPeriod(inferOriginPeriod(value));
              }}
              placeholder="Where the word came from..."
              multiline
            />
            <InputGroup
              label="TIME PERIOD"
              icon="time-outline"
              value={originPeriod}
              onChangeText={setOriginPeriod}
              placeholder="e.g. Old English, 1600s, unknown..."
            />

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
              onPress={submit}
              style={({ pressed }) => [
                styles.primaryButton,
                pressed && styles.primaryButtonPressed,
              ]}
            >
              <Text style={styles.primaryButtonText}>SAVE TO MY WORDS</Text>
              <Ionicons name="checkmark" size={22} color={COLORS.white} />
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

function InputGroup({
  label,
  icon,
  value,
  onChangeText,
  placeholder,
  multiline = false,
  autoCapitalize = 'sentences',
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  multiline?: boolean;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
}) {
  return (
    <View style={styles.inputGroup}>
      <View style={styles.inputLabelRow}>
        <Ionicons name={icon} size={17} color={COLORS.purpleDark} />
        <Text style={styles.inputLabel}>{label}</Text>
      </View>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#A7B0BD"
        multiline={multiline}
        autoCapitalize={autoCapitalize}
        style={[styles.input, multiline && styles.inputMultiline]}
      />
    </View>
  );
}
