import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { COLORS, TILE_COLORS } from '../../constants/theme';
import type { Tab, Word } from '../../types';
import { styles } from '../../styles';

export function ScreenHeader({
  eyebrow,
  title,
  subtitle,
  action,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  action?: ReactNode;
}) {
  const theme = getHeaderTheme(eyebrow);

  return (
    <View style={styles.header}>
      <View
        style={[
          styles.screenHeaderCard,
          { backgroundColor: theme.background },
        ]}
      >
        <View
          style={[
            styles.screenHeaderCloudOne,
            { backgroundColor: theme.cloudOne },
          ]}
        />
        <View
          style={[
            styles.screenHeaderCloudTwo,
            { backgroundColor: theme.cloudTwo },
          ]}
        />
        <View
          style={[
            styles.screenHeaderCloudThree,
            { backgroundColor: theme.cloudThree },
          ]}
        />
        <View style={styles.screenHeaderPlane}>
          <Ionicons name={theme.icon} size={22} color={theme.accent} />
        </View>
        <View style={styles.brandRow}>
          <View style={[styles.miniLogo, { backgroundColor: theme.accent }]}>
            <Ionicons name="sparkles" size={17} color={COLORS.white} />
          </View>
          <Text style={[styles.brandName, { color: theme.accent }]}>WORDWIZ</Text>
        </View>
        {action ? <View style={styles.screenHeaderAction}>{action}</View> : null}
        <View style={styles.headerTextCard}>
          <Text style={[styles.eyebrow, { color: theme.accent }]}>
            {eyebrow}
          </Text>
          <Text style={styles.screenTitle}>{title}</Text>
          <Text style={styles.screenSubtitle}>{subtitle}</Text>
        </View>
      </View>
    </View>
  );
}

export function getHeaderTheme(eyebrow: string) {
  if (eyebrow.includes('COLLECTION')) {
    return {
      accent: COLORS.teal,
      background: '#DDF6ED',
      cloudOne: '#EAF2FF',
      cloudTwo: '#FFF0DC',
      cloudThree: '#FFFFFF',
      icon: 'book-outline' as keyof typeof Ionicons.glyphMap,
    };
  }
  if (eyebrow.includes('FLASHCARDS')) {
    return {
      accent: COLORS.purple,
      background: '#E9E2FF',
      cloudOne: '#FFEAF1',
      cloudTwo: '#EAF2FF',
      cloudThree: '#FFFFFF',
      icon: 'albums-outline' as keyof typeof Ionicons.glyphMap,
    };
  }
  if (eyebrow.includes('QUIZ')) {
    return {
      accent: COLORS.orange,
      background: '#FFE8C8',
      cloudOne: '#FFF7DF',
      cloudTwo: '#E8FBF4',
      cloudThree: '#FFFFFF',
      icon: 'trophy-outline' as keyof typeof Ionicons.glyphMap,
    };
  }
  if (eyebrow.includes('PROGRESS')) {
    return {
      accent: COLORS.blue,
      background: '#DCEBFF',
      cloudOne: '#F2EFFF',
      cloudTwo: '#E8FBF4',
      cloudThree: '#FFFFFF',
      icon: 'bar-chart-outline' as keyof typeof Ionicons.glyphMap,
    };
  }
  return {
    accent: COLORS.purple,
    background: '#D9E3FF',
    cloudOne: '#FFE4EC',
    cloudTwo: '#FFF3E8',
    cloudThree: '#FFFFFF',
    icon: 'paper-plane' as keyof typeof Ionicons.glyphMap,
  };
}
