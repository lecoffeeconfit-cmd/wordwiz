import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Image, Pressable, ScrollView, Text, View } from 'react-native';
import { COLORS } from '../constants/theme';
import type { AnalyticsData, LegalPage, QuizAnswer, QuizProgress, QuizQuestion, ReminderSettings, SortMode, Word } from '../types';
import { styles } from '../styles';
import { buildAchievements, buildQuiz, calculateStreakStats, formatReminderTime, formatStudyTime, getDayKey, getProgressColor, getProgressPaleColor, getRecentDays, getStreakMessage, getStreakMilestone, getStreakWeek, getWordMastery, sortWordsForReview, shuffle } from '../utils';
import { CompactPagination, DashboardSection, DashboardStat, EmptyPractice, HomeAction, HomeMiniCard, LegalLink, LevelRow, ProgressFill, QuizComplete, QuizFact, ReminderTimeButton, ScreenHeader, StreakDay, WordInfoPanel, WordRow, SortButton } from '../components';

const EXPANDED_REVIEW_WORD_PAGE_SIZE = 8;

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
  freeTrial,
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
  freeTrial: { daysRemaining: number; expiresAt: string | null } | null;
}) {
  const [achievementCarouselWidth, setAchievementCarouselWidth] = useState(0);
  const [showAllReviewWords, setShowAllReviewWords] = useState(false);
  const [reviewWordPage, setReviewWordPage] = useState(0);
  const lastReviewWordTapAt = useRef(0);
  const reviewWordTapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
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
  const achievementItems = [
    ...achievements.filter((achievement) => achievement.unlocked),
    ...achievements.filter((achievement) => !achievement.unlocked),
  ];
  const achievementPages = useMemo(
    () =>
      Array.from(
        { length: Math.ceil(achievementItems.length / 3) },
        (_, index) => achievementItems.slice(index * 3, index * 3 + 3),
      ),
    [achievementItems],
  );
  const todayQuizzes = getTodayQuizCount(analytics);
  const completedDailyQuizzes = Math.min(todayQuizzes, dailyQuizGoal);
  const homeQuizActionLabel =
    todayQuizzes > 0 ? 'Practice another quiz' : 'Start daily quiz';
  const reviewWords = sortWordsForReview(words, analytics);
  const reviewWordPageCount = Math.max(
    1,
    Math.ceil(reviewWords.length / EXPANDED_REVIEW_WORD_PAGE_SIZE),
  );
  const currentReviewWordPage = Math.min(
    reviewWordPage,
    reviewWordPageCount - 1,
  );
  const nextWords = showAllReviewWords
    ? reviewWords.slice(
        currentReviewWordPage * EXPANDED_REVIEW_WORD_PAGE_SIZE,
        (currentReviewWordPage + 1) * EXPANDED_REVIEW_WORD_PAGE_SIZE,
      )
    : reviewWords.slice(0, 3);

  useEffect(
    () => () => {
      if (reviewWordTapTimer.current) {
        clearTimeout(reviewWordTapTimer.current);
      }
    },
    [],
  );

  function handleReviewWordPress(wordId: string) {
    if (!showAllReviewWords) {
      onReviewWord(wordId);
      return;
    }

    const tappedAt = Date.now();
    if (tappedAt - lastReviewWordTapAt.current < 340) {
      if (reviewWordTapTimer.current) {
        clearTimeout(reviewWordTapTimer.current);
      }
      reviewWordTapTimer.current = null;
      lastReviewWordTapAt.current = 0;
      setShowAllReviewWords(false);
      return;
    }

    lastReviewWordTapAt.current = tappedAt;
    reviewWordTapTimer.current = setTimeout(() => {
      lastReviewWordTapAt.current = 0;
      reviewWordTapTimer.current = null;
      onReviewWord(wordId);
    }, 340);
  }

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
            <Image
              accessibilityLabel="WordWiz logo"
              source={require('../../assets/wordwiz-logo.png')}
              style={styles.avatarLogo}
            />
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
          <Text maxFontSizeMultiplier={1.25} style={styles.homeTitle}>{getGreeting()}, WordWiz</Text>
          <Text maxFontSizeMultiplier={1.2} style={styles.homeSubtitle}>
            {words.length === 0
              ? 'Start your first word today.'
              : `${words.length} words saved · ${strongWords} feeling strong`}
          </Text>
        </View>
      </View>

      {freeTrial ? (
        <View
          accessible
          accessibilityLabel={`Your 30-day WordWiz trial has ${freeTrial.daysRemaining} days left`}
          style={styles.homeTrialCard}
        >
          <View style={styles.homeTrialIcon}>
            <Ionicons name="sparkles" size={19} color={COLORS.purpleDark} />
          </View>
          <View style={styles.homeTrialCopy}>
            <Text style={styles.homeTrialLabel}>30-DAY FREE TRIAL</Text>
            <Text style={styles.homeTrialTitle}>
              {freeTrial.daysRemaining} {freeTrial.daysRemaining === 1 ? 'day' : 'days'} of full access left
            </Text>
            <Text style={styles.homeTrialSubtitle}>
              Enjoy every learning tool — no card required.
            </Text>
          </View>
          <Ionicons name="checkmark-circle" size={19} color={COLORS.purpleDark} />
        </View>
      ) : null}

      <View
        style={[
          styles.homeOverviewCard,
          freeTrial && styles.homeOverviewCardAfterTrial,
        ]}
      >
        <View style={styles.overviewHeader}>
          <Text maxFontSizeMultiplier={1.2} style={styles.homeSectionTitle}>
            Today’s learning
          </Text>
          <View
            accessible
            accessibilityLabel={`${completedDailyQuizzes} of ${dailyQuizGoal} daily quizzes completed`}
            style={styles.overviewDailyGoal}
          >
            <View style={styles.overviewDailyGoalCopy}>
              <Text maxFontSizeMultiplier={1.15} style={styles.overviewDailyGoalLabel}>DAILY GOAL</Text>
              <Text maxFontSizeMultiplier={1.15} style={styles.overviewDailyGoalCaption}>
                {dailyQuizGoal === 1 ? 'Quiz' : 'Quizzes'}
              </Text>
            </View>
            <View style={styles.overviewProgressRing}>
              <Text maxFontSizeMultiplier={1.15} style={styles.overviewProgressText}>
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
          onPress={words.length > 0 ? onQuiz : onAddWord}
          style={({ pressed }) => [
            styles.homePrimaryButton,
            pressed && styles.primaryButtonPressed,
          ]}
        >
          {words.length > 0 && (
            <Ionicons name="trophy-outline" size={19} color={COLORS.white} />
          )}
          <Text style={styles.homePrimaryButtonText}>
            {words.length > 0 ? homeQuizActionLabel : 'Add your first word'}
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
          <ProgressFill
            color={getProgressColor(overallMastery)}
            progress={Math.max(overallMastery, words.length ? 6 : 0)}
            radius={4}
            style={{ width: `${Math.max(overallMastery, words.length ? 6 : 0)}%` }}
          />
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
        <View
          onLayout={(event) => {
            setAchievementCarouselWidth(event.nativeEvent.layout.width);
          }}
          style={styles.homeAchievementCarousel}
        >
          <ScrollView
            horizontal
            pagingEnabled
            nestedScrollEnabled
            showsHorizontalScrollIndicator={false}
            accessibilityLabel="Swipe left or right to view more achievements"
            contentContainerStyle={styles.homeAchievementCarouselContent}
          >
            {achievementPages.map((page, pageIndex) => (
              <View
                key={`achievement-page-${pageIndex}`}
                style={[
                  styles.homeAchievementRow,
                  styles.homeAchievementPage,
                  achievementCarouselWidth > 0 && {
                    width: achievementCarouselWidth,
                  },
                ]}
              >
                {Array.from({ length: 3 }, (_, index) => {
                  const achievement = page[index];
                  if (!achievement) {
                    return (
                      <View
                        key={`achievement-empty-${index}`}
                        style={styles.homeAchievementChipPlaceholder}
                      />
                    );
                  }

                  return (
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
                        color={
                          achievement.unlocked ? achievement.color : COLORS.muted
                        }
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
                      {!achievement.unlocked && (
                        <Text style={styles.homeAchievementProgress}>
                          {achievement.progress}/{achievement.target}
                        </Text>
                      )}
                    </View>
                  );
                })}
              </View>
            ))}
          </ScrollView>
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
          <View style={styles.nextWordsHeader}>
            <Text style={styles.homeSectionTitle}>Words to review</Text>
            {reviewWords.length > 3 && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  showAllReviewWords
                    ? 'Show fewer words to review'
                    : 'Show all words to review'
                }
                onPress={() => {
                  if (showAllReviewWords) {
                    setShowAllReviewWords(false);
                    return;
                  }

                  setReviewWordPage(0);
                  setShowAllReviewWords(true);
                }}
                style={({ pressed }) => [
                  styles.nextWordsToggle,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.nextWordsToggleText}>
                  {showAllReviewWords ? 'Show less' : 'View all'}
                </Text>
                <Ionicons
                  name={showAllReviewWords ? 'chevron-up' : 'chevron-down'}
                  size={14}
                  color={COLORS.purpleDark}
                />
              </Pressable>
            )}
          </View>
          {showAllReviewWords ? (
            <Text style={styles.expandedListHint}>
              Double-tap any word to show fewer
            </Text>
          ) : null}
          {nextWords.map((word) => (
            <Pressable
              key={word.id}
              onPress={() => handleReviewWordPress(word.id)}
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
          {showAllReviewWords && reviewWordPageCount > 1 ? (
            <CompactPagination
              page={currentReviewWordPage}
              pageCount={reviewWordPageCount}
              pageSize={EXPANDED_REVIEW_WORD_PAGE_SIZE}
              total={reviewWords.length}
              itemLabel="words to review"
              onPrevious={() =>
                setReviewWordPage(Math.max(0, currentReviewWordPage - 1))
              }
              onNext={() =>
                setReviewWordPage(
                  Math.min(reviewWordPageCount - 1, currentReviewWordPage + 1),
                )
              }
            />
          ) : null}
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
