import { Ionicons } from '@expo/vector-icons';
import { Text, View } from 'react-native';
import { COLORS } from '../../constants/theme';
import { styles } from '../../styles';

export function QuizComplete({
  score,
  total,
  mode = 'daily',
}: {
  score: number;
  total: number;
  mode?: 'daily' | 'practice';
}) {
  const percentage = total ? Math.round((score / total) * 100) : 0;
  const isPractice = mode === 'practice';
  return (
    <View style={styles.completeCard}>
      <View style={styles.completeHeaderRow}>
        <View style={styles.completeBadge}>
          <Ionicons
            name={isPractice ? 'sparkles' : 'checkmark'}
            size={34}
            color={COLORS.white}
          />
        </View>
        <View style={styles.completeHeaderCopy}>
          <Text style={styles.completeEyebrow}>
            {isPractice ? 'PRACTICE ROUND' : 'DAILY QUIZ'}
          </Text>
          <Text style={styles.completeTitle}>
            {isPractice ? 'Practice complete' : 'Daily goal complete'}
          </Text>
        </View>
      </View>
      <View style={styles.completeScoreCard}>
        <Text style={styles.completeScore}>
          {score} <Text style={styles.completeTotal}>/ {total}</Text>
        </Text>
        <Text style={styles.completeScoreLabel}>CORRECT</Text>
      </View>
      <Text style={styles.completeText}>
        {percentage === 100
          ? 'A perfect round. Those words are looking familiar!'
          : percentage >= 60
            ? 'Great practice. Every review makes your memory stronger.'
            : 'Good start. The flashcards are ready for another look.'}
      </Text>
      <View style={styles.completeNoticeCard}>
        <View style={styles.completeNoticeRow}>
          <View
            style={[
              styles.quizCreditIcon,
              isPractice && styles.quizCreditIconPractice,
            ]}
          >
            <Ionicons
              name={isPractice ? 'bar-chart' : 'flame'}
              size={17}
              color={isPractice ? COLORS.blue : '#FF6B2C'}
            />
          </View>
          <Text style={styles.quizCreditNoteText}>
            {isPractice
              ? 'Practice does not replace today’s daily score, but it still helps your stats and word mastery.'
              : 'Daily streak credit saved. Extra practice still helps your stats and word mastery.'}
          </Text>
        </View>
        <View style={styles.completeNoticeDivider} />
        <View style={styles.completeNoticeRow}>
          <View style={styles.comeBackIcon}>
            <Ionicons name="sunny" size={17} color={COLORS.yellow} />
          </View>
          <Text style={styles.comeBackText}>
            {isPractice
              ? 'Today’s daily quiz stays locked in'
              : 'Come back tomorrow for a new daily quiz'}
          </Text>
        </View>
      </View>
    </View>
  );
}
