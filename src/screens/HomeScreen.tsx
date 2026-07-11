import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, Text, View } from 'react-native';
import { COLORS } from '../constants/theme';
import type { AnalyticsData, LegalPage, QuizAnswer, QuizProgress, QuizQuestion, ReminderSettings, SortMode, Word } from '../types';
import { styles } from '../styles';
import { buildAchievements, buildQuiz, calculateStreakStats, formatReminderTime, formatStudyTime, getDayKey, getProgressColor, getProgressPaleColor, getProgressShineOpacity, getRecentDays, getStreakMessage, getStreakMilestone, getStreakWeek, getWordMastery, getWordReviewPriority, shuffle } from '../utils';
import { DashboardSection, DashboardStat, EmptyPractice, HomeAction, HomeMiniCard, LegalLink, LevelRow, QuizComplete, QuizFact, ReminderTimeButton, ScreenHeader, StreakDay, WordInfoPanel, WordRow, SortButton } from '../components';

export function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export function getTodayQuizCount(analytics: AnalyticsData) {
  const today = getDayKey();
  return analytics.quizHistory.filter((attempt) => attempt.date === today).length;
}

export function HomeScreen({
  words,
  analytics,
  reminderSettings,
  dailyQuizGoal,
  onAddWord,
  onStudy,
  onReviewWord,
  onQuiz,
  onStats,
}: {
  words: Word[];
  analytics: AnalyticsData;
  reminderSettings: ReminderSettings;
  dailyQuizGoal: number;
  onAddWord: () => void;
  onStudy: () => void;
  onReviewWord: (wordId: string) => void;
  onQuiz: () => void;
  onStats: () => void;
}) {
  const mastery = words.map((word) => getWordMastery(word, analytics));
  const overallMastery = words.length
    ? Math.round(mastery.reduce((total, score) => total + score, 0) / words.length)
    : 0;
  const strongWords = mastery.filter((score) => score >= 80).length;
  const learningWords = words.length - strongWords;
  const totalQuizQuestions = analytics.quizHistory.reduce(
    (total, attempt) => total + attempt.total,
    0,
  );
  const totalCorrect = analytics.quizHistory.reduce(
    (total, attempt) => total + attempt.score,
    0,
  );
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
  const streakStats = calculateStreakStats(analytics);
  const streakMilestone = getStreakMilestone(streakStats);
  const achievements = buildAchievements({ words, analytics, streakStats });
  const achievementPreview = [
    ...achievements.filter((achievement) => achievement.unlocked),
    ...achievements.filter((achievement) => !achievement.unlocked),
  ].slice(0, 3);
  const todayQuizzes = getTodayQuizCount(analytics);
  const completedDailyQuizzes = Math.min(todayQuizzes, dailyQuizGoal);
  const nextWords = [...words]
    .sort(
      (first, second) =>
        getWordReviewPriority(second, analytics) -
          getWordReviewPriority(first, analytics) ||
        second.createdAt.localeCompare(first.createdAt),
    )
    .slice(0, 2);

  return (
    <View style={styles.homeScreenShell}>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.homeContent}
        showsVerticalScrollIndicator={false}
      >
      <View style={styles.homeHero}>
        <View style={styles.heroCloudOne} />
        <View style={styles.heroCloudTwo} />
        <View style={styles.heroCloudThree} />
        <View style={styles.homeTopRow}>
          <View style={styles.avatarBadge}>
            <Text style={styles.avatarText}>W</Text>
          </View>
          <View style={styles.homeTopActions}>
            <View style={styles.homeStatsPill}>
              <Ionicons name="flame" size={15} color={streakMilestone.color} />
              <Text style={styles.homeStatsPillText}>{streakStats.current}</Text>
              <Ionicons name="school" size={15} color={COLORS.purpleDark} />
              <Text style={styles.homeStatsPillText}>{overallMastery}%</Text>
            </View>
          </View>
        </View>
        <View style={styles.paperPlane}>
          <Ionicons name="paper-plane" size={28} color={COLORS.white} />
        </View>
        <View style={styles.heroGreeting}>
          <Text style={styles.homeTitle}>{getGreeting()}, WordWiz</Text>
          <Text style={styles.homeSubtitle}>
            {words.length === 0
              ? 'Start your first word today.'
              : `${words.length} words saved · ${strongWords} feeling strong`}
          </Text>
        </View>
      </View>

      <View style={styles.homeOverviewCard}>
        <View style={styles.overviewHeader}>
          <Text style={styles.homeSectionTitle}>Today’s learning</Text>
          <View
            accessible
            accessibilityLabel={`${completedDailyQuizzes} of ${dailyQuizGoal} daily quizzes completed`}
            style={styles.overviewDailyGoal}
          >
            <View style={styles.overviewDailyGoalCopy}>
              <Text style={styles.overviewDailyGoalLabel}>DAILY GOAL</Text>
              <Text style={styles.overviewDailyGoalCaption}>
                {dailyQuizGoal === 1 ? 'Quiz' : 'Quizzes'}
              </Text>
            </View>
            <View style={styles.overviewProgressRing}>
              <Text style={styles.overviewProgressText}>
                {completedDailyQuizzes}/{dailyQuizGoal}
              </Text>
            </View>
          </View>
        </View>
        <View style={styles.homeIdeaGrid}>
          <HomeMiniCard
            color={COLORS.bluePale}
            accent={COLORS.blue}
            icon="book-outline"
            title={`${words.length} words`}
            subtitle={`${learningWords} still learning`}
          />
          <HomeMiniCard
            color={COLORS.orangePale}
            accent={COLORS.orange}
            icon="checkmark-circle-outline"
            title={`${accuracy}% quiz`}
            subtitle={`${analytics.quizHistory.length} quizzes done`}
          />
        </View>
        <View style={styles.homeDottedLine} />
        <Pressable
          onPress={words.length > 0 ? onStudy : onAddWord}
          style={({ pressed }) => [
            styles.homePrimaryButton,
            pressed && styles.primaryButtonPressed,
          ]}
        >
          <Text style={styles.homePrimaryButtonText}>
            {words.length > 0 ? 'Start review' : 'Add your first word'}
          </Text>
        </Pressable>
      </View>

      <View style={styles.homeSkillCard}>
        <View style={styles.homeSkillCopy}>
          <Text style={styles.homeSkillTitle}>
            {formatStudyTime(Math.max(totalSeconds, 0))} total learning time
          </Text>
          <Text style={styles.homeSkillSubtitle}>
            Mastery is about {overallMastery}% across your saved words.
          </Text>
          <Text style={[styles.homeSkillBadge, { color: getProgressColor(overallMastery) }]}>
            {streakMilestone.title}
          </Text>
        </View>
        <View style={styles.homeSkillTrack}>
          <View
            style={[
              styles.homeSkillFill,
              {
                width: `${Math.max(overallMastery, words.length ? 6 : 0)}%`,
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
        <Pressable onPress={onStats} style={styles.homeStartButton}>
          <Text style={styles.homeStartButtonText}>Stats</Text>
        </Pressable>
      </View>

      <View style={styles.homeAchievementsCard}>
        <View style={styles.homeAchievementsHeader}>
          <Text style={styles.homeSectionTitle}>Latest achievements</Text>
          <Text style={styles.homeAchievementsCount}>
            {achievements.filter((achievement) => achievement.unlocked).length}/{achievements.length}
          </Text>
        </View>
        <View style={styles.homeAchievementRow}>
          {achievementPreview.map((achievement) => (
            <View
              key={achievement.id}
              style={[
                styles.homeAchievementChip,
                {
                  backgroundColor: achievement.unlocked
                    ? achievement.background
                    : getProgressPaleColor(
                        (achievement.progress / achievement.target) * 100,
                      ),
                },
              ]}
            >
              <Ionicons
                name={achievement.icon}
                size={17}
                color={achievement.unlocked ? achievement.color : COLORS.muted}
              />
              <Text
                numberOfLines={1}
                style={[
                  styles.homeAchievementText,
                  achievement.unlocked && { color: achievement.color },
                ]}
              >
                {achievement.title}
              </Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.homePromptSection}>
        <Text style={styles.homeSectionTitle}>What’s next?</Text>
        <View style={styles.nextActionRow}>
          <HomeAction
            accent={COLORS.teal}
            pale={COLORS.tealPale}
            icon="add"
            label="Add word"
            onPress={onAddWord}
          />
          <HomeAction
            accent={COLORS.purple}
            pale={COLORS.purplePale}
            icon="albums-outline"
            label="Cards"
            onPress={onStudy}
          />
          <HomeAction
            accent={COLORS.orange}
            pale={COLORS.orangePale}
            icon="trophy-outline"
            label="Quiz"
            onPress={onQuiz}
          />
          <HomeAction
            accent={COLORS.blue}
            pale={COLORS.bluePale}
            icon="bar-chart-outline"
            label="Stats"
            onPress={onStats}
          />
        </View>
      </View>

      {nextWords.length > 0 && (
        <View style={styles.nextWordsCard}>
          <Text style={styles.homeSectionTitle}>Words to review</Text>
          {nextWords.map((word) => (
            <Pressable
              key={word.id}
              onPress={() => onReviewWord(word.id)}
              style={({ pressed }) => [
                styles.nextWordRow,
                pressed && styles.pressed,
              ]}
            >
              <View style={styles.nextWordIcon}>
                <Text style={styles.nextWordInitial}>
                  {word.term.charAt(0).toUpperCase()}
                </Text>
              </View>
              <View style={styles.nextWordCopy}>
                <Text style={styles.nextWordTerm}>{word.term}</Text>
                <Text numberOfLines={1} style={styles.nextWordDefinition}>
                  {word.simpleDefinition || word.definition}
                </Text>
              </View>
              <View style={styles.nextWordReason}>
                <Text style={styles.nextWordReasonText}>
                  {getReviewReason(word, analytics)}
                </Text>
              </View>
              <Ionicons
                name="chevron-forward"
                size={18}
                color={COLORS.muted}
              />
            </Pressable>
          ))}
        </View>
      )}

      <View style={styles.homeReminderStrip}>
        <Ionicons
          name={reminderSettings.enabled ? 'notifications' : 'notifications-outline'}
          size={18}
          color={COLORS.blue}
        />
        <Text style={styles.homeReminderText}>
          {reminderSettings.enabled
            ? `Daily reminder set for ${formatReminderTime(reminderSettings)}`
            : 'Daily reminders are off. Turn them on in Stats.'}
        </Text>
      </View>
      </ScrollView>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Quick add word"
        onPress={onAddWord}
        style={({ pressed }) => [
          styles.homeFloatingAddButton,
          pressed && styles.homeFloatingAddButtonPressed,
        ]}
      >
        <View style={styles.homeFloatingAddIcon}>
          <Ionicons name="add" size={24} color={COLORS.white} />
        </View>
        <Text style={styles.homeFloatingAddText}>Add word</Text>
      </Pressable>
    </View>
  );
}

function getReviewReason(word: Word, analytics: AnalyticsData) {
  const missedAnswers = analytics.quizHistory.flatMap((attempt) =>
    attempt.answers.filter(
      (answer) => answer.wordId === word.id && !answer.correct,
    ),
  ).length;
  const forgotCards = analytics.cardHistory.filter(
    (event) => event.wordId === word.id && !event.remembered,
  ).length;

  if (missedAnswers > 0) {
    return `${missedAnswers} missed`;
  }
  if (forgotCards > 0) {
    return `${forgotCards} again`;
  }
  if (word.reviews === 0) {
    return 'New';
  }
  return `${getWordMastery(word, analytics)}%`;
}
