import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Text, View } from 'react-native';
import { COLORS } from '../../constants/theme';
import { styles } from '../../styles';

export function QuizComplete({
  score,
  total,
  mode = 'daily',
  bonusXp = 0,
}: {
  score: number;
  total: number;
  mode?: 'daily' | 'practice';
  bonusXp?: number;
}) {
  const percentage = total ? Math.round((score / total) * 100) : 0;
  const isPractice = mode === 'practice';
  const isPerfect = percentage === 100;
  const isStrongScore = percentage >= 80;
  const scoreColor = getQuizScoreColor(percentage);
  const [now, setNow] = useState(() => Date.now());
  const [displayedScore, setDisplayedScore] = useState(0);
  const refreshParts = useMemo(() => getDailyRefreshParts(now), [now]);
  const cardEntrance = useRef(new Animated.Value(0)).current;
  const scoreScale = useRef(new Animated.Value(0.72)).current;
  const badgeScale = useRef(new Animated.Value(0.5)).current;
  const sparkleProgress = useRef(new Animated.Value(0)).current;
  const sparklePulse = useRef(new Animated.Value(0.45)).current;

  useEffect(() => {
    cardEntrance.setValue(0);
    scoreScale.setValue(0.72);
    badgeScale.setValue(0.5);
    sparkleProgress.setValue(0);
    setDisplayedScore(0);

    const entrance = Animated.sequence([
      Animated.delay(80),
      Animated.parallel([
        Animated.timing(cardEntrance, {
          toValue: 1,
          duration: 360,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.spring(badgeScale, {
          toValue: 1,
          friction: 5,
          tension: 90,
          useNativeDriver: true,
        }),
        Animated.spring(scoreScale, {
          toValue: 1,
          friction: 5,
          tension: 80,
          useNativeDriver: true,
        }),
        Animated.timing(sparkleProgress, {
          toValue: 1,
          duration: 700,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    ]);
    entrance.start();

    const countStartedAt = Date.now();
    let animationFrame = 0;
    const countScore = () => {
      const progress = Math.min(1, (Date.now() - countStartedAt) / 680);
      setDisplayedScore(Math.round(score * (1 - Math.pow(1 - progress, 3))));
      if (progress < 1) animationFrame = requestAnimationFrame(countScore);
    };
    animationFrame = requestAnimationFrame(countScore);

    return () => {
      entrance.stop();
      cancelAnimationFrame(animationFrame);
    };
  }, [badgeScale, cardEntrance, score, scoreScale, sparkleProgress]);

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(sparklePulse, {
          toValue: 1,
          duration: 1300,
          useNativeDriver: true,
        }),
        Animated.timing(sparklePulse, {
          toValue: 0.45,
          duration: 1300,
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [sparklePulse]);

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
    <Animated.View
      style={[
        styles.completeCard,
        !isPractice && styles.completeCardDaily,
        {
          opacity: cardEntrance,
          transform: [
            {
              translateY: cardEntrance.interpolate({
                inputRange: [0, 1],
                outputRange: [18, 0],
              }),
            },
          ],
        },
      ]}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          styles.completeCelebrationSparkle,
          styles.completeCelebrationSparkleOne,
          {
            opacity: Animated.multiply(sparkleProgress, sparklePulse),
            transform: [
              {
                translateY: sparkleProgress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [10, 0],
                }),
              },
            ],
          },
        ]}
      >
        <Ionicons name="sparkles" size={18} color="#FFC14D" />
      </Animated.View>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.completeCelebrationSparkle,
          styles.completeCelebrationSparkleTwo,
          {
            opacity: sparkleProgress.interpolate({
              inputRange: [0, 0.35, 1],
              outputRange: [0, 1, 0.75],
            }),
            transform: [
              {
                scale: sparkleProgress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.5, 1],
                }),
              },
            ],
          },
        ]}
      >
        <Ionicons name="star" size={14} color="#F4C866" />
      </Animated.View>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.completeCelebrationSparkle,
          styles.completeCelebrationSparkleThree,
          {
            opacity: Animated.multiply(sparkleProgress, sparklePulse),
            transform: [
              {
                scale: sparklePulse.interpolate({
                  inputRange: [0.45, 1],
                  outputRange: [0.8, 1.1],
                }),
              },
            ],
          },
        ]}
      >
        <Ionicons name="sparkles" size={10} color="#E2AF2F" />
      </Animated.View>
      <View style={styles.completeHeaderRow}>
        <Animated.View
          style={[
            styles.completeBadge,
            !isPractice && styles.completeBadgeDaily,
            isStrongScore && styles.completeBadgeTrophy,
            { transform: [{ scale: badgeScale }] },
          ]}
        >
          <Ionicons
            name="trophy"
            size={34}
            color={COLORS.white}
          />
        </Animated.View>
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
          <View style={styles.completeScoreLabelRow}>
            <Ionicons name="ribbon-outline" size={13} color={COLORS.purpleDark} />
            <Text style={styles.completeScoreLabel}>YOUR SCORE</Text>
          </View>
          <Animated.View style={{ transform: [{ scale: scoreScale }] }}>
            <Text
              style={[
                styles.completeScore,
                { color: scoreColor },
              ]}
            >
              {displayedScore} <Text style={styles.completeTotal}>/ {total}</Text>
            </Text>
          </Animated.View>
          <Text style={[styles.completeScoreMeta, { color: scoreColor }]}>
            CORRECT · {percentage}% ACCURACY
          </Text>
          <View style={styles.completeAccuracyTrack}>
            <View
              style={[
                styles.completeAccuracyFill,
                {
                  width: `${percentage}%`,
                  backgroundColor: scoreColor,
                },
              ]}
            />
          </View>
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
          {bonusXp > 0 ? (
            <View style={styles.completeXpPill}>
              <Ionicons name="flash" size={14} color={COLORS.purpleDark} />
              <Text style={styles.completeXpPillText}>+{bonusXp} SPEED XP</Text>
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
    </Animated.View>
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

function getQuizScoreColor(percentage: number) {
  if (percentage >= 100) return '#F4B400';
  if (percentage >= 80) return COLORS.greenDark;
  if (percentage >= 60) return COLORS.blue;
  return COLORS.orange;
}
