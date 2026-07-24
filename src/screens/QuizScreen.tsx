import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { COLORS } from '../constants/theme';
import type { AnalyticsData, LegalPage, QuizAnswer, QuizPreferences, QuizProgress, QuizQuestion, QuizSessionMode, ReminderSettings, ReviewRating, SortMode, TimeBasedLearningSettings, Word } from '../types';
import { styles } from '../styles';
import { buildCategoryPracticeQuiz, buildOmegaTest, buildQuiz, calculateStreakStats, evaluateQuizAnswer, formatReminderTime, formatStudyTime, formatWordFlaggedDate, getDayKey, getMistakeReviewWordIds, getNewStudyWords, getOmegaTestStatus, getQuizRecallPaceSignal, getRecentDays, getStreakMessage, getStreakWeek, getStudySets, getTimeBasedLearningLimitSeconds, getTimedLearningBonusXp, getTypedRecallHint, getWordMastery, getWordMasteryCategoryForWord, NEW_STUDY_GROUP, normalizeTimeBasedLearningSettings, shuffle, TIMED_LEARNING_SECONDS, WORD_MASTERY_CATEGORIES, type WordMasteryCategoryId } from '../utils';
import { DashboardSection, DashboardStat, EmptyPractice, HomeAction, HomeMiniCard, LegalLink, LevelRow, ProgressFill, QuizComplete, QuizFact, ReminderTimeButton, ScreenHeader, StreakDay, WordInfoPanel, WordRow, SortButton } from '../components';
import { reportError, trackEvent } from '../services';

const REVEALED_TYPED_ANSWER = '__wordwiz-revealed-answer__';
const TIMED_OUT_ANSWER = '__wordwiz-timed-out__';
export type QuizStudyGroupId = WordMasteryCategoryId | 'new' | 'flagged' | `set:${string}`;

export type PausedQuizSession = {
  quiz: QuizQuestion[];
  questionIndex: number;
  selected: string | null;
  typedResponse: string;
  hintStep: number;
  reviewRating: ReviewRating;
  score: number;
  answers: QuizAnswer[];
  quizElapsedMs: number;
  questionElapsedMs: number;
  secondsRemaining: number;
  isPracticeRound: boolean;
  dailyRefreshActive: boolean;
  omegaRefreshActive: boolean;
  sessionMode: QuizSessionMode;
  quickQuestionCount: 5 | 10 | 20;
  challengeMistakes: number;
  challengeCorrectStreak: number;
  selectedCategory: QuizStudyGroupId;
};

type QuizStudyGroup = {
  id: QuizStudyGroupId;
  label: string;
  shortLabel: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  pale: string;
};

function getResponseTimeSeconds(questionStartedAt: number) {
  return Math.max(1, Math.round((Date.now() - questionStartedAt) / 1000));
}

function formatOmegaCountdown(remainingMs: number) {
  const totalHours = Math.max(1, Math.ceil(remainingMs / (60 * 60 * 1000)));
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  return days > 0 ? `${days}d ${hours}h` : `${hours}h`;
}

const FLAGGED_STUDY_GROUP = {
  id: 'flagged' as const,
  label: 'Flagged Words',
  shortLabel: 'Flagged',
  icon: 'bookmark' as const,
  color: COLORS.purpleDark,
  pale: COLORS.purplePale,
};

const QUIZ_SESSION_OPTIONS: {
  id: QuizSessionMode;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  description: string;
}[] = [
  { id: 'standard', label: 'Standard', icon: 'sparkles-outline', description: 'Adaptive mix' },
  { id: 'quick', label: 'Quick', icon: 'flash-outline', description: '5–20 timed questions' },
  { id: 'challenge', label: 'Challenge', icon: 'flame-outline', description: 'No hints · 3 misses ends it' },
  { id: 'mistake-review', label: 'Mistake review', icon: 'refresh-outline', description: 'Missed and slow words' },
  { id: 'mastery-test', label: 'Mastery test', icon: 'ribbon-outline', description: 'Recall, no hints' },
];

function getQuizSessionLabel(sessionMode: QuizSessionMode) {
  if (sessionMode === 'omega-test') return 'Omega Test';
  return QUIZ_SESSION_OPTIONS.find((option) => option.id === sessionMode)?.label ?? 'Standard';
}

function supportsQuestionCount(sessionMode: QuizSessionMode) {
  return sessionMode === 'standard' ||
    sessionMode === 'quick' ||
    sessionMode === 'challenge' ||
    sessionMode === 'mistake-review';
}

