import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, FlatList, Pressable, ScrollView, Text, View } from 'react-native';
import { COLORS } from '../constants/theme';
import type { AnalyticsData, LegalPage, QuizAnswer, QuizProgress, QuizQuestion, ReminderSettings, SortMode, Word } from '../types';
import type { AuthUser } from '../types';
import { styles } from '../styles';
import { MASTERY_LEVELS, buildAchievements, buildQuiz, calculateStreakStats, formatReminderTime, formatStudyTime, getDayKey, getHeroProgressColor, getMasteryLevel, getMasteryLevelProgress, getNextMasteryLevel, getProgressColor, getProgressPaleColor, getProgressShineOpacity, getQuizAttemptKind, getRecentDays, getStreakMessage, getStreakMilestone, getStreakWeek, getWordMastery, getWordMasteryCategory, shuffle } from '../utils';
import { DashboardSection, DashboardStat, EmptyPractice, HomeAction, HomeMiniCard, LegalLink, LevelRow, QuizComplete, QuizFact, ReminderTimeButton, ScreenHeader, StreakDay, WordInfoPanel, WordRow, SortButton } from '../components';
import { LessonProgressRing } from '../components/dashboard/LessonProgressRing';

export function DashboardScreen({
  words,
  analytics,
  currentUser,
  reminderSettings,
  dailyQuizGoal,
  onUpdateReminder,
  onUpdateDailyQuizGoal,
  onOpenLegal,
  onLogout,
  onDeleteAccount,
}: {
  words: Word[];
  analytics: AnalyticsData;
  currentUser: AuthUser | null;
  reminderSettings: ReminderSettings;
  dailyQuizGoal: number;
  onUpdateReminder: (settings: ReminderSettings) => void;
  onUpdateDailyQuizGoal: (goal: number) => void;
  onOpenLegal: (page: LegalPage) => void;
  onLogout: () => void;
  onDeleteAccount: () => void;
}) {
  const [achievementsExpanded, setAchievementsExpanded] = useState(false);
  const [masteryExpanded, setMasteryExpanded] = useState(false);
  const [quizTrendExpanded, setQuizTrendExpanded] = useState(false);
  const [practiceEstimateExpanded, setPracticeEstimateExpanded] = useState(false);
  const [activityWindow, setActivityWindow] = useState<7 | 30>(7);
  const masterSparkleScale = useRef(new Animated.Value(1)).current;
  const todayKey = getDayKey();
  const recentDays = getRecentDays(activityWindow);
  const totalQuizQuestions = analytics.quizHistory.reduce(
    (total, attempt) => total + attempt.total,
    0,
  );
  const totalCorrect = analytics.quizHistory.reduce(
    (total, attempt) => total + attempt.score,
    0,
  );
  const totalWrong = Math.max(0, totalQuizQuestions - totalCorrect);
  const accuracy = totalQuizQuestions
    ? Math.round((totalCorrect / totalQuizQuestions) * 100)
    : 0;
  const quizAccuracySegments = buildQuizAccuracySegments(
    totalCorrect,
    totalWrong,
  );
  const totalSeconds =
    analytics.quizHistory.reduce(
      (total, attempt) => total + attempt.durationSeconds,
      0,
    ) +
    analytics.cardHistory.reduce(
      (total, event) => total + event.durationSeconds,
      0,
    );
  const mastery = words
    .map((word) => ({
      word,
      score: getWordMastery(word, analytics),
    }))
    .sort((first, second) => second.score - first.score);
  const overallMastery = words.length
    ? Math.round(
        mastery.reduce((total, item) => total + item.score, 0) / words.length,
      )
    : 0;
  const masteryLevel = getMasteryLevel(overallMastery);
  const nextMasteryLevel = getNextMasteryLevel(overallMastery);
  const masteryLevelProgress = getMasteryLevelProgress(overallMastery);
  const masteryRingSegments = buildMasteryRingSegments(
    words.length ? overallMastery : 0,
  );
  const masteredWords = mastery.filter((item) => item.score >= 100).length;
  const strongWords = mastery.filter(
    (item) => item.score >= 80 && item.score < 100,
  ).length;
  const buildingWords = mastery.filter(
    (item) => item.score >= 40 && item.score < 80,
  ).length;
  const learningWords = Math.max(
    0,
    words.length - masteredWords - strongWords - buildingWords,
  );
  const remainingReviews = mastery.reduce(
    (total, item) =>
      total + (item.score >= 80 ? 0 : Math.ceil((80 - item.score) / 14)),
    0,
  );
  const estimatedMinutes = remainingReviews
    ? Math.max(1, Math.ceil((remainingReviews * 20) / 60))
    : 0;
  const typicalQuizSize = Math.max(1, Math.min(words.length, 10));
  const estimatedQuizCount = remainingReviews
    ? Math.max(1, Math.ceil(remainingReviews / typicalQuizSize))
    : 0;
  const weeklyActivity = recentDays.map((day) => {
    const dayCardEvents = analytics.cardHistory.filter(
      (event) => event.date === day.key,
    );
    const dayQuizAttempts = analytics.quizHistory.filter(
      (attempt) => attempt.date === day.key,
    );
    const studySeconds =
      dayCardEvents.reduce(
        (total, event) => total + event.durationSeconds,
        0,
      ) +
      dayQuizAttempts.reduce(
        (total, attempt) => total + attempt.durationSeconds,
        0,
      );
    const quizQuestionCount = dayQuizAttempts.reduce(
      (total, attempt) => total + attempt.total,
      0,
    );
    const activityCount = dayCardEvents.length + quizQuestionCount;

    return {
      ...day,
      activityScore: Math.max(
        activityCount,
        Math.ceil(studySeconds / 60),
      ),
      activityCount,
      quizCount: dayQuizAttempts.length,
      studySeconds,
    };
  });
  const weeklyActivityTotal = weeklyActivity.reduce(
    (total, day) => total + day.activityCount,
    0,
  );
  const maxActivity = Math.max(
    1,
    ...weeklyActivity.map((day) => day.activityScore),
  );
  const recentQuizzes = analytics.quizHistory.slice(0, 5);
  const quizTrendAttempts = quizTrendExpanded
    ? analytics.quizHistory
    : recentQuizzes;
  const streakStats = calculateStreakStats(analytics);
  const streak = streakStats.current;
  const streakMilestone = getStreakMilestone(streakStats);
  const streakWeek = getStreakWeek(streakStats);
  const achievements = buildAchievements({ words, analytics, streakStats });
  const unlockedAchievements = achievements.filter(
    (achievement) => achievement.unlocked,
  ).length;
  const achievementPreview = [
    ...achievements.filter((achievement) => achievement.unlocked),
    ...achievements.filter((achievement) => !achievement.unlocked),
  ].slice(0, 4);
  const reminderTime = formatReminderTime(reminderSettings);
  const updateReminderTime = (hour: number, minute: number) => {
    const nextTime = normalizeReminderTime(hour, minute);
    onUpdateReminder({
      ...reminderSettings,
      enabled: true,
      hour: nextTime.hour,
      minute: nextTime.minute,
    });
  };

  useEffect(() => {
    const sparkleLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(masterSparkleScale, {
          toValue: 1.16,
          duration: 850,
          useNativeDriver: true,
        }),
        Animated.timing(masterSparkleScale, {
          toValue: 1,
          duration: 850,
          useNativeDriver: true,
        }),
      ]),
    );

    sparkleLoop.start();

    return () => sparkleLoop.stop();
  }, [masterSparkleScale]);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.dashboardContent}
      showsVerticalScrollIndicator={false}
    >
      <ScreenHeader
        eyebrow="YOUR PROGRESS"
        title="Learning dashboard"
        subtitle="Small sessions add up. Here’s the story your practice tells."
      />

      <View style={styles.dashboardHero}>
        <View style={styles.heroCopy}>
          <Text style={styles.heroLabel}>ESTIMATED MASTERY</Text>
          <Text style={styles.heroLevelTitle}>{masteryLevel.title}</Text>
          <Text style={styles.heroValue}>{masteryLevelProgress}%</Text>
          <Text style={styles.heroText}>
            {masteryLevel.encouragement}
          </Text>
          <View style={styles.heroLevelTrack}>
            <View
              style={[
                styles.heroLevelFill,
                {
                  width: `${Math.max(masteryLevelProgress, words.length ? 6 : 0)}%`,
                  backgroundColor: getHeroProgressColor(masteryLevelProgress),
                },
              ]}
            >
              <View
                style={[
                  styles.progressShine,
                  { opacity: getProgressShineOpacity(masteryLevelProgress) },
                  masteryLevelProgress >= 100 && styles.progressShineComplete,
                ]}
              />
            </View>
          </View>
          <Text style={styles.heroLevelNext}>
            {nextMasteryLevel
              ? `${nextMasteryLevel.minScore - overallMastery} pts to ${nextMasteryLevel.shortTitle}`
              : 'Top rank reached'}
          </Text>
        </View>
        <LessonProgressRing
          progress={masteryLevelProgress}
          masteryScore={words.length ? overallMastery : 0}
          lessonTitle={`TO ${nextMasteryLevel?.shortTitle.toUpperCase() ?? 'TOP'}`}
        />
      </View>
      <View style={styles.masteryLevelLegend}>
        {masteryRingSegments.map((segment) => (
          <View
            key={segment.shortTitle}
            style={[
              styles.masteryLevelLegendItem,
              segment.isCurrent && styles.masteryLevelLegendItemActive,
            ]}
          >
            <View
              style={[
                styles.masteryLevelLegendDot,
                { backgroundColor: segment.color },
              ]}
            />
            <Text
              style={[
                styles.masteryLevelLegendText,
                segment.isCurrent && styles.masteryLevelLegendTextActive,
              ]}
            >
              {segment.shortTitle}
            </Text>
          </View>
        ))}
      </View>

    <View style={styles.statGrid}>
      <DashboardStat
        icon="time"
        color={COLORS.blue}
        background={COLORS.bluePale}
        value={formatStudyTime(totalSeconds)}
        label="Study time"
      />
      <DashboardStat
        icon="trophy"
        color={COLORS.orange}
        background={COLORS.orangePale}
        value={`${analytics.quizHistory.length}`}
        label="Quizzes"
      />
      <DashboardStat
        icon="close-circle"
        color={COLORS.red}
        background={COLORS.redPale}
        value={`${totalWrong}`}
        label="Missed"
      />
      <DashboardStat
        icon="flame"
        color={COLORS.teal}
        background={COLORS.tealPale}
        value={`${streak}d`}
        label="Streak"
      />
      </View>

      <View style={styles.streakReminderGrid}>
        <View style={styles.streakCard}>
          <View style={styles.streakCardHeader}>
            <View style={styles.streakFlame}>
              <Ionicons name="flame" size={24} color={COLORS.white} />
            </View>
            <View style={styles.streakHeaderCopy}>
              <Text style={styles.streakLabel}>STREAKS</Text>
              <Text style={styles.streakTitle}>{streakMilestone.title}</Text>
            </View>
            <Text style={styles.longestStreak}>
              Best {streakStats.longest}d
            </Text>
          </View>
          <Text style={styles.streakMessage}>
            {getStreakMessage(streakStats)} {streakMilestone.description}
          </Text>
          <View style={styles.streakWeek}>
            {streakWeek.map((day) => (
              <StreakDay key={day.key} day={day} />
            ))}
          </View>
        </View>

        <View style={styles.reminderCard}>
          <View style={styles.reminderHeader}>
            <View style={styles.reminderIcon}>
              <Ionicons
                name="notifications"
                size={22}
                color={COLORS.blue}
              />
            </View>
            <View style={styles.reminderHeaderCopy}>
              <Text style={styles.reminderLabel}>DAILY REMINDER</Text>
              <Text style={styles.reminderTitle}>
                {reminderSettings.enabled ? reminderTime : 'Off'}
              </Text>
            </View>
            <Pressable
              onPress={() =>
                onUpdateReminder({
                  ...reminderSettings,
                  enabled: !reminderSettings.enabled,
                })
              }
              style={[
                styles.reminderSwitch,
                reminderSettings.enabled && styles.reminderSwitchOn,
              ]}
            >
              <View
                style={[
                  styles.reminderSwitchKnob,
                  reminderSettings.enabled && styles.reminderSwitchKnobOn,
                ]}
              />
            </Pressable>
          </View>
          <Text style={styles.reminderText}>
            Smart reminders adapt to your streak, quiz goal, new words, and
            reviews.
          </Text>
          <View style={styles.reminderCustomTime}>
            <View style={styles.reminderCustomHeader}>
              <Text style={styles.reminderCustomLabel}>SET ANY TIME</Text>
              <Text style={styles.reminderCustomValue}>{reminderTime}</Text>
            </View>
            <View style={styles.reminderStepperRow}>
              <ReminderTimeStepper
                label="Hour"
                value={formatReminderHour(reminderSettings.hour)}
                onDecrease={() =>
                  updateReminderTime(
                    reminderSettings.hour - 1,
                    reminderSettings.minute,
                  )
                }
                onIncrease={() =>
                  updateReminderTime(
                    reminderSettings.hour + 1,
                    reminderSettings.minute,
                  )
                }
              />
              <ReminderTimeStepper
                label="Minute"
                value={formatReminderMinute(reminderSettings.minute)}
                onDecrease={() =>
                  updateReminderTime(
                    reminderSettings.hour,
                    reminderSettings.minute - 1,
                  )
                }
                onIncrease={() =>
                  updateReminderTime(
                    reminderSettings.hour,
                    reminderSettings.minute + 1,
                  )
                }
              />
            </View>
          </View>
          <Text style={styles.reminderQuickLabel}>QUICK PICKS</Text>
          <View style={styles.reminderTimes}>
            {[
              { label: '8 AM', hour: 8, minute: 0 },
              { label: '7 PM', hour: 19, minute: 0 },
              { label: '9 PM', hour: 21, minute: 0 },
            ].map((time) => (
              <ReminderTimeButton
                key={time.label}
                label={time.label}
                active={
                  reminderSettings.hour === time.hour &&
                  reminderSettings.minute === time.minute
                }
                onPress={() => updateReminderTime(time.hour, time.minute)}
              />
            ))}
          </View>
        </View>
      </View>

      <DashboardSection
        title={`LAST ${activityWindow} DAYS`}
        badge={`${weeklyActivityTotal} activities`}
      >
        <View style={styles.activityRangeControl}>
          {([7, 30] as const).map((range) => (
            <Pressable
              key={range}
              accessibilityRole="button"
              accessibilityLabel={`Show last ${range} days`}
              accessibilityState={{ selected: activityWindow === range }}
              onPress={() => setActivityWindow(range)}
              style={[
                styles.activityRangeButton,
                activityWindow === range && styles.activityRangeButtonActive,
              ]}
            >
              <Text
                style={[
                  styles.activityRangeButtonText,
                  activityWindow === range &&
                    styles.activityRangeButtonTextActive,
                ]}
              >
                {range}D
              </Text>
            </Pressable>
          ))}
        </View>

        {activityWindow === 30 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={[styles.barChart, styles.barChartWide]}
          >
            {weeklyActivity.map((day) => {
              const isActive = day.activityCount > 0 || day.studySeconds > 0;
              const isToday = day.key === todayKey;
              const quizShare = day.quizCount
                ? Math.max(
                    22,
                    Math.min(
                      58,
                      (day.quizCount / Math.max(1, day.activityCount)) * 100,
                    ),
                  )
                : 0;

              return (
                <View
                  key={day.key}
                  style={[styles.barColumn, styles.barColumnCompact]}
                >
                  <Text style={styles.barValue}>
                    {isActive ? formatStudyTime(day.studySeconds) : ''}
                  </Text>
                  <View style={styles.barTrack}>
                    <View
                      style={[
                        styles.barFill,
                        {
                          height: `${Math.max(
                            isActive ? 12 : 18,
                            (day.activityScore / maxActivity) * 100,
                          )}%`,
                          backgroundColor: isToday
                            ? COLORS.green
                            : isActive
                              ? COLORS.blue
                              : COLORS.blue,
                        },
                      ]}
                    >
                      {quizShare ? (
                        <View
                          style={[
                            styles.barQuizSegment,
                            { height: `${quizShare}%` },
                          ]}
                        />
                      ) : null}
                      {isActive ? (
                        <View
                          style={[
                            styles.progressShine,
                            {
                              opacity: getProgressShineOpacity(
                                (day.activityScore / maxActivity) * 100,
                              ),
                            },
                            day.activityScore === maxActivity &&
                              styles.progressShineComplete,
                          ]}
                        />
                      ) : null}
                    </View>
                  </View>
                  <Text
                    style={[
                      styles.barLabel,
                      isToday && styles.barLabelToday,
                    ]}
                  >
                    {new Date(`${day.key}T12:00:00`).getDate()}
                  </Text>
                  <Text style={styles.practiceBarQuizText}>
                    {isActive ? `${day.quizCount}q` : ''}
                  </Text>
                </View>
              );
            })}
          </ScrollView>
        ) : (
          <View style={styles.barChart}>
            {weeklyActivity.map((day) => {
              const isActive = day.activityCount > 0 || day.studySeconds > 0;
              const isToday = day.key === todayKey;
              const quizShare = day.quizCount
                ? Math.max(
                    22,
                    Math.min(
                      58,
                      (day.quizCount / Math.max(1, day.activityCount)) * 100,
                    ),
                  )
                : 0;

              return (
                <View key={day.key} style={styles.barColumn}>
                  <Text style={styles.barValue}>
                    {isActive ? formatStudyTime(day.studySeconds) : ''}
                  </Text>
                  <View style={styles.barTrack}>
                    <View
                      style={[
                        styles.barFill,
                        {
                          height: `${Math.max(
                            isActive ? 12 : 18,
                            (day.activityScore / maxActivity) * 100,
                          )}%`,
                          backgroundColor: isToday
                            ? COLORS.green
                            : isActive
                              ? COLORS.blue
                              : COLORS.blue,
                        },
                      ]}
                    >
                      {quizShare ? (
                        <View
                          style={[
                            styles.barQuizSegment,
                            { height: `${quizShare}%` },
                          ]}
                        />
                      ) : null}
                      {isActive ? (
                        <View
                          style={[
                            styles.progressShine,
                            {
                              opacity: getProgressShineOpacity(
                                (day.activityScore / maxActivity) * 100,
                              ),
                            },
                            day.activityScore === maxActivity &&
                              styles.progressShineComplete,
                          ]}
                        />
                      ) : null}
                    </View>
                  </View>
                  <Text
                    style={[
                      styles.barLabel,
                      isToday && styles.barLabelToday,
                    ]}
                  >
                    {day.label}
                  </Text>
                  <Text style={styles.practiceBarQuizText}>
                    {isActive ? `${day.quizCount}q` : ''}
                  </Text>
                </View>
              );
            })}
          </View>
        )}
        <View style={styles.chartLegendRow}>
          <View style={styles.chartLegendItem}>
            <View
              style={[styles.legendDot, { backgroundColor: COLORS.blue }]}
            />
            <Text style={styles.chartLegendText}>Past days</Text>
          </View>
          <View style={styles.chartLegendItem}>
            <View
              style={[styles.legendDot, { backgroundColor: COLORS.green }]}
            />
            <Text style={styles.chartLegendText}>Today</Text>
          </View>
          <View style={styles.chartLegendItem}>
            <View
              style={[styles.legendDot, { backgroundColor: COLORS.yellow }]}
            />
            <Text style={styles.chartLegendText}>Quizzes</Text>
          </View>
        </View>
      </DashboardSection>

      <View style={styles.dashboardSplit}>
        <View style={styles.accuracyCard}>
          <Text style={styles.dashboardCardLabel}>QUIZ ACCURACY</Text>
          <View style={styles.accuracyGauge}>
            <View style={styles.accuracyGaugeRing}>
              {quizAccuracySegments.map((segment) => (
                <View
                  key={segment.key}
                  style={[
                    styles.accuracyGaugeSegment,
                    {
                      backgroundColor: segment.color,
                      transform: [
                        { rotate: `${segment.angle}deg` },
                        { translateY: -50 },
                      ],
                    },
                  ]}
                />
              ))}
            </View>
            <View style={styles.accuracyGaugeInner}>
              <Text style={styles.accuracyValue}>{accuracy}%</Text>
              <Text style={styles.accuracyLabel}>CORRECT</Text>
            </View>
          </View>
          <Text style={styles.accuracyDetail}>
            {totalCorrect} right · {totalWrong} missed
          </Text>
        </View>

        <View style={styles.distributionCard}>
          <Text style={styles.dashboardCardLabel}>WORD LEVELS</Text>
          <View style={styles.levelStack}>
            <LevelRow
              color={getWordMasteryCategory(100).color}
              label="Proficient words"
              value={masteredWords}
              sparkly
            />
            <LevelRow
              color={getWordMasteryCategory(80).color}
              label="Strong words"
              value={strongWords}
            />
            <LevelRow
              color={getWordMasteryCategory(40).color}
              label="Building words"
              value={buildingWords}
            />
            <LevelRow
              color={getWordMasteryCategory(0).color}
              label="Learning words"
              value={learningWords}
            />
          </View>
          <View style={styles.distributionBar}>
            {words.length > 0 && (
              <>
                {masteredWords > 0 ? (
                  <View
                    style={[
                      styles.distributionSegment,
                      styles.distributionMasteredSegment,
                      {
                        flex: masteredWords,
                        backgroundColor: getWordMasteryCategory(100).color,
                      },
                    ]}
                  >
                    <View style={styles.distributionShine} />
                    <Ionicons
                      name="sparkles"
                      size={10}
                      color={COLORS.white}
                      style={styles.distributionSparkle}
                    />
                  </View>
                ) : null}
                <View
                  style={{
                    flex: strongWords,
                    backgroundColor: getWordMasteryCategory(80).color,
                  }}
                />
                <View
                  style={{
                    flex: buildingWords,
                    backgroundColor: getWordMasteryCategory(40).color,
                  }}
                />
                <View
                  style={{
                    flex: learningWords,
                    backgroundColor: getWordMasteryCategory(0).color,
                  }}
                />
              </>
            )}
          </View>
        </View>
      </View>

      <DashboardSection
        title="ACHIEVEMENTS"
        badge={`${unlockedAchievements}/${achievements.length} unlocked`}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            achievementsExpanded
              ? 'Collapse achievements'
              : 'Expand achievements'
          }
          accessibilityState={{ expanded: achievementsExpanded }}
          onPress={() => setAchievementsExpanded((expanded) => !expanded)}
          style={({ pressed }) => [
            styles.achievementSummary,
            pressed && styles.pressed,
          ]}
        >
          <View style={styles.achievementSummaryIcons}>
            {achievementPreview.map((achievement) => (
              <View
                key={achievement.id}
                style={[
                  styles.achievementSummaryIcon,
                  {
                    backgroundColor: achievement.unlocked
                      ? achievement.background
                      : COLORS.bluePale,
                  },
                ]}
              >
                <Ionicons
                  name={achievement.icon}
                  size={16}
                  color={achievement.unlocked ? achievement.color : COLORS.muted}
                />
              </View>
            ))}
          </View>
          <View style={styles.achievementSummaryCopy}>
            <Text style={styles.achievementSummaryTitle}>
              {achievementsExpanded ? 'Hide achievement details' : 'View achievement details'}
            </Text>
            <Text style={styles.achievementSummaryText}>
              {unlockedAchievements} unlocked · {achievements.length - unlockedAchievements} still waiting
            </Text>
          </View>
          <Ionicons
            name={achievementsExpanded ? 'chevron-up' : 'chevron-down'}
            size={19}
            color={COLORS.muted}
          />
        </Pressable>

        {achievementsExpanded ? (
          <View style={styles.achievementGrid}>
            {achievements.map((achievement) => {
            const percent = Math.round(
              (achievement.progress / achievement.target) * 100,
            );
            const fillColor = achievement.unlocked
              ? achievement.color
              : getProgressColor(percent);

            return (
              <View
                key={achievement.id}
                style={[
                  styles.achievementCard,
                  {
                    backgroundColor: achievement.unlocked
                      ? achievement.background
                      : getProgressPaleColor(percent),
                  },
                ]}
              >
                <View style={styles.achievementHeader}>
                  <View
                    style={[
                      styles.achievementIcon,
                      { backgroundColor: achievement.unlocked ? COLORS.white : COLORS.surface },
                    ]}
                  >
                    <Ionicons
                      name={achievement.icon}
                      size={18}
                      color={achievement.unlocked ? achievement.color : COLORS.muted}
                    />
                  </View>
                  <Text
                    style={[
                      styles.achievementStatus,
                      { color: achievement.unlocked ? achievement.color : COLORS.muted },
                    ]}
                  >
                    {achievement.unlocked ? 'DONE' : `${achievement.progress}/${achievement.target}`}
                  </Text>
                </View>
                <Text style={styles.achievementTitle}>{achievement.title}</Text>
                <Text style={styles.achievementText}>
                  {achievement.description}
                </Text>
                <View style={styles.achievementTrack}>
                  <View
                    style={[
                      styles.achievementFill,
                      {
                        width: `${Math.max(percent, achievement.progress ? 8 : 0)}%`,
                        backgroundColor: fillColor,
                      },
                    ]}
                  >
                    <View
                      style={[
                        styles.progressShine,
                        { opacity: getProgressShineOpacity(percent) },
                        achievement.unlocked && styles.progressShineComplete,
                      ]}
                    />
                  </View>
                </View>
              </View>
            );
          })}
          </View>
        ) : null}
      </DashboardSection>

      <DashboardSection title="WORD MASTERY" badge={`${words.length} words`}>
        {mastery.length === 0 ? (
          <Text style={styles.dashboardEmptyText}>
            Add your first word to start measuring mastery.
          </Text>
        ) : (
          <>
            {(masteryExpanded ? mastery : mastery.slice(0, 5)).map((item) => {
              const wordCategory = getWordMasteryCategory(item.score);
              const isMasterWord = item.score >= 100;

              return (
                <View
                  key={item.word.id}
                  style={[
                    styles.masteryRow,
                    isMasterWord && styles.masteryRowComplete,
                  ]}
                >
                  <View style={styles.masteryRowTop}>
                    <View style={styles.masteryWordCopy}>
                      <Text style={styles.masteryWord}>{item.word.term}</Text>
                      <Text
                        style={[
                          styles.masteryWordLevel,
                          { color: wordCategory.color },
                        ]}
                      >
                        {getMasteryLevel(item.score).shortTitle}
                      </Text>
                    </View>
                    <View style={styles.masteryPercentRow}>
                      {isMasterWord ? (
                        <Animated.View
                          style={[
                            styles.masteryCompleteSparkle,
                            {
                              transform: [{ scale: masterSparkleScale }],
                            },
                          ]}
                        >
                          <Ionicons
                            name="sparkles"
                            size={15}
                            color={wordCategory.color}
                          />
                        </Animated.View>
                      ) : null}
                      <Text
                        style={[
                          styles.masteryPercent,
                          {
                            color: wordCategory.color,
                          },
                        ]}
                      >
                        {item.score}%
                      </Text>
                    </View>
                  </View>
                  <View
                    style={[
                      styles.masteryTrack,
                      isMasterWord && { backgroundColor: wordCategory.pale },
                    ]}
                  >
                    <View
                      style={[
                        styles.masteryFill,
                        {
                          width: `${Math.max(item.score, 3)}%`,
                          backgroundColor: wordCategory.color,
                        },
                      ]}
                    >
                      <View
                        style={[
                          styles.progressShine,
                          { opacity: getProgressShineOpacity(item.score) },
                          isMasterWord && styles.progressShineComplete,
                        ]}
                      />
                    </View>
                  </View>
                </View>
              );
            })}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                masteryExpanded
                  ? 'Show fewer word mastery rows'
                  : 'Show all word mastery rows'
              }
              accessibilityState={{ expanded: masteryExpanded }}
              onPress={() => setMasteryExpanded((expanded) => !expanded)}
              style={({ pressed }) => [
                styles.masterySummary,
                pressed && styles.pressed,
              ]}
            >
              <View style={styles.masterySummaryCopy}>
                <Text style={styles.masterySummaryTitle}>
                  {masteryExpanded ? 'Showing all words' : 'Showing top words'}
                </Text>
                <Text style={styles.masterySummaryText}>
                  {masteredWords} proficient · {strongWords} strong · {buildingWords} building
                </Text>
              </View>
              <Text style={styles.masterySummaryAction}>
                {masteryExpanded ? 'Collapse' : 'View all'}
              </Text>
              <Ionicons
                name={masteryExpanded ? 'chevron-up' : 'chevron-down'}
                size={18}
                color={COLORS.muted}
              />
            </Pressable>
          </>
        )}
      </DashboardSection>

      <DashboardSection title="QUIZ TREND" badge="Recent">
        {recentQuizzes.length === 0 ? (
          <Text style={styles.dashboardEmptyText}>
            Complete a daily quiz and your progress will appear here.
          </Text>
        ) : (
          <>
            {quizTrendAttempts.map((attempt) => {
            const percent = attempt.total
              ? Math.round((attempt.score / attempt.total) * 100)
              : 0;
            const dateLabel = new Date(`${attempt.date}T12:00:00`).toLocaleDateString(
              'en-US',
              { month: 'short', day: 'numeric' },
            );
            const quizKind = getQuizAttemptKind(attempt, analytics.quizHistory);
            const isPracticeQuiz = quizKind === 'practice';
            const trendLabel = isPracticeQuiz ? 'Practice quiz' : 'Daily quiz';
            const status =
              percent >= 80 ? 'Strong' : percent >= 50 ? 'Building' : 'Needs review';
            const tone = getQuizTrendTone(percent);
            return (
              <View
                key={attempt.id}
                style={[
                  styles.trendRow,
                  {
                    backgroundColor: tone.surface,
                    borderColor: tone.border,
                  },
                ]}
              >
                <View style={styles.trendRowHeader}>
                  <View style={styles.trendLabelCopy}>
                    <View style={styles.trendTitleRow}>
                      <Ionicons
                        name={isPracticeQuiz ? 'sparkles' : 'checkmark-circle'}
                        size={14}
                        color={isPracticeQuiz ? COLORS.purple : COLORS.greenDark}
                      />
                      <Text style={styles.trendTitle}>{trendLabel}</Text>
                    </View>
                    <Text style={styles.trendDate}>{dateLabel}</Text>
                  </View>
                  <Text
                    style={[
                      styles.trendScore,
                      {
                        color: tone.scoreText,
                        backgroundColor: tone.scoreBackground,
                      },
                    ]}
                  >
                    {attempt.score}/{attempt.total} correct
                  </Text>
                </View>
                <View
                  style={[
                    styles.trendTrack,
                    { backgroundColor: tone.track },
                  ]}
                >
                  <View
                    style={[
                      styles.trendFill,
                      {
                        width: `${percent}%`,
                        backgroundColor: tone.fill,
                      },
                    ]}
                  >
                    {percent >= 80 ? (
                      <View pointerEvents="none" style={styles.trendSparkleCluster}>
                        <View style={styles.trendSparkleLarge} />
                        <View style={styles.trendSparkleSmall} />
                        <View style={styles.trendGlint} />
                      </View>
                    ) : null}
                  </View>
                </View>
                <View style={styles.trendFooter}>
                  <Text
                    style={[
                      styles.trendStatus,
                      { color: tone.status },
                    ]}
                  >
                    {status}
                  </Text>
                  <Text style={[styles.trendPercent, { color: tone.percent }]}>
                    {percent}%
                  </Text>
                </View>
              </View>
            );
            })}
            {analytics.quizHistory.length > recentQuizzes.length ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  quizTrendExpanded
                    ? 'Show recent quiz history'
                    : 'View all quiz history'
                }
                onPress={() => setQuizTrendExpanded((expanded) => !expanded)}
                style={({ pressed }) => [
                  styles.trendHistoryToggle,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.trendHistoryToggleText}>
                  {quizTrendExpanded
                    ? 'Show recent quizzes'
                    : `View all ${analytics.quizHistory.length} quizzes`}
                </Text>
                <Ionicons
                  name={quizTrendExpanded ? 'chevron-up' : 'chevron-down'}
                  size={16}
                  color={COLORS.purpleDark}
                />
              </Pressable>
            ) : null}
          </>
        )}
      </DashboardSection>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Practice estimate details"
        accessibilityHint="Shows the reviews, quizzes, and study time behind this estimate"
        accessibilityState={{ expanded: practiceEstimateExpanded }}
        onPress={() => setPracticeEstimateExpanded((expanded) => !expanded)}
        style={({ pressed }) => [styles.insightCard, pressed && styles.pressed]}
      >
        <View style={styles.insightHeader}>
          <View style={styles.insightIcon}>
            <Ionicons name="sparkles" size={23} color={COLORS.purple} />
          </View>
          <View style={styles.insightCopy}>
            <Text style={styles.insightLabel}>PRACTICE ESTIMATE</Text>
            <Text style={styles.insightTitle}>
              {remainingReviews === 0 && words.length > 0
                ? 'Your words are in great shape'
                : `${remainingReviews} reviews to Word Mastery`}
            </Text>
            <Text style={styles.insightText}>
              {words.length === 0
                ? 'Add words and practice them to unlock a learning estimate.'
                : remainingReviews === 0
                  ? 'Keep using them naturally to help the meanings last.'
                  : `About ${estimatedMinutes} more minutes to move your saved words into the strong zone.`}
            </Text>
          </View>
          <View style={styles.insightChevron}>
            <Ionicons
              name={practiceEstimateExpanded ? 'chevron-up' : 'chevron-down'}
              size={18}
              color={COLORS.purpleDark}
            />
          </View>
        </View>
        {practiceEstimateExpanded && words.length > 0 ? (
          <View style={styles.insightDetails}>
            <PracticeEstimateDetail
              icon="layers-outline"
              title={`${remainingReviews} review${remainingReviews === 1 ? '' : 's'} left`}
              text="Short, repeated recall sessions move words toward the strong zone."
            />
            <PracticeEstimateDetail
              icon="help-circle-outline"
              title={`About ${estimatedQuizCount} ${estimatedQuizCount === 1 ? 'quiz' : 'quizzes'}`}
              text={`Based on quizzes of about ${typicalQuizSize} ${typicalQuizSize === 1 ? 'word' : 'words'} each.`}
            />
            <PracticeEstimateDetail
              icon="time-outline"
              title={`About ${estimatedMinutes} ${estimatedMinutes === 1 ? 'minute' : 'minutes'}`}
              text="Estimated at roughly 20 seconds per review."
            />
          </View>
        ) : null}
      </Pressable>

      <View style={styles.dailyGoalCard}>
        <View style={styles.dailyGoalHeader}>
          <View style={styles.dailyGoalIcon}>
            <Ionicons name="trophy-outline" size={23} color={COLORS.teal} />
          </View>
          <View style={styles.dailyGoalCopy}>
            <Text style={styles.dailyGoalLabel}>DAILY PRACTICE</Text>
            <Text style={styles.dailyGoalTitle}>Quiz goal</Text>
          </View>
          <View style={styles.dailyGoalBadge}>
            <Text style={styles.dailyGoalBadgeText}>
              {dailyQuizGoal} {dailyQuizGoal === 1 ? 'quiz' : 'quizzes'}
            </Text>
          </View>
        </View>
        <Text style={styles.dailyGoalText}>
          Choose how many quizzes you want to complete each day. Every finished
          quiz counts, even when it has fewer than ten questions.
        </Text>
        <View style={styles.dailyGoalStepper}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Decrease daily quiz goal"
            accessibilityState={{ disabled: dailyQuizGoal <= 1 }}
            disabled={dailyQuizGoal <= 1}
            onPress={() => onUpdateDailyQuizGoal(dailyQuizGoal - 1)}
            style={({ pressed }) => [
              styles.dailyGoalStepButton,
              dailyQuizGoal <= 1 && styles.dailyGoalStepButtonDisabled,
              pressed && dailyQuizGoal > 1 && styles.pressed,
            ]}
          >
            <Ionicons name="remove" size={21} color={COLORS.teal} />
          </Pressable>
          <View style={styles.dailyGoalValue}>
            <Text style={styles.dailyGoalNumber}>{dailyQuizGoal}</Text>
            <Text style={styles.dailyGoalUnit}>
              {dailyQuizGoal === 1 ? 'QUIZ PER DAY' : 'QUIZZES PER DAY'}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Increase daily quiz goal"
            accessibilityState={{ disabled: dailyQuizGoal >= 5 }}
            disabled={dailyQuizGoal >= 5}
            onPress={() => onUpdateDailyQuizGoal(dailyQuizGoal + 1)}
            style={({ pressed }) => [
              styles.dailyGoalStepButton,
              dailyQuizGoal >= 5 && styles.dailyGoalStepButtonDisabled,
              pressed && dailyQuizGoal < 5 && styles.pressed,
            ]}
          >
            <Ionicons name="add" size={21} color={COLORS.teal} />
          </Pressable>
        </View>
      </View>

      <View style={styles.accountCard}>
        <View style={styles.accountAvatar}>
          <Text style={styles.accountAvatarText}>
            {(currentUser?.name || 'W').charAt(0).toUpperCase()}
          </Text>
        </View>
        <View style={styles.accountCopy}>
          <Text style={styles.accountLabel}>ACCOUNT</Text>
          <Text style={styles.accountName}>
            {currentUser?.name || 'WordWiz learner'}
          </Text>
          <Text style={styles.accountEmail}>
            {currentUser?.email || 'Local prototype account'}
          </Text>
        </View>
        <Pressable
          onPress={onLogout}
          style={({ pressed }) => [
            styles.logoutButton,
            pressed && styles.pressed,
          ]}
        >
          <Ionicons name="log-out-outline" size={18} color={COLORS.red} />
          <Text style={styles.logoutButtonText}>Log out</Text>
        </Pressable>
      </View>

      <View style={styles.deleteAccountCard}>
        <View style={styles.deleteAccountIcon}>
          <Ionicons name="trash-outline" size={22} color={COLORS.red} />
        </View>
        <View style={styles.deleteAccountCopy}>
          <Text style={styles.deleteAccountLabel}>ACCOUNT CONTROL</Text>
          <Text style={styles.deleteAccountTitle}>Delete account</Text>
          <Text style={styles.deleteAccountText}>
            Permanently remove your WordWiz account and cloud learning data.
            This action cannot be undone.
          </Text>
        </View>
        <Pressable
          onPress={onDeleteAccount}
          style={({ pressed }) => [
            styles.deleteAccountButton,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.deleteAccountButtonText}>Delete</Text>
        </Pressable>
      </View>

      <View style={styles.legalCard}>
        <View style={styles.legalHeaderIcon}>
          <Ionicons name="shield-checkmark-outline" size={22} color={COLORS.blue} />
        </View>
        <View style={styles.legalCardCopy}>
          <Text style={styles.legalCardTitle}>About & legal</Text>
          <Text style={styles.legalCardText}>
            Read how WordWiz works and how your learning data is handled.
          </Text>
        </View>
        <View style={styles.legalLinkStack}>
          <LegalLink label="Terms" onPress={() => onOpenLegal('terms')} />
          <LegalLink label="Privacy" onPress={() => onOpenLegal('privacy')} />
        </View>
      </View>

      <Text style={styles.estimateNote}>
        Mastery is an estimate based on flashcard answers, quiz results, and
        repeated reviews. It is not a scientific assessment.
      </Text>
    </ScrollView>
  );
}

