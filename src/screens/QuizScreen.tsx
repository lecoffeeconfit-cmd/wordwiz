import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { COLORS } from '../constants/theme';
import type { AnalyticsData, LegalPage, QuizAnswer, QuizPreferences, QuizProgress, QuizQuestion, QuizSessionMode, ReminderSettings, ReviewRating, SortMode, TimeBasedLearningSettings, Word } from '../types';
import { styles } from '../styles';
import { buildCategoryPracticeQuiz, buildQuiz, calculateStreakStats, evaluateQuizAnswer, formatReminderTime, formatStudyTime, formatWordFlaggedDate, getCategoryPracticeQuizTarget, getDayKey, getMistakeReviewWordIds, getNewStudyWords, getQuizRecallPaceSignal, getRecentDays, getStreakMessage, getStreakWeek, getTimeBasedLearningLimitSeconds, getTimedLearningBonusXp, getTypedRecallHint, getWordMastery, getWordMasteryCategoryForWord, NEW_STUDY_GROUP, normalizeTimeBasedLearningSettings, shuffle, TIMED_LEARNING_SECONDS, WORD_MASTERY_CATEGORIES, type WordMasteryCategoryId } from '../utils';
import { DashboardSection, DashboardStat, EmptyPractice, HomeAction, HomeMiniCard, LegalLink, LevelRow, ProgressFill, QuizComplete, QuizFact, ReminderTimeButton, ScreenHeader, StreakDay, WordInfoPanel, WordRow, SortButton } from '../components';
import { reportError, trackEvent } from '../services';

const REVEALED_TYPED_ANSWER = '__wordwiz-revealed-answer__';
const TIMED_OUT_ANSWER = '__wordwiz-timed-out__';
type QuizStudyGroupId = WordMasteryCategoryId | 'new' | 'flagged';

function getResponseTimeSeconds(questionStartedAt: number) {
  return Math.max(1, Math.round((Date.now() - questionStartedAt) / 1000));
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
  { id: 'quick', label: 'Quick', icon: 'flash-outline', description: '5–20 questions' },
  { id: 'challenge', label: 'Challenge', icon: 'flame-outline', description: 'No hints · 3 misses ends it' },
  { id: 'mistake-review', label: 'Mistake review', icon: 'refresh-outline', description: 'Missed and slow words' },
  { id: 'mastery-test', label: 'Mastery test', icon: 'ribbon-outline', description: 'Recall, no hints' },
];

