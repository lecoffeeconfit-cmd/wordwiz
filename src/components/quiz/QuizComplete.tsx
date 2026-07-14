import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
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
  const isPerfect = percentage === 100;
  const isStrongScore = percentage >= 80;
  const [now, setNow] = useState(() => Date.now());
  const refreshParts = useMemo(() => getDailyRefreshParts(now), [now]);

  useEffect(() => {
    if (isPractice) {
      return;
    }

    const intervalId = setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => clearInterval(intervalId);
  }, [isPractice]);

  return (
    <View style={[styles.completeCard, !isPractice && styles.completeCardDaily]}>
      <View style={styles.completeHeaderRow}>
        <View style={[styles.completeBadge, !isPractice && styles.completeBadgeDaily]}>
          <Ionicons
            name={isPerfect ? 'trophy' : isPractice ? 'sparkles' : 'checkmark'}
            size={34}
            color={COLORS.white}
          />
        </View>
        <View style={styles.completeHeaderCopy}>
          <Text style={[styles.completeEyebrow, !isPractice && styles.completeEyebrowDaily]}>
            {isPractice ? 'PRACTICE ROUND' : 'DAILY QUIZ'}
          </Text>
          <Text style={styles.completeTitle}>
            {isPerfect
              ? 'Perfect recall!'
              : isPractice
                ? 'Practice complete'
                : 'Daily goal complete'}
          </Text>
        </View>
      </View>
      <View
        style={[
          styles.completeScoreCard,
          !isPractice && styles.completeScoreCardDaily,
          isStrongScore && styles.completeScoreCardStrong,
        ]}
      >
        <View style={styles.completeScoreMain}>
          <Text style={styles.completeScoreLabel}>YOUR SCORE</Text>
          <Text
            style={[
              styles.completeScore,
              !isPractice && { color: getDailyScoreColor(percentage) },
            ]}
          >
            {score} <Text style={styles.completeTotal}>/ {total}</Text>
          </Text>
          <Text style={styles.completeScoreMeta}>
            CORRECT · {percentage}% ACCURACY
          </Text>
          {isStrongScore ? (
            <View
              style={[
                styles.completeRewardPill,
                isPerfect && styles.completeRewardPillPerfect,
              ]}
            >
              <Ionicons
                name={isPerfect ? 'trophy' : 'sparkles'}
                size={14}
                color={isPerfect ? '#C68B00' : COLORS.greenDark}
              />
              <Text
                style={[
                  styles.completeRewardPillText,
                  isPerfect && styles.completeRewardPillTextPerfect,
                ]}
              >
                {isPerfect ? 'PERFECT RECALL' : 'STRONG RECALL'}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
      <Text style={styles.completeText}>
        {percentage === 100
          ? 'Every answer landed. Those words are really starting to stick.'
          : percentage >= 60
            ? 'Great practice. Every review makes your memory stronger.'
            : 'Good start. The flashcards are ready for another look.'}
      </Text>
      <View style={[styles.completeNoticeCard, !isPractice && styles.completeNoticeCardDaily]}>
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
              : 'Daily streak saved. Extra practice still strengthens your word memory.'}
          </Text>
        </View>
        <View style={styles.completeNoticeDivider} />
        {isPractice ? (
          <View style={styles.completeNoticeRow}>
            <View style={styles.comeBackIcon}>
              <Ionicons name="sunny" size={17} color={COLORS.yellow} />
            </View>
            <Text style={styles.comeBackText}>
              Today’s daily quiz stays locked in
            </Text>
          </View>
        ) : (
          <View style={styles.quizRefreshTimer}>
            <View style={styles.quizRefreshHeader}>
              <View style={styles.quizRefreshIcon}>
                <Ionicons name="time-outline" size={17} color={COLORS.orange} />
              </View>
              <Text style={styles.quizRefreshTitle}>
                Next daily quiz unlocks in
              </Text>
            </View>
            <View style={styles.quizRefreshTimeRow}>
              {refreshParts.map((part) => (
                <View key={part.label} style={styles.quizRefreshTimePill}>
                  <Text style={styles.quizRefreshTimeValue}>{part.value}</Text>
                  <Text style={styles.quizRefreshTimeLabel}>{part.label}</Text>
                </View>
              ))}
            </View>
          </View>
        )}
      </View>
    </View>
  );
}

function getDailyRefreshParts(now: number) {
  const nextDay = new Date(now);
  nextDay.setDate(nextDay.getDate() + 1);
  nextDay.setHours(0, 0, 0, 0);

  const remainingSeconds = Math.max(0, Math.ceil((nextDay.getTime() - now) / 1000));
  const hours = Math.floor(remainingSeconds / 3600);
  const minutes = Math.floor((remainingSeconds % 3600) / 60);
  const seconds = remainingSeconds % 60;

  return [
    { label: 'HRS', value: formatTimerPart(hours) },
    { label: 'MIN', value: formatTimerPart(minutes) },
    { label: 'SEC', value: formatTimerPart(seconds) },
  ];
}

function formatTimerPart(value: number) {
  return `${value}`.padStart(2, '0');
}

function getDailyScoreColor(percentage: number) {
  if (percentage >= 100) return '#F4B400';
  if (percentage >= 60) return COLORS.greenDark;
  return COLORS.orange;
}