export function QuizScreen({
  words,
  analytics,
  progress,
  priorityWordIds = [],
  initialStudyGroup,
  timedLearningEnabled,
  timeBasedLearningSettings,
  quizPreferences,
  refreshTokens,
  onUseRefreshToken,
  onComplete,
  onToggleFlag,
  onOpenStudySetBuilder,
  pausedSession,
  onPauseSession,
  onDiscardPausedSession,
  onRegisterPauseHandler,
}: {
  words: Word[];
  analytics: AnalyticsData;
  progress: QuizProgress | null;
  priorityWordIds?: string[];
  initialStudyGroup?: 'flagged';
  timedLearningEnabled: boolean;
  timeBasedLearningSettings: TimeBasedLearningSettings;
  quizPreferences: QuizPreferences;
  refreshTokens: number;
  onUseRefreshToken: () => boolean;
  onComplete: (
    score: number,
    total: number,
    durationSeconds: number,
    answers: QuizAnswer[],
    options?: { isDailyScoreRetry?: boolean },
  ) => Promise<void>;
  onToggleFlag: (wordId: string) => void;
  onOpenStudySetBuilder: () => void;
  pausedSession: PausedQuizSession | null;
  onPauseSession: (session: PausedQuizSession) => void;
  onDiscardPausedSession: () => void;
  onRegisterPauseHandler: (handler: (() => void) | null) => void;
}) {
  const [quiz, setQuiz] = useState<QuizQuestion[]>([]);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [typedResponse, setTypedResponse] = useState('');
  const [hintStep, setHintStep] = useState(0);
  const [reviewRating, setReviewRating] = useState<ReviewRating>('correct');
  const [score, setScore] = useState(0);
  const [finishedScore, setFinishedScore] = useState<number | null>(null);
  const [answers, setAnswers] = useState<QuizAnswer[]>([]);
  const [quizStartedAt, setQuizStartedAt] = useState(Date.now());
  const [questionStartedAt, setQuestionStartedAt] = useState(Date.now());
  const [secondsRemaining, setSecondsRemaining] = useState(TIMED_LEARNING_SECONDS);
  const [finishedBonusXp, setFinishedBonusXp] = useState(0);
  const [isQuizSetupExpanded, setIsQuizSetupExpanded] = useState(false);
  const [isPracticeRound, setIsPracticeRound] = useState(false);
  const [dailyRefreshActive, setDailyRefreshActive] = useState(false);
  const [omegaRefreshActive, setOmegaRefreshActive] = useState(false);
  const [sessionMode, setSessionMode] = useState<QuizSessionMode>('standard');
  const [questionCount, setQuestionCount] = useState<5 | 10 | 20>(5);
  const [challengeMistakes, setChallengeMistakes] = useState(0);
  const [challengeCorrectStreak, setChallengeCorrectStreak] = useState(0);
  const [finishedTotal, setFinishedTotal] = useState<number | null>(null);
  const [finishedWasDailyRetry, setFinishedWasDailyRetry] = useState(false);
  const [selectedCategory, setSelectedCategory] =
    useState<QuizStudyGroupId>(initialStudyGroup ?? 'all');
  const wordMastery = useMemo(
    () =>
      words.map((word) => ({
        word,
        categoryId: getWordMasteryCategoryForWord(word, analytics).id,
      })),
    [analytics, words],
  );
  const studySets = useMemo(() => getStudySets(words), [words]);
  const categoryCounts = useMemo(
    () =>
      WORD_MASTERY_CATEGORIES.reduce(
        (counts, category) => ({
          ...counts,
          [category.id]:
            category.id === 'all'
              ? words.length
              : wordMastery.filter((item) => item.categoryId === category.id)
                  .length,
        }),
        {} as Record<WordMasteryCategoryId, number>,
      ),
    [wordMastery, words.length],
  );
  const flaggedCount = useMemo(
    () => words.filter((word) => word.isFlagged).length,
    [words],
  );
  const newWords = useMemo(
    () => getNewStudyWords(words, analytics),
    [analytics, words],
  );
  const filteredQuizWords = useMemo(
    () =>
      selectedCategory === 'all'
        ? words
        : selectedCategory === 'new'
          ? newWords
        : selectedCategory === 'flagged'
          ? words.filter((word) => word.isFlagged)
        : selectedCategory.startsWith('set:')
          ? words.filter((word) =>
              word.mastery?.studySets?.some(
                (set) => set.id === selectedCategory.slice(4),
              ),
            )
        : wordMastery
            .filter((item) => item.categoryId === selectedCategory)
            .map((item) => item.word),
    [newWords, selectedCategory, wordMastery, words],
  );
  const masteryTestWords = useMemo(
    () =>
      filteredQuizWords.filter(
        (word) => getWordMastery(word, analytics) >= 70,
      ),
    [analytics, filteredQuizWords],
  );
  const mistakeReviewWordIds = useMemo(
    () => getMistakeReviewWordIds(analytics, timeBasedLearningSettings),
    [analytics, timeBasedLearningSettings],
  );
  const mistakeReviewWords = useMemo(
    () =>
      filteredQuizWords.filter((word) => mistakeReviewWordIds.includes(word.id)),
    [filteredQuizWords, mistakeReviewWordIds],
  );
  const omegaTestWords = useMemo(
    () => words.filter((word) => !word.mastery?.excludedFromPractice),
    [words],
  );
  const omegaTestStatus = useMemo(
    () => getOmegaTestStatus(analytics),
    [analytics],
  );
  const omegaTestAvailable = omegaTestStatus.available || omegaRefreshActive;
  const sessionUsesQuestionCount = supportsQuestionCount(sessionMode);
  const activeQuizWords =
    sessionMode === 'omega-test'
      ? omegaTestWords
      : sessionMode === 'mastery-test'
      ? masteryTestWords
      : sessionMode === 'mistake-review'
        ? mistakeReviewWords
      : filteredQuizWords;

  const studyGroups: QuizStudyGroup[] = [
    WORD_MASTERY_CATEGORIES[0],
    NEW_STUDY_GROUP,
    ...WORD_MASTERY_CATEGORIES.slice(1),
    FLAGGED_STUDY_GROUP,
  ];
  const studySetGroups: QuizStudyGroup[] = studySets.map((set) => ({
    id: `set:${set.id}`,
    label: set.name,
    shortLabel: set.name,
    icon: 'layers',
    color: COLORS.blue,
    pale: COLORS.bluePale,
  }));
  const selectedCategoryDetails =
    [...studyGroups, ...studySetGroups].find(
      (category) => category.id === selectedCategory,
    ) ?? WORD_MASTERY_CATEGORIES[0];
  const categoryQuizQuestionCount =
    sessionMode === 'omega-test'
      ? activeQuizWords.length * 2
      : sessionMode === 'mastery-test'
        ? Math.min(activeQuizWords.length, 10)
        : questionCount;
  const canChangeCategory = quiz.length === 0 || finishedScore !== null;
  const activeQuestion = quiz[questionIndex];
  const normalizedTimeSettings = normalizeTimeBasedLearningSettings(
    timeBasedLearningSettings,
  );
  const activeTimeLimitSeconds = sessionMode === 'quick'
    ? TIMED_LEARNING_SECONDS
    : activeQuestion
      ? getTimeBasedLearningLimitSeconds(
          activeQuestion.difficulty,
          normalizedTimeSettings,
        )
      : TIMED_LEARNING_SECONDS;
  const timedQuestionActive = Boolean(
    activeQuestion &&
      (sessionMode === 'quick' || (
        timedLearningEnabled &&
        getWordMastery(activeQuestion.word, analytics) >= 80
      )),
  );

  function saveQuizForLater() {
    if (quiz.length === 0 || finishedScore !== null) return;

    const now = Date.now();
    onPauseSession({
      quiz,
      questionIndex,
      selected,
      typedResponse,
      hintStep,
      reviewRating,
      score,
      answers,
      quizElapsedMs: Math.max(0, now - quizStartedAt),
      questionElapsedMs: Math.max(0, now - questionStartedAt),
      secondsRemaining,
      isPracticeRound,
      dailyRefreshActive,
      omegaRefreshActive,
      sessionMode,
      quickQuestionCount: questionCount,
      challengeMistakes,
      challengeCorrectStreak,
      selectedCategory,
    });
  }

  function resetActiveQuiz() {
    setQuiz([]);
    setQuestionIndex(0);
    setSelected(null);
    setTypedResponse('');
    setHintStep(0);
    setReviewRating('correct');
    setScore(0);
    setAnswers([]);
    setFinishedScore(null);
    setFinishedTotal(null);
    setFinishedBonusXp(0);
    setIsPracticeRound(false);
    setDailyRefreshActive(false);
    setOmegaRefreshActive(false);
    setChallengeMistakes(0);
    setChallengeCorrectStreak(0);
  }

  function resumePausedQuiz() {
    if (!pausedSession) return;

    const now = Date.now();
    setQuiz(pausedSession.quiz);
    setQuestionIndex(pausedSession.questionIndex);
    setSelected(pausedSession.selected);
    setTypedResponse(pausedSession.typedResponse);
    setHintStep(pausedSession.hintStep);
    setReviewRating(pausedSession.reviewRating);
    setScore(pausedSession.score);
    setAnswers(pausedSession.answers);
    setQuizStartedAt(now - pausedSession.quizElapsedMs);
    setQuestionStartedAt(now - pausedSession.questionElapsedMs);
    setSecondsRemaining(pausedSession.secondsRemaining);
    setIsPracticeRound(pausedSession.isPracticeRound);
    setDailyRefreshActive(pausedSession.dailyRefreshActive);
    setOmegaRefreshActive(pausedSession.omegaRefreshActive);
    setSessionMode(pausedSession.sessionMode);
    setQuestionCount(pausedSession.quickQuestionCount);
    setChallengeMistakes(pausedSession.challengeMistakes);
    setChallengeCorrectStreak(pausedSession.challengeCorrectStreak);
    setSelectedCategory(pausedSession.selectedCategory);
    onDiscardPausedSession();
  }

  function confirmExitQuiz() {
    Alert.alert(
      'Leave this quiz?',
      'Save your place and come back whenever you are ready, or end this attempt now.',
      [
        { text: 'Keep learning', style: 'cancel' },
        {
          text: 'Save & exit',
          onPress: () => {
            saveQuizForLater();
            resetActiveQuiz();
          },
        },
        {
          text: 'End quiz',
          style: 'destructive',
          onPress: () => {
            onDiscardPausedSession();
            resetActiveQuiz();
          },
        },
      ],
    );
  }

  useEffect(() => {
    onRegisterPauseHandler(saveQuizForLater);
    return () => onRegisterPauseHandler(null);
  }, [
    answers,
    challengeCorrectStreak,
    challengeMistakes,
    dailyRefreshActive,
    finishedScore,
    hintStep,
    isPracticeRound,
    onRegisterPauseHandler,
    omegaRefreshActive,
    questionIndex,
    questionStartedAt,
    questionCount,
    quiz,
    quizStartedAt,
    reviewRating,
    score,
    secondsRemaining,
    selected,
    selectedCategory,
    sessionMode,
    typedResponse,
  ]);

  useEffect(() => {
    if (initialStudyGroup === 'flagged' && canChangeCategory) {
      setSelectedCategory('flagged');
    }
  }, [canChangeCategory, initialStudyGroup]);

  useEffect(() => {
    if (
      canChangeCategory &&
      selectedCategory.startsWith('set:') &&
      !studySets.some((set) => `set:${set.id}` === selectedCategory)
    ) {
      setSelectedCategory('all');
    }
  }, [canChangeCategory, selectedCategory, studySets]);

  const categorySelector = (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.practiceCategoryList}
      style={styles.practiceCategoryScroller}
    >
      {studyGroups.map((category) => {
        const isActive = selectedCategory === category.id;
        const count =
          category.id === 'new'
            ? newWords.length
            : category.id === 'flagged'
            ? flaggedCount
            : category.id.startsWith('set:')
              ? studySets.find((set) => `set:${set.id}` === category.id)?.wordIds.length ?? 0
            : categoryCounts[category.id as WordMasteryCategoryId] ?? 0;

        return (
          <Pressable
            key={category.id}
            accessibilityRole="button"
            accessibilityLabel={`Practice ${category.label.toLowerCase()}`}
            accessibilityState={{ selected: isActive }}
            onPress={() => {
              if (canChangeCategory) {
                setSelectedCategory(category.id);
              }
            }}
            style={[
              styles.practiceCategoryChip,
              isActive && styles.practiceCategoryChipActive,
              { borderColor: isActive ? category.color : '#E5DEF5' },
            ]}
          >
            <View
              style={[
                styles.practiceCategoryIcon,
                { backgroundColor: category.pale },
              ]}
            >
              <Ionicons name={category.icon} size={15} color={category.color} />
            </View>
            <Text
              style={[
                styles.practiceCategoryText,
                isActive && { color: category.color },
              ]}
            >
              {category.shortLabel}
            </Text>
            <Text
              style={[
                styles.practiceCategoryCount,
                isActive && { color: category.color },
              ]}
            >
              {count}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );

  const studySetSelector = (
    <View style={styles.practiceStudySetsRow}>
      <View style={styles.practiceStudySetsHeading}>
        <Ionicons name="layers-outline" size={15} color={COLORS.blue} />
        <Text style={styles.practiceStudySetsTitle}>MY SETS</Text>
      </View>
      {studySets.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.practiceStudySetsScroller}
          contentContainerStyle={styles.practiceStudySetsList}
        >
          {studySetGroups.map((set) => {
            const isActive = selectedCategory === set.id;
            const count = studySets.find((studySet) => `set:${studySet.id}` === set.id)?.wordIds.length ?? 0;
            return (
              <Pressable
                key={set.id}
                accessibilityRole="button"
                accessibilityLabel={`Practice ${set.label}`}
                accessibilityState={{ selected: isActive }}
                disabled={!canChangeCategory}
                onPress={() => setSelectedCategory(set.id)}
                style={[
                  styles.practiceStudySetChip,
                  isActive && styles.practiceStudySetChipActive,
                  !canChangeCategory && styles.practiceButtonDisabled,
                ]}
              >
                <Text
                  numberOfLines={1}
                  style={[
                    styles.practiceStudySetText,
                    isActive && styles.practiceStudySetTextActive,
                  ]}
                >
                  {set.shortLabel}
                </Text>
                <Text
                  style={[
                    styles.practiceStudySetCount,
                    isActive && styles.practiceStudySetTextActive,
                  ]}
                >
                  {count}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : (
        <Text numberOfLines={1} style={styles.practiceStudySetsEmpty}>
          Create a focused deck
        </Text>
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Create a study set"
        accessibilityHint="Choose saved words for a focused flashcard deck or quiz."
        disabled={!canChangeCategory}
        onPress={onOpenStudySetBuilder}
        style={({ pressed }) => [
          styles.practiceStudySetAddButton,
          !canChangeCategory && styles.practiceButtonDisabled,
          pressed && styles.pressed,
        ]}
      >
        <Ionicons name="add" size={19} color={COLORS.blue} />
      </Pressable>
    </View>
  );

  function startQuiz(
    modeOverride: QuizSessionMode = sessionMode,
    hasOmegaAccess = omegaTestAvailable,
  ) {
    const quizWords = modeOverride === 'omega-test'
      ? omegaTestWords
      : activeQuizWords;

    if (
      !quizPreferences.enabled ||
      quizWords.length === 0 ||
      (modeOverride === 'omega-test' && !hasOmegaAccess)
    ) {
      return;
    }

    onDiscardPausedSession();

    const masteryByWordId = Object.fromEntries(
      quizWords.map((word) => [
        word.id,
        getWordMastery(word, analytics),
      ]),
    );
    const sessionOptions = {
      difficulty: quizPreferences.difficulty,
      sessionMode: modeOverride,
      questionTypePreferences: quizPreferences.questionTypes,
      questionLimit:
        supportsQuestionCount(modeOverride) ? questionCount : undefined,
    };
    const sessionPriorityWordIds = modeOverride === 'mistake-review'
      ? [
          ...mistakeReviewWordIds.filter((wordId) =>
            quizWords.some((word) => word.id === wordId),
          ),
          ...priorityWordIds,
        ]
      : priorityWordIds;
    const nextQuiz =
      modeOverride === 'omega-test'
        ? buildOmegaTest(quizWords, analytics.quizHistory)
        : selectedCategory === 'all'
        ? buildQuiz(
            quizWords,
            analytics.quizHistory,
            masteryByWordId,
            sessionPriorityWordIds,
            sessionOptions,
          )
        : buildCategoryPracticeQuiz(
            quizWords,
            analytics.quizHistory,
            masteryByWordId,
            sessionPriorityWordIds,
            sessionOptions,
          );

    setQuiz(nextQuiz);
    setQuestionIndex(0);
    setSelected(null);
    setTypedResponse('');
    setHintStep(0);
    setReviewRating('correct');
    setScore(0);
    setFinishedScore(null);
    setFinishedTotal(null);
    setFinishedWasDailyRetry(
      modeOverride === 'omega-test' ? false : dailyRefreshActive,
    );
    setAnswers([]);
    setChallengeMistakes(0);
    setChallengeCorrectStreak(0);
    setQuizStartedAt(Date.now());
    setQuestionStartedAt(Date.now());
    setSecondsRemaining(
      modeOverride === 'quick'
        ? TIMED_LEARNING_SECONDS
        : getTimeBasedLearningLimitSeconds(
            nextQuiz[0]?.difficulty,
            normalizedTimeSettings,
          ),
    );
    setFinishedBonusXp(0);
    setIsPracticeRound(
      modeOverride === 'omega-test' || (Boolean(progress) && !dailyRefreshActive),
    );
    trackEvent('quiz_started', {
      category: selectedCategory,
      mode: modeOverride,
      difficulty: quizPreferences.difficulty,
      questions: nextQuiz.length,
    });
  }

  function chooseAnswer(option: string) {
    if (selected) return;
    const question = quiz[questionIndex];
    setSelected(option);
    const correct = evaluateQuizAnswer(
      question.answer,
      option,
      question.mode,
      question.strictSpelling,
    ).correct;
    const responseTimeSeconds = getResponseTimeSeconds(questionStartedAt);
    const speedBonusXp =
      correct && timedQuestionActive
        ? getTimedLearningBonusXp(secondsRemaining, activeTimeLimitSeconds)
        : 0;
    const nextChallengeCorrectStreak = correct ? challengeCorrectStreak + 1 : 0;
    const challengeStreakBonusXp =
      sessionMode === 'challenge' &&
      correct &&
      nextChallengeCorrectStreak >= 3 &&
      nextChallengeCorrectStreak % 3 === 0
        ? 2
        : 0;
    setChallengeCorrectStreak(nextChallengeCorrectStreak);
    if (correct) setScore((current) => current + 1);
    setAnswers((current) => [
      ...current,
      {
        wordId: question.word.id,
        correct,
        sessionMode,
        difficulty: question.difficulty,
        questionMode: question.mode,
        answeredAt: new Date().toISOString(),
        responseTimeSeconds,
        recallPace: getQuizRecallPaceSignal({
          correct,
          responseTimeSeconds,
          difficulty: question.difficulty,
          settings: normalizedTimeSettings,
        }),
        reviewRating: correct ? 'correct' : undefined,
        speedBonusXp: speedBonusXp + challengeStreakBonusXp || undefined,
      },
    ]);
  }

  function timeOutQuestion() {
    if (selected || !timedQuestionActive || !activeQuestion) return;

    setSecondsRemaining(0);
    setSelected(TIMED_OUT_ANSWER);
    setAnswers((current) => [
      ...current,
      {
        wordId: activeQuestion.word.id,
        correct: false,
        sessionMode,
        timedOut: true,
        difficulty: activeQuestion.difficulty,
        questionMode: activeQuestion.mode,
        answeredAt: new Date().toISOString(),
        responseTimeSeconds: activeTimeLimitSeconds,
        recallPace: 'incorrect',
      },
    ]);
  }

  function submitTypedAnswer() {
    if (!typedResponse.trim()) return;
    chooseAnswer(typedResponse.trim());
  }

  function revealTypedAnswer() {
    if (selected) return;
    const question = quiz[questionIndex];
    setTypedResponse(question.answer);
    chooseAnswer(REVEALED_TYPED_ANSWER);
  }

  async function nextQuestion() {
    if (!selected) {
      return;
    }

    const question = quiz[questionIndex];
    const evaluation = evaluateQuizAnswer(
      question.answer,
      selected,
      question.mode,
      question.strictSpelling,
    );
    const responseTimeSeconds = getResponseTimeSeconds(questionStartedAt);
    const currentAnswer: QuizAnswer = {
      wordId: question.word.id,
      correct: evaluation.correct,
      sessionMode,
      difficulty: question.difficulty,
      questionMode: question.mode,
      answeredAt: new Date().toISOString(),
      responseTimeSeconds,
      recallPace: getQuizRecallPaceSignal({
        correct: evaluation.correct,
        responseTimeSeconds,
        difficulty: question.difficulty,
        settings: normalizedTimeSettings,
      }),
      reviewRating: evaluation.correct ? reviewRating : undefined,
    };
    const completedAnswers = answers.length > questionIndex
      ? answers.map((answer, index) =>
          index === questionIndex && answer.correct
            ? { ...answer, reviewRating }
            : answer,
        )
      : [...answers, currentAnswer];
    const finalScore = completedAnswers.filter((answer) => answer.correct).length;
    const nextChallengeMistakes = evaluation.correct
      ? 0
      : challengeMistakes + 1;
    const challengeEnded =
      sessionMode === 'challenge' && nextChallengeMistakes >= 3;
    setChallengeMistakes(nextChallengeMistakes);
    if (questionIndex === quiz.length - 1 || challengeEnded) {
      const durationSeconds = Math.max(
        1,
        Math.round((Date.now() - quizStartedAt) / 1000),
      );
      setFinishedScore(finalScore);
      setFinishedTotal(completedAnswers.length);
      setFinishedBonusXp(
        completedAnswers.reduce(
          (total, answer) => total + (answer.speedBonusXp ?? 0),
          0,
        ),
      );
      onDiscardPausedSession();
      try {
        await onComplete(finalScore, completedAnswers.length, durationSeconds, completedAnswers, {
          isDailyScoreRetry: dailyRefreshActive,
        });
      } catch (error) {
        reportError(error, { area: 'complete_quiz' });
      } finally {
        if (dailyRefreshActive) setDailyRefreshActive(false);
        if (sessionMode === 'omega-test') setOmegaRefreshActive(false);
      }
      return;
    }
    setQuestionIndex((index) => index + 1);
    setSelected(null);
    setTypedResponse('');
    setHintStep(0);
    setReviewRating('correct');
    setQuestionStartedAt(Date.now());
    setSecondsRemaining(
      sessionMode === 'quick'
        ? TIMED_LEARNING_SECONDS
        : getTimeBasedLearningLimitSeconds(
            quiz[questionIndex + 1]?.difficulty,
            normalizedTimeSettings,
          ),
    );
  }

  useEffect(() => {
    if (!timedQuestionActive || selected) return;

    const endsAt = questionStartedAt + activeTimeLimitSeconds * 1000;
    const intervalId = setInterval(() => {
      const nextSeconds = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
      setSecondsRemaining(nextSeconds);
      if (nextSeconds === 0) {
        clearInterval(intervalId);
        timeOutQuestion();
      }
    }, 250);

    return () => clearInterval(intervalId);
  }, [activeTimeLimitSeconds, questionStartedAt, selected, timedQuestionActive]);

  const quizSetupControls = (
    <View style={styles.quizSetupCard}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: isQuizSetupExpanded }}
        accessibilityLabel="Choose quiz type"
        accessibilityHint="Choose the kind of quiz to take"
        onPress={() => setIsQuizSetupExpanded((expanded) => !expanded)}
        style={({ pressed }) => [styles.quizSetupHeader, pressed && styles.pressed]}
      >
        <View style={styles.quizSetupIcon}>
          <Ionicons name="options-outline" size={18} color={COLORS.purpleDark} />
        </View>
        <View style={styles.quizSetupToggleCopy}>
          <Text style={styles.quizSetupTitle}>Choose quiz type</Text>
          <Text style={styles.quizSetupText}>
            {quizPreferences.enabled
              ? `${getQuizSessionLabel(sessionMode)}${sessionUsesQuestionCount ? ` · ${questionCount} questions` : ''} selected`
              : 'Quizzes paused · manage in Stats'}
          </Text>
        </View>
        <Ionicons
          name={isQuizSetupExpanded ? 'chevron-up' : 'chevron-down'}
          size={20}
          color={COLORS.purpleDark}
        />
      </Pressable>

      {isQuizSetupExpanded ? (
        <>
      {quizPreferences.enabled ? (
        <>
          <Text style={styles.quizSetupLabel}>SESSION TYPE</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.quizSessionScroller}
            contentContainerStyle={styles.quizSessionOptionRow}
          >
            {QUIZ_SESSION_OPTIONS.map((option) => {
              const active = sessionMode === option.id;
              return (
                <Pressable
                  key={option.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  onPress={() => {
                    setSessionMode(option.id);
                  }}
                  style={({ pressed }) => [
                    styles.quizSessionOption,
                    active && styles.quizSessionOptionActive,
                    pressed && styles.pressed,
                  ]}
                >
                  <Ionicons name={option.icon} size={16} color={active ? COLORS.purpleDark : COLORS.muted} />
                  <Text style={[styles.quizSessionOptionLabel, active && styles.quizSessionOptionLabelActive]}>{option.label}</Text>
                  <Text style={styles.quizSessionOptionDetail}>{option.description}</Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {sessionUsesQuestionCount ? (
            <View style={styles.quickLengthRow}>
              <Text style={styles.quizSetupLabel}>QUESTIONS IN THIS QUIZ</Text>
              <View style={styles.quickLengthOptions}>
                {([5, 10, 20] as const).map((count) => (
                  <Pressable
                    key={count}
                    accessibilityRole="button"
                    accessibilityState={{ selected: questionCount === count }}
                    onPress={() => {
                      setQuestionCount(count);
                    }}
                    style={({ pressed }) => [styles.quickLengthButton, questionCount === count && styles.quickLengthButtonActive, pressed && styles.pressed]}
                  >
                    <Text style={[styles.quickLengthText, questionCount === count && styles.quickLengthTextActive]}>{count}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}
          <View style={styles.quizSetupStartHint}>
            <Ionicons name="play-circle-outline" size={15} color={COLORS.purpleDark} />
            <Text style={styles.quizSetupStartHintText}>
              Choosing a type only sets up your next quiz. Press Practice below when you’re ready.
            </Text>
          </View>
        </>
      ) : null}
        </>
      ) : null}
    </View>
  );

  const omegaTestCard = (
    <View style={styles.omegaTestCard}>
      <View style={styles.omegaTestIcon}>
        <Ionicons name="planet" size={25} color={COLORS.white} />
        <Ionicons
          name="sparkles"
          size={12}
          color="#FFE58A"
          style={styles.omegaTestSparkle}
        />
      </View>
      <View style={styles.omegaTestCopy}>
        <Text style={styles.omegaTestEyebrow}>WEEKLY OMEGA TEST</Text>
        <Text style={styles.omegaTestTitle}>Test every saved word</Text>
        <Text style={styles.omegaTestText}>
          {sessionMode === 'omega-test'
            ? 'Full-library assessment selected. Two varied prompts per word, with no hints.'
            : 'A full-library assessment with two varied prompts per word and no hints.'}
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          omegaTestAvailable
            ? 'Start the final boss Omega Test'
            : refreshTokens > 0
              ? 'Use one refresh token and start the final boss Omega Test'
              : 'Omega Test is on cooldown'
        }
        accessibilityHint={
          omegaTestAvailable
            ? 'A full assessment of every saved word.'
            : refreshTokens > 0
              ? 'Achievement refresh tokens can unlock a test early.'
              : 'Omega Tests are available every seven days.'
        }
        disabled={
          !quizPreferences.enabled ||
          (!omegaTestAvailable && refreshTokens === 0) ||
          omegaTestWords.length === 0
        }
        onPress={() => {
          let hasOmegaAccess = omegaTestAvailable;
          if (!omegaTestAvailable) {
            if (!onUseRefreshToken()) return;
            hasOmegaAccess = true;
            setOmegaRefreshActive(true);
          }
          setDailyRefreshActive(false);
          setSessionMode('omega-test');
          setIsQuizSetupExpanded(false);
          startQuiz('omega-test', hasOmegaAccess);
        }}
        style={({ pressed }) => [
          styles.omegaTestButton,
          (!quizPreferences.enabled ||
            (!omegaTestAvailable && refreshTokens === 0) ||
            omegaTestWords.length === 0) && styles.omegaTestButtonDisabled,
          pressed && styles.pressed,
        ]}
      >
        <Text style={styles.omegaTestButtonText}>
          {omegaTestAvailable
            ? 'FACE FINAL BOSS'
            : refreshTokens > 0
              ? 'USE 1 TOKEN'
              : formatOmegaCountdown(omegaTestStatus.remainingMs)}
        </Text>
        <Ionicons
          name={omegaTestAvailable ? 'arrow-forward' : refreshTokens > 0 ? 'ticket-outline' : 'time-outline'}
          size={14}
          color={COLORS.white}
        />
      </Pressable>
    </View>
  );

  const quizScopeControls = sessionMode === 'omega-test' ? (
    <View style={styles.omegaTestScopeNote}>
      <Ionicons name="planet-outline" size={17} color={COLORS.purpleDark} />
      <Text style={styles.omegaTestScopeNoteText}>
        Omega uses your full library, so category and deck filters do not apply.
      </Text>
    </View>
  ) : (
    <>
      {categorySelector}
      {studySetSelector}
    </>
  );

  if (pausedSession && quiz.length === 0) {
    const questionNumber = pausedSession.questionIndex + 1;
    const totalQuestions = pausedSession.quiz.length;
    const pausedLabel = pausedSession.sessionMode === 'omega-test'
      ? 'Omega Test'
      : `${getQuizSessionLabel(pausedSession.sessionMode)} quiz`;

    return (
      <ScrollView contentContainerStyle={styles.singleScreenContent}>
        <ScreenHeader
          eyebrow={pausedSession.sessionMode === 'omega-test' ? 'OMEGA TEST' : 'DAILY QUIZ'}
          title="Your quiz is waiting"
          subtitle="Your place is saved. Pick up exactly where you left off."
        />
        <View style={styles.quizPausedCard}>
          <View pointerEvents="none" style={styles.quizPausedGlow} />
          <View style={styles.quizPausedIcon}>
            <Ionicons name="pause" size={29} color={COLORS.white} />
          </View>
          <Text style={styles.quizPausedTitle}>{pausedLabel} paused</Text>
          <Text style={styles.quizPausedText}>
            Your timer is paused too, so there is no rush.
          </Text>
          <View style={styles.quizPausedProgress}>
            <Text style={styles.quizPausedProgressText}>
              QUESTION {questionNumber} OF {totalQuestions} · {pausedSession.score} CORRECT
            </Text>
          </View>
          <View style={styles.quizPausedActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Resume paused quiz"
              onPress={resumePausedQuiz}
              style={({ pressed }) => [
                styles.primaryButton,
                pressed && styles.primaryButtonPressed,
              ]}
            >
              <Text style={styles.primaryButtonText}>RESUME QUIZ</Text>
              <Ionicons name="play" size={18} color={COLORS.white} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="End paused quiz"
              onPress={onDiscardPausedSession}
              style={({ pressed }) => [
                styles.quizPausedDiscardButton,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.quizPausedDiscardText}>END THIS ATTEMPT</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    );
  }

  if (progress && quiz.length === 0 && !dailyRefreshActive) {
    return (
      <ScrollView contentContainerStyle={styles.singleScreenContent}>
        <ScreenHeader
          eyebrow="DAILY QUIZ"
          title={dailyRefreshActive ? 'Improve today’s score' : 'Today’s practice'}
          subtitle={
            dailyRefreshActive
              ? 'A fresh Daily Quiz is ready. Daily and regular quizzes add to your streak.'
              : 'A little review each day makes words stick.'
          }
        />
        <QuizComplete score={progress.score} total={progress.total} />
        <View style={styles.quizRefreshTokenCard}>
          <View pointerEvents="none" style={styles.quizRefreshTokenGlow} />
          {refreshTokens > 0 ? (
            <View pointerEvents="none" style={styles.quizRefreshTokenMagicSparkle}>
              <Ionicons name="sparkles" size={17} color="#D39A16" />
            </View>
          ) : null}
          <View style={styles.quizRefreshTokenCopy}>
            <View style={styles.quizRefreshTokenIcon}>
              <Ionicons name="ticket" size={17} color={COLORS.white} />
              {refreshTokens > 0 ? (
                <View style={styles.quizRefreshTokenSparkle}>
                  <Ionicons name="sparkles" size={9} color="#FFF2A7" />
                </View>
              ) : null}
            </View>
            <View style={styles.quizRefreshTokenTextWrap}>
              <Text style={styles.quizRefreshTokenTitle}>Improve today’s score</Text>
              <Text style={styles.quizRefreshTokenText}>
                {refreshTokens > 0
                  ? 'Use a token for one more Daily Quiz. Daily and regular quizzes add to your streak.'
                  : 'Complete achievements to earn a refresh token.'}
              </Text>
            </View>
          </View>
          {refreshTokens > 0 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Use one refresh token to retry today’s daily quiz score"
              onPress={() => {
                if (onUseRefreshToken()) {
                  setDailyRefreshActive(true);
                }
              }}
              style={({ pressed }) => [
                styles.quizRefreshTokenButton,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.quizRefreshTokenButtonText}>RETRY DAILY SCORE</Text>
            </Pressable>
          ) : null}
        </View>
        {quizSetupControls}
        {omegaTestCard}
        {quizScopeControls}
        <Pressable
          disabled={!quizPreferences.enabled || activeQuizWords.length === 0}
          onPress={() => startQuiz()}
          style={({ pressed }) => [
            styles.quizPracticeButton,
            (!quizPreferences.enabled || activeQuizWords.length === 0) && styles.practiceButtonDisabled,
            pressed && styles.pressed,
          ]}
        >
          <Ionicons name="refresh" size={18} color={COLORS.blue} />
          <Text style={styles.quizPracticeButtonText}>
            PRACTICE {getQuizSessionLabel(sessionMode).toUpperCase()} QUIZ
          </Text>
        </Pressable>
      </ScrollView>
    );
  }

  if (words.length === 0) {
    return (
      <ScrollView contentContainerStyle={styles.singleScreenContent}>
        <ScreenHeader
          eyebrow="DAILY QUIZ"
          title="Today’s practice"
          subtitle="A little review each day makes words stick."
        />
        <EmptyPractice
          icon="help-circle-outline"
          label="Add a word to unlock your daily quiz."
        />
      </ScrollView>
    );
  }

  if (finishedScore !== null) {
    return (
      <ScrollView contentContainerStyle={styles.singleScreenContent}>
        <ScreenHeader
          eyebrow="DAILY QUIZ"
          title={finishedWasDailyRetry ? 'Daily score refreshed!' : 'Practice complete!'}
          subtitle="You gave your brain a useful workout."
        />
        <QuizComplete
          score={finishedScore}
          total={finishedTotal ?? quiz.length}
          mode={isPracticeRound ? 'practice' : 'daily'}
          bonusXp={finishedBonusXp}
        />
        <Text style={styles.quizPracticeNote}>
          {finishedWasDailyRetry
            ? 'Your best daily score is safely kept on record.'
            : isPracticeRound
            ? 'Practice did not replace today’s daily score. It still counted as real review.'
            : 'Practice again anytime to keep learning.'}
        </Text>
        {quizSetupControls}
        {omegaTestCard}
        {quizScopeControls}
        <Pressable
          disabled={!quizPreferences.enabled || activeQuizWords.length === 0}
          onPress={() => startQuiz()}
          style={({ pressed }) => [
            styles.quizPracticeButton,
            (!quizPreferences.enabled || activeQuizWords.length === 0) && styles.practiceButtonDisabled,
            pressed && styles.pressed,
          ]}
        >
          <Ionicons name="refresh" size={18} color={COLORS.blue} />
          <Text style={styles.quizPracticeButtonText}>
            PRACTICE ANOTHER QUIZ
          </Text>
        </Pressable>
      </ScrollView>
    );
  }

  if (quiz.length === 0) {
    return (
      <ScrollView contentContainerStyle={styles.singleScreenContent}>
        <ScreenHeader
          eyebrow="DAILY QUIZ"
          title="Today’s practice"
          subtitle="A little review each day makes words stick."
        />
        <View style={styles.quizIntroCard}>
          <View style={styles.quizIllustration}>
            <Ionicons name="trophy" size={48} color={COLORS.yellow} />
            <View style={styles.sparkleOne}>
              <Ionicons name="sparkles" size={20} color={COLORS.purple} />
            </View>
            <View style={styles.sparkleTwo}>
              <Ionicons name="star" size={18} color={COLORS.blue} />
            </View>
          </View>
          <Text style={styles.quizIntroTitle}>Ready for today’s challenge?</Text>
          <Text style={styles.quizIntroText}>
            {!quizPreferences.enabled
              ? 'Quizzes are paused. Turn Quiz learning back on whenever you want a focused retrieval session.'
              : sessionMode === 'omega-test' && !omegaTestAvailable
                ? 'Omega Tests unlock every seven days so each score can reflect real retention over time.'
              : sessionMode === 'mastery-test' && activeQuizWords.length === 0
                ? 'Build a few strong words first. Mastery Tests are for words that are ready for direct recall.'
              : sessionMode === 'mistake-review' && activeQuizWords.length === 0
                ? 'No missed or slow answers need a focused review right now. Try a Standard or Quick session instead.'
              : selectedCategory === 'new'
              ? 'Start with your newest words. They will move into Learning after this completed practice.'
              : 'Choose a session, then WordWiz builds a fresh mix that matches your difficulty.'}
          </Text>
          <View style={styles.quizFacts}>
            <QuizFact icon="time-outline" text="About 1 minute" />
            <QuizFact
              icon="help-circle-outline"
              text={`${categoryQuizQuestionCount} questions`}
            />
          </View>
          {quizSetupControls}
          {omegaTestCard}
          {quizScopeControls}
          <View
            style={[
              styles.practiceCategoryBanner,
              styles.quizReadyBanner,
              { backgroundColor: selectedCategoryDetails.pale },
            ]}
          >
            <Ionicons
              name={selectedCategoryDetails.icon}
              size={17}
              color={selectedCategoryDetails.color}
            />
            <Text
              style={[
                styles.practiceCategoryBannerText,
                { color: selectedCategoryDetails.color },
              ]}
            >
              {activeQuizWords.length} {sessionMode === 'omega-test'
                ? 'saved words · two prompts each'
                : sessionMode === 'mastery-test'
                  ? 'strong words ready for recall'
                  : `${selectedCategoryDetails.shortLabel.toLowerCase()} words ready`}
            </Text>
          </View>
          <Pressable
            disabled={!quizPreferences.enabled || activeQuizWords.length === 0 || (sessionMode === 'omega-test' && !omegaTestAvailable)}
            onPress={() => startQuiz()}
            style={({ pressed }) => [
              styles.primaryButton,
              (!quizPreferences.enabled || activeQuizWords.length === 0 || (sessionMode === 'omega-test' && !omegaTestAvailable)) && styles.primaryButtonDisabled,
              pressed && styles.primaryButtonPressed,
            ]}
          >
            <Text style={styles.primaryButtonText}>
              {quizPreferences.enabled
                ? dailyRefreshActive
                  ? 'RETRY DAILY SCORE'
                  : sessionMode === 'omega-test'
                  ? 'START OMEGA TEST'
                  : sessionMode === 'standard'
                    ? 'START QUIZ'
                    : `START ${getQuizSessionLabel(sessionMode).toUpperCase()} QUIZ`
                : 'QUIZZES PAUSED'}
            </Text>
            <Ionicons name="arrow-forward" size={21} color={COLORS.white} />
          </Pressable>
        </View>
      </ScrollView>
    );
  }

  const question = quiz[questionIndex];
  const questionsLeft = Math.max(0, quiz.length - questionIndex - 1);
  const isQuestionStatement = question.mode !== 'word-to-definition';
  const selectedEvaluation = evaluateQuizAnswer(
    question.answer,
    selected,
    question.mode,
    question.strictSpelling,
  );
  const selectedIsCorrect = selectedEvaluation.correct;
  const selectedHasSpellingNote = selectedEvaluation.hasSpellingNote;
  const selectedTimedOut = selected === TIMED_OUT_ANSWER;
  const typedHint =
    question.mode === 'typed-word'
      ? getTypedRecallHint(question.word, hintStep)
      : null;
  const allowsHints =
    sessionMode !== 'challenge' &&
    sessionMode !== 'mastery-test' &&
    sessionMode !== 'omega-test' &&
    quizPreferences.difficulty !== 'ultra';
  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.quizContent}
      showsVerticalScrollIndicator={false}
    >
      <ScreenHeader
        eyebrow={sessionMode === 'omega-test' ? 'OMEGA TEST' : 'DAILY QUIZ'}
        title="Answer the prompt"
        subtitle={`Question ${questionIndex + 1} of ${quiz.length}`}
        action={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Exit quiz"
            accessibilityHint="Save your place or end this quiz"
            onPress={confirmExitQuiz}
            style={({ pressed }) => [
              styles.quizExitButton,
              pressed && styles.pressed,
            ]}
          >
            <Ionicons name="close" size={21} color={COLORS.purpleDark} />
          </Pressable>
        }
      />
      <View style={styles.quizProgressTrack}>
        <ProgressFill
          color={COLORS.orange}
          progress={((questionIndex + 1) / quiz.length) * 100}
          radius={6}
          style={{ width: `${((questionIndex + 1) / quiz.length) * 100}%` }}
        />
      </View>

      {timedQuestionActive ? (
        <View
          style={[
            styles.timedQuestionTimer,
            secondsRemaining <= 5 && styles.timedQuestionTimerUrgent,
          ]}
        >
          <View style={styles.timedQuestionTimerCopy}>
            <Ionicons name="timer-outline" size={17} color={COLORS.purpleDark} />
            <Text style={styles.timedQuestionTimerLabel}>
              {sessionMode === 'quick' ? 'QUICK TIMER' : 'FLUENCY TIMER'}
            </Text>
            <Text style={styles.timedQuestionTimerXp}>UP TO +5 XP</Text>
          </View>
          <Text style={styles.timedQuestionTimerValue}>{secondsRemaining}s</Text>
          <View style={styles.timedQuestionTimerTrack}>
            <ProgressFill
              color={COLORS.purple}
              progress={(secondsRemaining / activeTimeLimitSeconds) * 100}
              radius={4}
              style={{ width: `${(secondsRemaining / activeTimeLimitSeconds) * 100}%` }}
            />
          </View>
        </View>
      ) : null}

      <View style={styles.questionCard}>
        <Text style={styles.questionPrompt}>{question.prompt}</Text>
        <Text
          adjustsFontSizeToFit
          minimumFontScale={0.62}
          style={[
            styles.questionWord,
            isQuestionStatement && styles.questionStatement,
            isQuestionStatement &&
              question.displayText.length > 120 &&
              styles.questionStatementLong,
            isQuestionStatement &&
              question.displayText.length > 190 &&
              styles.questionStatementExtraLong,
            !isQuestionStatement &&
              question.displayText.length > 16 &&
              styles.questionWordLong,
            !isQuestionStatement &&
              question.displayText.length > 26 &&
              styles.questionWordExtraLong,
          ]}
        >
          {question.displayText}
        </Text>
      </View>

      <View style={styles.quizFlagActionRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            question.word.isFlagged
              ? 'Remove word from flagged words'
              : 'Flag word'
          }
          accessibilityState={{ selected: question.word.isFlagged }}
          onPress={() => onToggleFlag(question.word.id)}
          style={({ pressed }) => [
            styles.quizFlagButton,
            question.word.isFlagged && styles.quizFlagButtonActive,
            pressed && styles.pressed,
          ]}
        >
          <Ionicons
            name={question.word.isFlagged ? 'bookmark' : 'bookmark-outline'}
            size={16}
            color={question.word.isFlagged ? COLORS.purpleDark : COLORS.muted}
          />
          <Text
            style={[
              styles.quizFlagButtonText,
              question.word.isFlagged && styles.quizFlagButtonTextActive,
            ]}
          >
            {question.word.isFlagged
              ? formatWordFlaggedDate(question.word.flaggedAt).toUpperCase()
              : 'FLAG WORD'}
          </Text>
        </Pressable>
      </View>

      <View style={styles.quizFocusCard}>
        <View style={styles.quizFocusItem}>
          <Ionicons name="checkmark-circle-outline" size={18} color={COLORS.greenDark} />
          <Text style={styles.quizFocusText}>
            {score} correct
          </Text>
        </View>
        <View style={styles.quizFocusDivider} />
        <View style={styles.quizFocusItem}>
          <Ionicons name="flag-outline" size={18} color={COLORS.purpleDark} />
          <Text style={styles.quizFocusText}>
            {questionsLeft} {questionsLeft === 1 ? 'question' : 'questions'} left
          </Text>
        </View>
        <View style={styles.quizHintRow}>
          <Ionicons name="bulb-outline" size={17} color={COLORS.orange} />
          <Text style={styles.quizHintText}>{question.helperText}</Text>
        </View>
      </View>

      {question.mode === 'typed-word' ? (
        <View style={styles.typedAnswerArea}>
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            editable={!selected}
            onChangeText={setTypedResponse}
            onSubmitEditing={submitTypedAnswer}
            placeholder="Type the word"
            placeholderTextColor={COLORS.muted}
            returnKeyType="done"
            style={styles.typedAnswerInput}
            value={typedResponse}
          />
          {!selected ? (
            <>
              {allowsHints && typedHint ? (
                <View style={styles.typedHintCard}>
                  <Ionicons name="bulb" size={16} color={COLORS.orange} />
                  <Text style={styles.typedHintText}>{typedHint}</Text>
                </View>
              ) : null}
              <View style={styles.typedActionRow}>
                {allowsHints ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={hintStep >= 3 ? 'Show answer' : 'Show hint'}
                  onPress={() => {
                    if (hintStep >= 3) {
                      revealTypedAnswer();
                      return;
                    }
                    setHintStep((current) => current + 1);
                  }}
                  style={({ pressed }) => [
                    styles.typedHintButton,
                    pressed && styles.pressed,
                  ]}
                >
                  <Ionicons
                    name={hintStep >= 3 ? 'eye-outline' : 'bulb-outline'}
                    size={17}
                    color={COLORS.purpleDark}
                  />
                  <Text style={styles.typedHintButtonText}>
                    {hintStep >= 3
                      ? 'SHOW ANSWER'
                      : hintStep
                        ? 'NEXT HINT'
                        : 'HINT'}
                  </Text>
                </Pressable>
                ) : null}
                <Pressable
                  disabled={!typedResponse.trim()}
                  onPress={submitTypedAnswer}
                  style={({ pressed }) => [
                    styles.typedAnswerButton,
                    !typedResponse.trim() && styles.primaryButtonDisabled,
                    pressed && typedResponse.trim() && styles.pressed,
                  ]}
                >
                  <Text style={styles.typedAnswerButtonText}>CHECK ANSWER</Text>
                </Pressable>
              </View>
            </>
          ) : null}
        </View>
      ) : (
      <View style={styles.optionsList}>
        {question.options.map((option, index) => {
          const isAnswer = option === question.answer;
          const isSelected = option === selected;
          const showCorrect = Boolean(selected) && isAnswer;
          const showWrong = Boolean(selected) && isSelected && !isAnswer;
          return (
            <Pressable
              key={option}
              onPress={() => chooseAnswer(option)}
              style={({ pressed }) => [
                styles.optionButton,
                showCorrect && styles.optionCorrect,
                showWrong && styles.optionWrong,
                pressed && !selected && styles.pressed,
              ]}
            >
              <View
                style={[
                  styles.optionLetter,
                  showCorrect && styles.optionLetterCorrect,
                  showWrong && styles.optionLetterWrong,
                ]}
              >
                {showCorrect || showWrong ? (
                  <Ionicons
                    name={showCorrect ? 'checkmark' : 'close'}
                    size={18}
                    color={COLORS.white}
                  />
                ) : (
                  <Text style={styles.optionLetterText}>
                    {String.fromCharCode(65 + index)}
                  </Text>
                )}
              </View>
              <Text style={styles.optionText}>{option}</Text>
            </Pressable>
          );
        })}
      </View>
      )}

      {selected && (
        <View
          style={[
            styles.feedbackBox,
            selectedIsCorrect
              ? styles.feedbackCorrect
              : styles.feedbackWrong,
          ]}
        >
          <Ionicons
            name={
              selectedIsCorrect
                ? selectedHasSpellingNote
                  ? 'flag'
                  : 'checkmark-circle'
                : 'heart-outline'
            }
            size={23}
            color={
              selectedIsCorrect
                ? selectedHasSpellingNote
                  ? COLORS.orange
                  : COLORS.greenDark
                : COLORS.red
            }
          />
          <View style={styles.feedbackCopy}>
            <Text style={styles.feedbackTitle}>
              {selectedTimedOut
                ? 'Time’s up!'
                : selectedIsCorrect
                ? selectedHasSpellingNote
                  ? 'Almost perfect!'
                  : 'Nicely done!'
                : 'Keep learning!'}
            </Text>
            <Text style={styles.feedbackText}>
              {selectedTimedOut
                ? 'No mastery penalty — timed learning is a fun fluency challenge.'
                : selectedIsCorrect
                ? selectedHasSpellingNote
                  ? 'You recalled the word — here is its spelling to remember.'
                  : 'You matched it perfectly.'
                : question.feedback}
            </Text>
            {selectedHasSpellingNote ? (
              <View style={styles.spellingNote}>
                <Ionicons name="flag" size={13} color={COLORS.orange} />
                <Text style={styles.spellingNoteText}>
                  Correct spelling: {question.answer}
                </Text>
              </View>
            ) : null}
            {selectedIsCorrect ? (
              <View style={styles.reviewRatingArea}>
                <Text style={styles.reviewRatingLabel}>How did that feel?</Text>
                <Text style={styles.reviewRatingHint}>
                  Your choice helps choose the best time to review this word again.
                </Text>
                <View style={styles.reviewRatingRow}>
                  {([
                    ['hard', 'Hard'],
                    ['correct', 'Got it'],
                    ['easy', 'Easy'],
                  ] as const).map(([rating, label]) => (
                    <Pressable
                      key={rating}
                      accessibilityRole="button"
                      accessibilityState={{ selected: reviewRating === rating }}
                      onPress={() => setReviewRating(rating)}
                      style={[
                        styles.reviewRatingButton,
                        reviewRating === rating && styles.reviewRatingButtonActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.reviewRatingButtonText,
                          reviewRating === rating && styles.reviewRatingButtonTextActive,
                        ]}
                      >
                        {label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : null}
          </View>
        </View>
      )}

      {selected ? (
        <Pressable
          onPress={nextQuestion}
          style={({ pressed }) => [
            styles.primaryButton,
            pressed && styles.primaryButtonPressed,
          ]}
        >
          <Text style={styles.primaryButtonText}>
            {questionIndex === quiz.length - 1 ? 'SEE RESULTS' : 'CONTINUE'}
          </Text>
          <Ionicons name="arrow-forward" size={21} color={COLORS.white} />
        </Pressable>
      ) : null}
    </ScrollView>
  );
}
