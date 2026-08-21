import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, FlatList, Image, Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { COLORS } from '../constants/theme';
import type { AnalyticsData, LegalPage, QuizAnswer, QuizProgress, QuizQuestion, ReminderSettings, SortMode, Word } from '../types';
import { styles } from '../styles';
import { buildAchievements, buildQuiz, calculateStreakStats, formatReminderTime, formatStudyTime, getDayKey, getDueReviewWords, getProgressColor, getProgressPaleColor, getRecentDays, getStreakMessage, getStreakMilestone, getStreakWeek, getWordMastery, sortWordsForReview, shuffle } from '../utils';
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
  onReviewDue,
  onQuiz,
  onOmegaTest,
  onStats,
  onOpenPlus,
  complimentaryAccess,
  showFreePlanNotice,
}: {
  words: Word[];
  analytics: AnalyticsData;
  reminderSettings: ReminderSettings;
  dailyQuizGoal: number;
  onAddWord: () => void;
  onStudy: () => void;
  onReviewWord: (wordId: string) => void;
  onReviewDue: () => void;
  onQuiz: () => void;
  onOmegaTest: () => void;
  onStats: () => void;
  onOpenPlus: () => void;
  complimentaryAccess: { daysRemaining: number; expiresAt: string | null } | null;
  showFreePlanNotice: boolean;
}) {
  const { height: windowHeight } = useWindowDimensions();
  const heroAddedHeight = Math.max(12, Math.min(18, Math.round(windowHeight * 0.018)));
  const heroBrandGap = Math.max(4, Math.min(6, Math.round(heroAddedHeight / 3)));
  const heroBottomBreathingRoom = heroAddedHeight - heroBrandGap;
  const [achievementCarouselWidth, setAchievementCarouselWidth] = useState(0);
  const [showAllReviewWords, setShowAllReviewWords] = useState(false);
  const [reviewWordPage, setReviewWordPage] = useState(0);
  const [showContextQuickAction, setShowContextQuickAction] = useState(false);
  const overviewLayout = useRef({ y: 0, height: 0 });
  const homeScrollY = useRef(0);
  const contextQuickActionVisible = useRef(false);
  const lastReviewWordTapAt = useRef(0);
  const reviewWordTapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const homeProgressSparkle = useRef(new Animated.Value(0.35)).current;
  const complimentarySparkle = useRef(new Animated.Value(0.5)).current;
  const mastery = words.map((word) => getWordMastery(word, analytics));
  const overallMastery = words.length
    ? Math.round(mastery.reduce((total, score) => total + score, 0) / words.length)
    : 0;
  const strongWords = mastery.filter((score) => score >= 80).length;
  const masteredWords = mastery.filter((score) => score >= 100).length;
  const buildingWords = mastery.filter((score) => score >= 40 && score < 80).length;
  const learningWords = words.length - strongWords;
  const homeProgressSummary =
    words.length === 0
      ? 'Start your first word today.'
      : masteredWords > 0
        ? `${words.length} words saved · ${masteredWords} mastered`
        : strongWords > 0
          ? `${words.length} words saved · ${strongWords} growing strong`
          : buildingWords > 0
            ? `${words.length} words saved · ${buildingWords} building confidence`
            : `${words.length} words saved · Ready for your first review`;
  const hasProgressCelebration = masteredWords > 0 || strongWords > 0;
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
  const dueReviewCount = getDueReviewWords(words, analytics).length;
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

  useEffect(() => {
    if (!hasProgressCelebration) {
      homeProgressSparkle.setValue(0.35);
      return;
    }

    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(homeProgressSparkle, {
          toValue: 1,
          duration: 1150,
          useNativeDriver: true,
        }),
        Animated.timing(homeProgressSparkle, {
          toValue: 0.35,
          duration: 1150,
          useNativeDriver: true,
        }),
      ]),
    );

    animation.start();
    return () => animation.stop();
  }, [hasProgressCelebration, homeProgressSparkle]);

  useEffect(() => {
    if (!complimentaryAccess) {
      complimentarySparkle.setValue(0.5);
      return;
    }

    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(complimentarySparkle, {
          toValue: 1,
          duration: 1450,
          useNativeDriver: true,
        }),
        Animated.timing(complimentarySparkle, {
          toValue: 0.5,
          duration: 1450,
          useNativeDriver: true,
        }),
      ]),
    );

    animation.start();
    return () => animation.stop();
  }, [complimentaryAccess, complimentarySparkle]);

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

  function updateContextQuickAction(scrollY: number) {
    homeScrollY.current = scrollY;
    const { y, height } = overviewLayout.current;
    if (height <= 0) return;

    const transitionPoint = y + height - windowHeight * 0.55;
    const hysteresis = Math.max(18, Math.round(windowHeight * 0.025));
    const nextVisible = contextQuickActionVisible.current
      ? scrollY > transitionPoint - hysteresis
      : scrollY > transitionPoint + hysteresis;

    if (nextVisible !== contextQuickActionVisible.current) {
      contextQuickActionVisible.current = nextVisible;
      setShowContextQuickAction(nextVisible);
    }
  }

  const secondaryQuickAction: HomeQuickAction = showContextQuickAction
    ? dueReviewCount > 0
      ? {
          key: `review-${dueReviewCount}`,
          label: dueReviewCount < 100 ? `Review ${dueReviewCount}` : `${dueReviewCount} Due`,
          accessibilityLabel: `Review ${dueReviewCount} due ${dueReviewCount === 1 ? 'word' : 'words'}`,
          icon: 'albums-outline',
          onPress: onReviewDue,
        }
      : {
          key: 'omega-test',
          label: 'Omega Test',
          accessibilityLabel: 'Open Omega Test',
          icon: 'planet-outline',
          onPress: onOmegaTest,
        }
    : {
        key: words.length > 0 ? 'start-quiz-ready' : 'start-quiz-empty',
        label: 'Start Quiz',
        accessibilityLabel: words.length > 0 ? 'Start daily quiz' : 'Add your first word',
        icon: 'trophy-outline',
        onPress: words.length > 0 ? onQuiz : onAddWord,
      };

  return (
    <View style={styles.homeScreenShell}>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.homeContent}
        onScroll={({ nativeEvent }) => {
          updateContextQuickAction(nativeEvent.contentOffset.y);
        }}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
      >
      <View style={[styles.homeHero, { minHeight: 365 + heroAddedHeight }]}>
        <View style={styles.heroCloudOne} />
        <View style={styles.heroCloudTwo} />
        <View style={styles.heroCloudThree} />
        <View style={styles.homeTopRow}>
          <View style={styles.avatarBadge}>
            <Image
              accessibilityRole="image"
              accessibilityLabel="WordWiz logo"
              source={require('../../assets/wordwiz-logo.png')}
              style={styles.avatarLogo}
              resizeMode="cover"
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
        <View
          style={[
            styles.heroGreeting,
            { bottom: 47 + heroBottomBreathingRoom },
          ]}
        >
          <Text
            accessibilityLabel={`${getGreeting()}, WordWiz`}
            maxFontSizeMultiplier={1.25}
            style={styles.homeTitle}
          >
            {getGreeting()},{'\n'}
            <Text style={styles.homeBrandTitle}>WordWiz</Text>
            <Text style={styles.homeBrandAccent}> ✦</Text>
          </Text>
          <View style={styles.homeSubtitleRow}>
            {hasProgressCelebration ? (
              <Animated.View style={{ opacity: homeProgressSparkle }}>
                <Ionicons name="sparkles" size={13} color="#D39A16" />
              </Animated.View>
            ) : null}
            <Text
              maxFontSizeMultiplier={1.2}
              style={[styles.homeSubtitle, { marginTop: 7 + heroBrandGap }]}
            >
              {homeProgressSummary}
            </Text>
          </View>
        </View>
      </View>

      {complimentaryAccess ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`View WordWiz Plus plans. Your complimentary access has ${complimentaryAccess.daysRemaining} days left.`}
          accessibilityHint="Opens WordWiz Plus plans"
          onPress={onOpenPlus}
          style={({ pressed }) => [styles.homeTrialCard, pressed && styles.pressed]}
        >
          <View style={styles.homeTrialIcon}>
            <Ionicons name="sparkles" size={22} color={COLORS.purpleDark} />
            <Animated.View
              pointerEvents="none"
              style={[styles.homeTrialIconTwinkle, { opacity: complimentarySparkle }]}
            >
              <Ionicons name="sparkles" size={11} color="#D39A16" />
            </Animated.View>
            <View pointerEvents="none" style={styles.homeTrialIconGoldStar}>
              <Ionicons name="star" size={8} color="#D39A16" />
            </View>
            <View pointerEvents="none" style={styles.homeTrialIconGoldDust}>
              <Ionicons name="star" size={5} color="#F0BE45" />
            </View>
          </View>
          <View style={styles.homeTrialCopy}>
            <Text style={styles.homeTrialLabel}>COMPLIMENTARY PLUS ACCESS</Text>
            <Text style={styles.homeTrialTitle}>
              {complimentaryAccess.daysRemaining} {complimentaryAccess.daysRemaining === 1 ? 'day' : 'days'} left
            </Text>
            <Text style={styles.homeTrialSubtitle}>
              All Plus tools included. No payment required.
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={COLORS.purpleDark} />
        </Pressable>
      ) : showFreePlanNotice ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="You are using the free WordWiz plan. View WordWiz Plus plans."
          accessibilityHint="Opens WordWiz Plus plans"
          onPress={onOpenPlus}
          style={({ pressed }) => [styles.homeFreePlanCard, pressed && styles.pressed]}
        >
          <View style={styles.homeFreePlanIcon}>
            <Ionicons name="book-outline" size={20} color={COLORS.blue} />
          </View>
          <View style={styles.homeTrialCopy}>
            <Text style={styles.homeFreePlanLabel}>WORDWIZ FREE</Text>
            <Text style={styles.homeFreePlanTitle}>10 new words each month</Text>
            <Text style={styles.homeFreePlanSubtitle}>
              Flashcards stay open for every saved word.
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={COLORS.blue} />
        </Pressable>
      ) : null}

      <View
        onLayout={(event) => {
          const { y, height } = event.nativeEvent.layout;
          overviewLayout.current = { y, height };
          updateContextQuickAction(homeScrollY.current);
        }}
        style={[
          styles.homeOverviewCard,
          complimentaryAccess && styles.homeOverviewCardAfterComplimentary,
          showFreePlanNotice && styles.homeOverviewCardAfterTrial,
        ]}
      >
          <View style={styles.overviewHeader}>
          <View style={styles.overviewTitleGroup}>
            <View style={[styles.overviewTitleIcon, styles.wordWizHatBadge]}>
              <WordWizHatIcon />
            </View>
            <Text
              adjustsFontSizeToFit
              maxFontSizeMultiplier={1.1}
              minimumFontScale={0.82}
              numberOfLines={1}
              style={styles.homeSectionTitle}
            >
              Today’s learning
            </Text>
          </View>
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
        <View
          accessible
          accessibilityLabel="All-time learning summary"
          style={styles.homeAllTimeSummaryHeader}
        >
          <View style={styles.homeAllTimeSummaryLead}>
            <Ionicons name="analytics-outline" size={13} color={COLORS.muted} />
            <Text maxFontSizeMultiplier={1.15} style={styles.homeAllTimeSummaryLabel}>
              ALL-TIME LEARNING
            </Text>
          </View>
          <View style={styles.homeAllTimeSummaryDivider} />
        </View>
        <View style={styles.homeIdeaGrid}>
          <HomeMiniCard
            color={COLORS.bluePale}
            accent={COLORS.blue}
            icon="book-outline"
            title={`${words.length} saved words`}
            subtitle={`${strongWords} strong · ${learningWords} learning`}
          />
          <HomeMiniCard
            color={COLORS.orangePale}
            accent={COLORS.orange}
            icon="checkmark-circle-outline"
            title={totalQuizQuestions ? `${accuracy}% accuracy` : 'No quizzes yet'}
            subtitle={totalQuizQuestions
              ? `${totalCorrect} / ${totalQuizQuestions} correct`
              : 'Take a quiz to begin'}
          />
        </View>
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
            variant="main"
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

      <HomeQuickActions
        secondaryAction={secondaryQuickAction}
        onAddWord={onAddWord}
      />
    </View>
  );
}

