import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { COLORS, TILE_COLORS } from '../../constants/theme';
import type { Tab, Word } from '../../types';
import { styles } from '../../styles';

export function QuizComplete({ score, total }: { score: number; total: number }) {
  const percentage = total ? Math.round((score / total) * 100) : 0;
  return (
    <View style={styles.completeCard}>
      <View style={styles.completeBadge}>
        <Ionicons name="checkmark" size={44} color={COLORS.white} />
      </View>
      <Text style={styles.completeTitle}>Daily goal complete</Text>
      <Text style={styles.completeScore}>
        {score} <Text style={styles.completeTotal}>/ {total}</Text>
      </Text>
      <Text style={styles.completeText}>
        {percentage === 100
          ? 'A perfect round. Those words are looking familiar!'
          : percentage >= 60
            ? 'Great practice. Every review makes your memory stronger.'
            : 'Good start. The flashcards are ready for another look.'}
      </Text>
      <View style={styles.comeBackPill}>
        <Ionicons name="sunny" size={18} color={COLORS.yellow} />
        <Text style={styles.comeBackText}>Come back tomorrow for a new quiz</Text>
      </View>
    </View>
  );
}