function PracticeEstimateDetail({
  icon,
  title,
  text,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  text: string;
}) {
  return (
    <View style={styles.insightDetailRow}>
      <View style={styles.insightDetailIcon}>
        <Ionicons name={icon} size={15} color={COLORS.purpleDark} />
      </View>
      <View style={styles.insightDetailCopy}>
        <Text style={styles.insightDetailTitle}>{title}</Text>
        <Text style={styles.insightDetailText}>{text}</Text>
      </View>
    </View>
  );
}

function ReminderTimeStepper({
  label,
  value,
  onDecrease,
  onIncrease,
}: {
  label: string;
  value: string;
  onDecrease: () => void;
  onIncrease: () => void;
}) {
  return (
    <View style={styles.reminderTimeUnit}>
      <Text style={styles.reminderTimeUnitLabel}>{label}</Text>
      <View style={styles.reminderStepperControls}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Decrease reminder ${label.toLowerCase()}`}
          onPress={onDecrease}
          style={({ pressed }) => [
            styles.reminderStepperButton,
            pressed && styles.pressed,
          ]}
        >
          <Ionicons name="remove" size={18} color={COLORS.blue} />
        </Pressable>
        {label === 'Hour' ? (
          <View style={styles.reminderHourValue}>
            {value.split(' ').map((part) => (
              <Text key={part} style={styles.reminderStepperValue}>
                {part}
              </Text>
            ))}
          </View>
        ) : (
          <Text style={styles.reminderStepperValue}>{value}</Text>
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Increase reminder ${label.toLowerCase()}`}
          onPress={onIncrease}
          style={({ pressed }) => [
            styles.reminderStepperButton,
            pressed && styles.pressed,
          ]}
        >
          <Ionicons name="add" size={18} color={COLORS.blue} />
        </Pressable>
      </View>
    </View>
  );
}