type HomeQuickAction = {
  key: string;
  label: string;
  accessibilityLabel: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
};

function HomeQuickActions({
  secondaryAction,
  onAddWord,
}: {
  secondaryAction: HomeQuickAction;
  onAddWord: () => void;
}) {
  const reduceMotion = useReducedMotionPreference();
  const [displayedAction, setDisplayedAction] = useState(secondaryAction);
  const displayedActionKey = useRef(secondaryAction.key);
  const secondaryOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (displayedActionKey.current === secondaryAction.key) return;

    let cancelled = false;
    secondaryOpacity.stopAnimation();

    if (reduceMotion) {
      displayedActionKey.current = secondaryAction.key;
      setDisplayedAction(secondaryAction);
      secondaryOpacity.setValue(1);
      return;
    }

    Animated.timing(secondaryOpacity, {
      toValue: 0,
      duration: 90,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (!finished || cancelled) return;
      displayedActionKey.current = secondaryAction.key;
      setDisplayedAction(secondaryAction);
      Animated.timing(secondaryOpacity, {
        toValue: 1,
        duration: 130,
        useNativeDriver: true,
      }).start();
    });

    return () => {
      cancelled = true;
      secondaryOpacity.stopAnimation();
    };
  }, [reduceMotion, secondaryAction.key, secondaryOpacity]);

  return (
    <View pointerEvents="box-none" style={styles.homeFloatingActionDock}>
      <Animated.View style={{ opacity: secondaryOpacity }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={displayedAction.accessibilityLabel}
          onPress={displayedAction.onPress}
          style={({ pressed }) => [
            styles.homeFloatingSecondaryButton,
            pressed && styles.homeFloatingSecondaryButtonPressed,
          ]}
        >
          <Ionicons name={displayedAction.icon} size={18} color="#4B45C7" />
          <Text
            maxFontSizeMultiplier={1.15}
            numberOfLines={1}
            style={styles.homeFloatingSecondaryText}
          >
            {displayedAction.label}
          </Text>
        </Pressable>
      </Animated.View>
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
        <View pointerEvents="none" accessible={false} style={styles.homeFloatingAddSparkle}>
          <Ionicons name="sparkles" size={11} color="#FFE58A" />
        </View>
      </Pressable>
    </View>
  );
}

function useReducedMotionPreference() {
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) setReduceMotion(enabled);
    });
    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduceMotion,
    );
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  return reduceMotion;
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

function WordWizHatIcon() {
  return (
    <View accessible={false} style={styles.wordWizHatIcon}>
      <View style={styles.wordWizHatCone} />
      <View style={styles.wordWizHatBrim} />
      <Ionicons
        name="sparkles"
        size={10}
        color="#FFE58A"
        style={styles.wordWizHatSparkle}
      />
    </View>
  );
}
