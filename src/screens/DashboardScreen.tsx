import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, Text, View } from 'react-native';
import { COLORS } from '../constants/theme';
import type { AnalyticsData, LegalPage, QuizAnswer, QuizProgress, QuizQuestion, ReminderSettings, SortMode, Word } from '../types';
import type { AuthUser } from '../types';
import { styles } from '../styles';
import { buildAchievements, buildQuiz, calculateStreakStats, formatReminderTime, formatStudyTime, getDayKey, getMasteryLevel, getMasteryLevelProgress, getNextMasteryLevel, getProgressColor, getProgressPaleColor, getProgressShineOpacity, getRecentDays, getStreakMessage, getStreakMilestone, getStreakWeek, getWordMastery, shuffle } from '../utils';
import { DashboardSection, DashboardStat, EmptyPractice, HomeAction, HomeMiniCard, LegalLink, LevelRow, QuizComplete, QuizFact, ReminderTimeButton, ScreenHeader, StreakDay, WordInfoPanel, WordRow, SortButton } from '../components';

export function DashboardScreen({
  words,
  analytics,
  currentUser,
  reminderSettings,
  onUpdateReminder,
  onOpenLegal,
  onLogout,
  onDeleteAccount,
}: {
  words: Word[];
  analytics: AnalyticsData;
  currentUser: AuthUser | null;
  reminderSettings: ReminderSettings;
  onUpdateReminder: (settings: ReminderSettings) => void;
  onOpenLegal: (page: LegalPage) => void;
  onLogout: () => void;
  onDeleteAccount: () => void;
}) {
  const recentDays = getRecentDays(7);
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
  const strongWords = mastery.filter((item) => item.score >= 80).length;
  const buildingWords = mastery.filter(
    (item) => item.score >= 40 && item.score < 80,
  ).length;
  const learningWords = Math.max(
    0,
    words.length - strongWords - buildingWords,
  );
  const remainingReviews = mastery.reduce(
    (total, item) =>
      total + (item.score >= 80 ? 0 : Math.ceil((80 - item.score) / 14)),
    0,
  );
  const weeklyActivity = recentDays.map((day) => ({
    ...day,
    value:
      analytics.cardHistory.filter((event) => event.date === day.key).length +
      analytics.quizHistory
        .filter((attempt) => attempt.date === day.key)
        .reduce((total, attempt) => total + attempt.total, 0),
  }));
  const maxActivity = Math.max(1, ...weeklyActivity.map((day) => day.value));
  const recentQuizzes = analytics.quizHistory.slice(-5).reverse();
  const streakStats = calculateStreakStats(analytics);
  const streak = streakStats.current;
  const streakMilestone = getStreakMilestone(streakStats);
  const streakWeek = getStreakWeek(streakStats);
  const achievements = buildAchievements({ words, analytics, streakStats });
  const unlockedAchievements = achievements.filter(
    (achievement) => achievement.unlocked,
  ).length;
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
          <Text style={styles.heroValue}>{overallMastery}%</Text>
          <Text style={styles.heroText}>
            {masteryLevel.encouragement}
          </Text>
          <View style={styles.heroLevelTrack}>
            <View
              style={[
                styles.heroLevelFill,
                {
                  width: `${Math.max(masteryLevelProgress, words.length ? 6 : 0)}%`,
                  backgroundColor: getProgressColor(overallMastery),
                },
              ]}
            >
              <View
                style={[
                  styles.progressShine,
                  { opacity: getProgressShineOpacity(overallMastery) },
                  overallMastery >= 100 && styles.progressShineComplete,
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
        <View style={styles.masteryGauge}>
          <View style={styles.masteryGaugeInner}>
            <Ionicons name="school" size={31} color={COLORS.purpleDark} />
            <Text style={styles.masteryGaugeCount}>
              {strongWords}/{words.length}
            </Text>
            <Text style={styles.masteryGaugeLabel}>STRONG</Text>
          </View>
        </View>
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
            Get a friendly nudge to review words and protect your streak.
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
        title="LAST 7 DAYS"
        badge={`${weeklyActivity.reduce((sum, day) => sum + day.value, 0)} activities`}
      >
        <View style={styles.barChart}>
          {weeklyActivity.map((day) => (
            <View key={day.key} style={styles.barColumn}>
              <Text style={styles.barValue}>
                {day.value > 0 ? day.value : ''}
              </Text>
              <View style={styles.barTrack}>
                <View
                  style={[
                    styles.barFill,
                    {
                      height: `${Math.max(
                        day.value ? 12 : 4,
                        (day.value / maxActivity) * 100,
                      )}%`,
                      backgroundColor: day.key === getDayKey()
                        ? COLORS.green
                        : getProgressColor((day.value / maxActivity) * 100),
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.progressShine,
                      {
                        opacity: getProgressShineOpacity(
                          (day.value / maxActivity) * 100,
                        ),
                      },
                      day.value === maxActivity && styles.progressShineComplete,
                    ]}
                  />
                </View>
              </View>
              <Text
                style={[
                  styles.barLabel,
                  day.key === getDayKey() && styles.barLabelToday,
                ]}
              >
                {day.label}
              </Text>
            </View>
          ))}
        </View>
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
        </View>
      </DashboardSection>

      <View style={styles.dashboardSplit}>
        <View style={styles.accuracyCard}>
          <Text style={styles.dashboardCardLabel}>QUIZ ACCURACY</Text>
          <View style={styles.accuracyGauge}>
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
              color={COLORS.green}
              label="Strong words"
              value={strongWords}
            />
            <LevelRow
              color={COLORS.yellow}
              label="Building words"
              value={buildingWords}
            />
            <LevelRow
              color={COLORS.blue}
              label="Learning words"
              value={learningWords}
            />
          </View>
          <View style={styles.distributionBar}>
            {words.length > 0 && (
              <>
                <View
                  style={{
                    flex: strongWords,
                    backgroundColor: COLORS.green,
                  }}
                />
                <View
                  style={{
                    flex: buildingWords,
                    backgroundColor: COLORS.yellow,
                  }}
                />
                <View
                  style={{
                    flex: learningWords,
                    backgroundColor: COLORS.blue,
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
      </DashboardSection>

      <DashboardSection title="WORD MASTERY" badge={`${words.length} words`}>
        {mastery.length === 0 ? (
          <Text style={styles.dashboardEmptyText}>
            Add your first word to start measuring mastery.
          </Text>
        ) : (
          mastery.slice(0, 5).map((item) => (
            <View key={item.word.id} style={styles.masteryRow}>
              <View style={styles.masteryRowTop}>
                <View style={styles.masteryWordCopy}>
                  <Text style={styles.masteryWord}>{item.word.term}</Text>
                  <Text
                    style={[
                      styles.masteryWordLevel,
                      { color: getMasteryLevel(item.score).color },
                    ]}
                  >
                    {getMasteryLevel(item.score).shortTitle}
                  </Text>
                </View>
                <Text
                  style={[
                    styles.masteryPercent,
                    {
                      color: getProgressColor(item.score),
                    },
                  ]}
                >
                  {item.score}%
                </Text>
              </View>
              <View style={styles.masteryTrack}>
                <View
                  style={[
                    styles.masteryFill,
                    {
                      width: `${Math.max(item.score, 3)}%`,
                      backgroundColor: getProgressColor(item.score),
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.progressShine,
                      { opacity: getProgressShineOpacity(item.score) },
                      item.score >= 100 && styles.progressShineComplete,
                    ]}
                  />
                </View>
              </View>
            </View>
          ))
        )}
      </DashboardSection>

      <DashboardSection title="QUIZ TREND" badge="Recent">
        {recentQuizzes.length === 0 ? (
          <Text style={styles.dashboardEmptyText}>
            Complete a daily quiz and your score trend will appear here.
          </Text>
        ) : (
          recentQuizzes.map((attempt) => {
            const percent = attempt.total
              ? Math.round((attempt.score / attempt.total) * 100)
              : 0;
            return (
              <View key={attempt.id} style={styles.trendRow}>
                <Text style={styles.trendDate}>
                  {new Date(`${attempt.date}T12:00:00`).toLocaleDateString(
                    'en-US',
                    { month: 'short', day: 'numeric' },
                  )}
                </Text>
                <View style={styles.trendTrack}>
                  <View
                    style={[
                      styles.trendFill,
                      {
                        width: `${percent}%`,
                        backgroundColor: getProgressColor(percent),
                      },
                    ]}
                  >
                    <View
                      style={[
                        styles.progressShine,
                        { opacity: getProgressShineOpacity(percent) },
                        percent >= 100 && styles.progressShineComplete,
                      ]}
                    />
                  </View>
                </View>
                <Text style={styles.trendScore}>{percent}%</Text>
              </View>
            );
          })
        )}
      </DashboardSection>

      <View style={styles.insightCard}>
        <View style={styles.insightIcon}>
          <Ionicons name="sparkles" size={23} color={COLORS.purple} />
        </View>
        <View style={styles.insightCopy}>
          <Text style={styles.insightLabel}>WORDWIZ ESTIMATE</Text>
          <Text style={styles.insightTitle}>
            {remainingReviews === 0 && words.length > 0
              ? 'Your words are in great shape'
              : `${remainingReviews} focused reviews to strong`}
          </Text>
          <Text style={styles.insightText}>
            {words.length === 0
              ? 'Add words and practice them to unlock a learning estimate.'
              : remainingReviews === 0
                ? 'Keep using them naturally to help the meanings last.'
                : `That’s roughly ${Math.max(
                    1,
                    Math.ceil((remainingReviews * 20) / 60),
                  )} more minutes of thoughtful practice.`}
          </Text>
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
          role="button"
          accessibilityLabel={`Decrease reminder ${label.toLowerCase()}`}
          onPress={onDecrease}
          style={({ pressed }) => [
            styles.reminderStepperButton,
            pressed && styles.pressed,
          ]}
        >
          <Ionicons name="remove" size={18} color={COLORS.blue} />
        </Pressable>
        <Text style={styles.reminderStepperValue}>{value}</Text>
        <Pressable
          role="button"
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

function formatReminderHour(hour: number) {
  const period = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;

  return `${displayHour} ${period}`;
}

function formatReminderMinute(minute: number) {
  return minute.toString().padStart(2, '0');
}