function normalizeReminderTime(hour: number, minute: number) {
  const minutesInDay = 24 * 60;
  const totalMinutes =
    ((hour * 60 + minute) % minutesInDay + minutesInDay) % minutesInDay;

  return {
    hour: Math.floor(totalMinutes / 60),
    minute: totalMinutes % 60,
  };
}

function buildMasteryRingSegments(score: number) {
  return MASTERY_LEVELS.map((level, index) => {
    const nextLevel = MASTERY_LEVELS[index + 1];
    const startScore = level.minScore;
    const endScore = nextLevel?.minScore ?? 100;
    const scoreSpan = endScore - startScore;
    const midScore = startScore + scoreSpan / 2;
    const segmentProgress =
      score >= endScore
        ? 1
        : score <= startScore
          ? 0
          : (score - startScore) / scoreSpan;

    return {
      shortTitle: level.shortTitle,
      color: level.color,
      angle: (midScore / 100) * 360,
      fillPercent: Math.round(segmentProgress * 100),
      isCurrent: score >= startScore && score < endScore,
    };
  });
}

function getQuizTrendTone(percent: number) {
  if (percent >= 100) {
    return {
      fill: '#F4B400',
      status: '#D89F00',
      percent: COLORS.muted,
      scoreText: COLORS.blue,
      scoreBackground: COLORS.bluePale,
      surface: '#FFFCFF',
      border: '#E8DEFA',
      track: '#F8E29A',
    };
  }

  if (percent >= 80) {
    return {
      fill: COLORS.teal,
      status: COLORS.teal,
      percent: COLORS.muted,
      scoreText: COLORS.blue,
      scoreBackground: COLORS.bluePale,
      surface: '#FFFCFF',
      border: '#E8DEFA',
      track: '#EFEAF8',
    };
  }

  if (percent >= 40) {
    return {
      fill: COLORS.purple,
      status: COLORS.purple,
      percent: COLORS.muted,
      scoreText: COLORS.blue,
      scoreBackground: COLORS.bluePale,
      surface: '#FFFCFF',
      border: '#E8DEFA',
      track: '#EFEAF8',
    };
  }

  return {
    fill: COLORS.blue,
    status: COLORS.blue,
    percent: COLORS.muted,
    scoreText: COLORS.blue,
    scoreBackground: COLORS.bluePale,
    surface: '#FFFCFF',
    border: '#E8DEFA',
    track: '#EFEAF8',
  };
}

function buildQuizAccuracySegments(correct: number, missed: number) {
  const segmentCount = 100;
  const total = correct + missed;
  const correctSegments = total
    ? Math.round((correct / total) * segmentCount)
    : 0;

  return Array.from({ length: segmentCount }, (_, index) => ({
    key: `accuracy-${index}`,
    angle: (index / segmentCount) * 360,
    color:
      total === 0
        ? '#EDE8F7'
        : index < correctSegments
          ? COLORS.teal
          : COLORS.red,
  }));
}

function formatReminderHour(hour: number) {
  const period = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;

  return `${displayHour} ${period}`;
}

function formatReminderMinute(minute: number) {
  return minute.toString().padStart(2, '0');
}
