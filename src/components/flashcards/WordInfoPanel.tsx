import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { COLORS, TILE_COLORS } from '../../constants/theme';
import type { Tab, Word } from '../../types';
import { styles } from '../../styles';

export function WordInfoPanel({ word }: { word: Word }) {
  const hasInfo =
    word.partOfSpeech ||
    word.pronunciation ||
    word.origin ||
    word.originPeriod ||
    word.basicInfo ||
    word.commonWords?.length ||
    word.synonyms?.length;

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
      {word.synonyms && word.synonyms.length > 0 && (
        <Text style={styles.wordInfoText}>
          Similar words: {word.synonyms.join(', ')}
        </Text>
      )}
      {(word.origin || word.originPeriod) && (
        <View style={styles.originBox}>
          <Ionicons name="library-outline" size={17} color={COLORS.blue} />
          <View style={styles.originCopy}>
            {word.origin && (
              <>
                <Text style={styles.originLabel}>WHERE FROM</Text>
                <Text style={styles.originText}>{word.origin}</Text>
              </>
            )}
            {word.originPeriod && (
              <>
                <Text style={styles.originLabel}>TIME PERIOD</Text>
                <Text style={styles.originText}>{word.originPeriod}</Text>
              </>
            )}
          </View>
        </View>
      )}
    </View>
  );
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
