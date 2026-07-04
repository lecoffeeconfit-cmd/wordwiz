import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import { COLORS, TILE_COLORS } from '../../constants/theme';
import type { Tab, Word } from '../../types';
import { styles } from '../../styles';
import {
  formatTimePeriodSnapshot,
  formatWordHistoryNarrative,
} from '../../utils';
import { SpeakButton } from '../shared/SpeakButton';

export function WordInfoPanel({ word }: { word: Word }) {
  const hasInfo =
    word.partOfSpeech ||
    word.pronunciation ||
    word.origin ||
    word.originPeriod ||
    word.basicInfo ||
    word.commonWords?.length ||
    word.synonyms?.length ||
    word.antonyms?.length;

  if (!hasInfo) return null;

  return (
    <View style={styles.wordInfoPanel}>
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
          <Text style={styles.commonWordsTitle}>OPPOSITES</Text>
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
      {(word.origin || word.originPeriod) && (
        <View style={styles.originBox}>
          <Ionicons name="library-outline" size={17} color={COLORS.blue} />
          <View style={styles.originCopy}>
            {(word.origin || word.originPeriod) && (
              <>
                <Text style={styles.originLabel}>TIME PERIOD</Text>
                <Text style={styles.originText}>
                  {formatTimePeriodSnapshot(
                    word.originPeriod,
                    word.origin,
                    word.term,
                  )}
                </Text>
              </>
            )}
            {word.origin && (
              <>
                <Text style={styles.originLabel}>WORD HISTORY</Text>
                <Text style={styles.originText}>
                  {formatWordHistoryNarrative(word.origin, word.term)}
                </Text>
              </>
            )}
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
          </View>
        </View>
      )}
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