function getQuizSessionLabel(sessionMode: QuizSessionMode) {
  return QUIZ_SESSION_OPTIONS.find((option) => option.id === sessionMode)?.label ?? 'Standard';
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
  onComplete,
  onReviewCards,
  onToggleFlag,
}: {
  words: Word[];
  analytics: AnalyticsData;
  progress: QuizProgress | null;
  priorityWordIds?: string[];
  initialStudyGroup?: 'flagged';
  timedLearningEnabled: boolean;
  timeBasedLearningSettings: TimeBasedLearningSettings;
  quizPreferences: QuizPreferences;
  onComplete: (
    score: number,
    total: number,
    durationSeconds: number,
    answers: QuizAnswer[],
  ) => Promise<void>;
  onReviewCards: () => void;
  onToggleFlag: (wordId: string) => void;
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
  const [sessionMode, setSessionMode] = useState<QuizSessionMode>('standard');
  const [quickQuestionCount, setQuickQuestionCount] = useState<5 | 10 | 20>(5);
  const [challengeMistakes, setChallengeMistakes] = useState(0);
  const [challengeCorrectStreak, setChallengeCorrectStreak] = useState(0);
  const [finishedTotal, setFinishedTotal] = useState<number | null>(null);
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
  const activeQuizWords =
    sessionMode === 'mastery-test'
      ? masteryTestWords
      : sessionMode === 'mistake-review'
        ? mistakeReviewWords
        : filteredQuizWords;
  const studyGroups = [
    WORD_MASTERY_CATEGORIES[0],
    NEW_STUDY_GROUP,
    ...WORD_MASTERY_CATEGORIES.slice(1),
    FLAGGED_STUDY_GROUP,
  ];
  const selectedCategoryDetails =
    studyGroups.find(
      (category) => category.id === selectedCategory,
    ) ?? WORD_MASTERY_CATEGORIES[0];
  const categoryQuizQuestionCount =
    sessionMode === 'quick'
      ? quickQuestionCount
      : sessionMode === 'mastery-test'
        ? Math.min(activeQuizWords.length, 10)
        : selectedCategory === 'all'
          ? Math.min(activeQuizWords.length, 10)
          : getCategoryPracticeQuizTarget(activeQuizWords.length);
  const canChangeCategory = quiz.length === 0 || finishedScore !== null;
  const activeQuestion = quiz[questionIndex];
  const normalizedTimeSettings = normalizeTimeBasedLearningSettings(
    timeBasedLearningSettings,
  );
  const activeTimeLimitSeconds = activeQuestion
    ? getTimeBasedLearningLimitSeconds(
        activeQuestion.difficulty,
        normalizedTimeSettings,
      )
    : TIMED_LEARNING_SECONDS;
  const timedQuestionActive = Boolean(
    activeQuestion &&
      timedLearningEnabled &&
      getWordMastery(activeQuestion.word, analytics) >= 80,
  );

  useEffect(() => {
    if (initialStudyGroup === 'flagged' && canChangeCategory) {
      setSelectedCategory('flagged');
    }
  }, [canChangeCategory, initialStudyGroup]);

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
            : categoryCounts[category.id] ?? 0;

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

  function startQuiz() {
    if (!quizPreferences.enabled || activeQuizWords.length === 0) {
      return;
    }

    const masteryByWordId = Object.fromEntries(
      activeQuizWords.map((word) => [
        word.id,
        getWordMastery(word, analytics),
      ]),
    );
    const sessionOptions = {
      difficulty: quizPreferences.difficulty,
      sessionMode,
      questionLimit:
        sessionMode === 'quick'
          ? quickQuestionCount
          : sessionMode === 'mistake-review'
            ? Math.min(10, Math.max(activeQuizWords.length, activeQuizWords.length * 2))
            : undefined,
    };
    const sessionPriorityWordIds = sessionMode === 'mistake-review'
      ? [
          ...mistakeReviewWordIds.filter((wordId) =>
            activeQuizWords.some((word) => word.id === wordId),
          ),
          ...priorityWordIds,
        ]
      : priorityWordIds;
    const nextQuiz =
      selectedCategory === 'all'
        ? buildQuiz(
            activeQuizWords,
            analytics.quizHistory,
            masteryByWordId,
            sessionPriorityWordIds,
            sessionOptions,
          )
        : buildCategoryPracticeQuiz(
            activeQuizWords,
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
    setAnswers([]);
    setChallengeMistakes(0);
    setChallengeCorrectStreak(0);
    setQuizStartedAt(Date.now());
    setQuestionStartedAt(Date.now());
    setSecondsRemaining(
      getTimeBasedLearningLimitSeconds(
        nextQuiz[0]?.difficulty,
        normalizedTimeSettings,
      ),
    );
    setFinishedBonusXp(0);
    setIsPracticeRound(Boolean(progress));
    trackEvent('quiz_started', {
      category: selectedCategory,
      mode: sessionMode,
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
      try {
        await onComplete(finalScore, completedAnswers.length, durationSeconds, completedAnswers);
      } catch (error) {
        reportError(error, { area: 'complete_quiz' });
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
      getTimeBasedLearningLimitSeconds(
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
              ? `${getQuizSessionLabel(sessionMode)} · tap to change`
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
                  onPress={() => setSessionMode(option.id)}
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

          {sessionMode === 'quick' ? (
            <View style={styles.quickLengthRow}>
              <Text style={styles.quizSetupLabel}>QUICK PRACTICE</Text>
              <View style={styles.quickLengthOptions}>
                {([5, 10, 20] as const).map((count) => (
                  <Pressable
                    key={count}
                    accessibilityRole="button"
                    accessibilityState={{ selected: quickQuestionCount === count }}
                    onPress={() => setQuickQuestionCount(count)}
                    style={({ pressed }) => [styles.quickLengthButton, quickQuestionCount === count && styles.quickLengthButtonActive, pressed && styles.pressed]}
                  >
                    <Text style={[styles.quickLengthText, quickQuestionCount === count && styles.quickLengthTextActive]}>{count}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}
        </>
      ) : null}
        </>
      ) : null}
    </View>
  );

  if (progress && quiz.length === 0) {
    return (
      <ScrollView contentContainerStyle={styles.singleScreenContent}>
        <ScreenHeader
          eyebrow="DAILY QUIZ"
          title="Today’s practice"
          subtitle="A little review each day makes words stick."
        />
        <QuizComplete score={progress.score} total={progress.total} />
        {categorySelector}
        {quizSetupControls}
        <Pressable
          disabled={!quizPreferences.enabled || activeQuizWords.length === 0}
          onPress={startQuiz}
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
        <Pressable
          onPress={onReviewCards}
          style={({ pressed }) => [
            styles.quizFlashcardButton,
            styles.quizFlashcardButtonPaired,
            pressed && styles.pressed,
          ]}
        >
          <Ionicons name="albums-outline" size={19} color={COLORS.greenDark} />
          <Text style={styles.quizFlashcardButtonText}>REVIEW FLASHCARDS</Text>
          <Ionicons name="arrow-forward" size={17} color={COLORS.greenDark} />
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
          title="Practice complete!"
          subtitle="You gave your brain a useful workout."
        />
        <QuizComplete
          score={finishedScore}
          total={finishedTotal ?? quiz.length}
          mode={isPracticeRound ? 'practice' : 'daily'}
          bonusXp={finishedBonusXp}
        />
        <Text style={styles.quizPracticeNote}>
          {isPracticeRound
            ? 'Practice did not replace today’s daily score. It still counted as real review.'
            : 'Practice again anytime to keep learning.'}
        </Text>
        {categorySelector}
        {quizSetupControls}
        <Pressable
          disabled={!quizPreferences.enabled || activeQuizWords.length === 0}
          onPress={startQuiz}
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
        <Pressable
          onPress={onReviewCards}
          style={({ pressed }) => [
            styles.quizFlashcardButton,
            styles.quizFlashcardButtonPaired,
            pressed && styles.pressed,
          ]}
        >
          <Ionicons name="albums-outline" size={19} color={COLORS.greenDark} />
          <Text style={styles.quizFlashcardButtonText}>REVIEW FLASHCARDS</Text>
          <Ionicons name="arrow-forward" size={17} color={COLORS.greenDark} />
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
          {categorySelector}
          {quizSetupControls}
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
              {activeQuizWords.length} {sessionMode === 'mastery-test' ? 'strong words ready for recall' : `${selectedCategoryDetails.shortLabel.toLowerCase()} words ready`}
            </Text>
          </View>
          <Pressable
            disabled={!quizPreferences.enabled || activeQuizWords.length === 0}
            onPress={startQuiz}
            style={({ pressed }) => [
              styles.primaryButton,
              (!quizPreferences.enabled || activeQuizWords.length === 0) && styles.primaryButtonDisabled,
              pressed && styles.primaryButtonPressed,
            ]}
          >
            <Text style={styles.primaryButtonText}>
              {quizPreferences.enabled ? 'START QUIZ' : 'QUIZZES PAUSED'}
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
    quizPreferences.difficulty !== 'ultra';
  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.quizContent}
      showsVerticalScrollIndicator={false}
    >
      <ScreenHeader
        eyebrow="DAILY QUIZ"
        title="Answer the prompt"
        subtitle={`Question ${questionIndex + 1} of ${quiz.length}`}
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
            <Text style={styles.timedQuestionTimerLabel}>FLUENCY TIMER</Text>
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
