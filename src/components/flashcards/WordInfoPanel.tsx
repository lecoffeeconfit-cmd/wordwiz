import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import { COLORS } from '../../constants/theme';
import type { Word } from '../../types';
import { styles } from '../../styles';
import {
  formatTimePeriodSnapshot,
  formatWordHistoryNarrative,
} from '../../utils';
import { SpeakButton } from '../shared/SpeakButton';

export function WordInfoPanel({
  word,
  onEdit,
}: {
  word: Word;
  onEdit?: (word: Word) => void;
}) {
  const hasInfo =
    word.partOfSpeech ||
    word.pronunciation ||
    word.origin ||
    word.originPeriod ||
    word.basicInfo ||
    word.commonWords?.length ||
    word.synonyms?.length ||
    word.antonyms?.length;
  const hasBasicInfo =
    word.partOfSpeech ||
    word.pronunciation ||
    word.basicInfo ||
    word.commonWords?.length ||
    word.synonyms?.length ||
    word.antonyms?.length;

  if (!hasInfo) return null;

  return (
    <View style={styles.wordInfoPanel}>
      {hasBasicInfo && (
        <InfoSection
          title="BASIC WORD INFO"
          icon="reader-outline"
          tone="blue"
          onEdit={onEdit ? () => onEdit(word) : undefined}
        >
          <View style={styles.infoChipRow}>
            {word.partOfSpeech && (
              <InfoChip icon="pricetag-outline" text={word.partOfSpeech} />
            )}
            {word.pronunciation && (
              <InfoChip icon="volume-medium-outline" text={word.pronunciation} />
            )}
            <SpeakButton term={word.term} />
          </View>
          {word.basicInfo && (
            <Text style={styles.wordInfoText}>{word.basicInfo}</Text>
          )}
          {word.commonWords && word.commonWords.length > 0 && (
            <View style={styles.commonWordsBox}>
              <Text style={styles.commonWordsTitle}>SYNONYMS</Text>
              <View style={styles.commonWordsWrap}>
                {word.commonWords.map((commonWord) => (
                  <Text key={commonWord} style={styles.commonWordChip}>
                    {commonWord}
                  </Text>
                ))}
              </View>
            </View>
          )}
          {word.antonyms && word.antonyms.length > 0 && (
            <View style={styles.commonWordsBox}>
              <Text style={styles.commonWordsTitle}>ANTONYMS</Text>
              <View style={styles.commonWordsWrap}>
                {word.antonyms.map((antonym) => (
                  <Text key={antonym} style={styles.commonWordChip}>
                    {antonym}
                  </Text>
                ))}
              </View>
            </View>
          )}
          {word.synonyms && word.synonyms.length > 0 && (
            <Text style={styles.wordInfoText}>
              Similar words: {word.synonyms.join(', ')}
            </Text>
          )}
        </InfoSection>
      )}
      {(word.origin || word.originPeriod) && (
        <InfoSection
          title="TIME PERIOD"
          icon="library-outline"
          tone="yellow"
          onEdit={onEdit ? () => onEdit(word) : undefined}
        >
          <Text style={styles.originText}>
            {formatTimePeriodSnapshot(word.originPeriod, word.origin, word.term)}
          </Text>
          <Pressable
            onPress={() => openEtymonline(word.term)}
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
        </InfoSection>
      )}
      {word.origin && (
        <InfoSection
          title="WORD HISTORY"
          icon="library-outline"
          tone="green"
          onEdit={onEdit ? () => onEdit(word) : undefined}
        >
          <Text style={styles.originText}>
            {formatWordHistoryNarrative(word.origin, word.term)}
          </Text>
          {!word.originPeriod && (
            <Pressable
              onPress={() => openEtymonline(word.term)}
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
          )}
        </InfoSection>
      )}
    </View>
  );
}

function InfoSection({
  title,
  icon,
  tone,
  onEdit,
  children,
}: {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  tone: 'blue' | 'green' | 'yellow';
  onEdit?: () => void;
  children: ReactNode;
}) {
  const sectionToneStyle =
    tone === 'green'
      ? styles.greenInfoSection
      : tone === 'yellow'
        ? styles.yellowInfoSection
        : styles.blueInfoSection;

  return (
    <View style={[styles.wordInfoSection, sectionToneStyle]}>
      <View style={styles.wordInfoSectionHeader}>
        <View style={styles.wordInfoSectionTitleRow}>
          <Ionicons
            name={icon}
            size={18}
            color={
              tone === 'green'
                ? COLORS.greenDark
                : tone === 'yellow'
                  ? COLORS.purple
                  : COLORS.blue
            }
          />
          <Text
            style={[
              styles.wordInfoSectionTitle,
              tone === 'green' && styles.greenInfoSectionTitle,
              tone === 'yellow' && styles.yellowInfoSectionTitle,
            ]}
          >
            {title}
          </Text>
        </View>
        {onEdit && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Edit ${title.toLowerCase()}`}
            onPress={onEdit}
            style={({ pressed }) => [
              styles.wordInfoEditButton,
              pressed && styles.pressed,
            ]}
          >
            <Ionicons name="pencil" size={14} color={COLORS.purpleDark} />
          </Pressable>
        )}
      </View>
      <View style={styles.wordInfoSectionBody}>{children}</View>
    </View>
  );
}

function openEtymonline(term: string) {
  const query = encodeURIComponent(term.trim().toLowerCase());
  if (!query) {
    return;
  }

  Linking.openURL(`https://www.etymonline.com/search?q=${query}`);
}

export function InfoChip({
  icon,
  text,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  text: string;
}) {
  return (
    <View style={styles.infoChip}>
      <Ionicons name={icon} size={13} color={COLORS.purpleDark} />
      <Text style={styles.infoChipText}>{text}</Text>
    </View>
  );
}
