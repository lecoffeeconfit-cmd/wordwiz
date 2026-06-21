import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, Text, View } from 'react-native';
import { COLORS } from '../constants/theme';
import type { AnalyticsData, LegalPage, QuizAnswer, QuizProgress, QuizQuestion, ReminderSettings, SortMode, Word } from '../types';
import { styles } from '../styles';
import { buildQuiz, calculateStreakStats, formatReminderTime, formatStudyTime, getDayKey, getRecentDays, getStreakMessage, getStreakWeek, getWordMastery, shuffle } from '../utils';
import { DashboardSection, DashboardStat, EmptyPractice, HomeAction, HomeMiniCard, LegalLink, LevelRow, QuizComplete, QuizFact, ReminderTimeButton, ScreenHeader, StreakDay, WordInfoPanel, WordRow, SortButton } from '../components';

export function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export function getTodayReviewCount(analytics: AnalyticsData) {
  const today = getDayKey();
  return (
    analytics.cardHistory.filter((event) => event.date === today).length +
    analytics.quizHistory
      .filter((attempt) => attempt.date === today)
      .reduce((total, attempt) => total + attempt.total, 0)
  );
}

export function HomeScreen({
  words,
  analytics,
  reminderSettings,
  onAddWord,
  onStudy,
  onQuiz,
  onStats,
}: {
  words: Word[];
  analytics: AnalyticsData;
  reminderSettings: ReminderSettings;
  onAddWord: () => void;
  onStudy: () => void;
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
  const todayReviews = getTodayReviewCount(analytics);
  const nextWords = [...words]
    .sort(
      (first, second) =>
        getWordMastery(first, analytics) - getWordMastery(second, analytics),
    )
    .slice(0, 2);

  return (
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
          <View style={styles.homeStatsPill}>
            <Ionicons name="flame" size={15} color={COLORS.yellow} />
            <Text style={styles.homeStatsPillText}>{streakStats.current}</Text>
            <Ionicons name="school" size={15} color={COLORS.purpleDark} />
            <Text style={styles.homeStatsPillText}>{overallMastery}%</Text>
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
          <View style={styles.overviewProgressRing}>
            <Text style={styles.overviewProgressText}>{Math.min(todayReviews, 5)}/5</Text>
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
            {formatStudyTime(Math.max(totalSeconds, 0))} spent learning
          </Text>
          <Text style={styles.homeSkillSubtitle}>
            Mastery is about {overallMastery}% across your saved words.
          </Text>
        </View>
        <View style={styles.homeSkillTrack}>
          <View
            style={[
              styles.homeSkillFill,
              { width: `${Math.max(overallMastery, words.length ? 6 : 0)}%` },
            ]}
          />
        </View>
        <Pressable onPress={onStats} style={styles.homeStartButton}>
          <Text style={styles.homeStartButtonText}>Stats</Text>
        </Pressable>
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
            <View key={word.id} style={styles.nextWordRow}>
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
              <Text style={styles.nextWordMastery}>
                {getWordMastery(word, analytics)}%
              </Text>
            </View>
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
  );
}
