import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { COLORS } from '../constants/theme';
import type { AnalyticsData, LegalPage, QuizAnswer, QuizProgress, QuizQuestion, ReminderSettings, ReviewRating, SortMode, Word } from '../types';
import { styles } from '../styles';
import { buildCategoryPracticeQuiz, buildQuiz, calculateStreakStats, evaluateQuizAnswer, formatReminderTime, formatStudyTime, formatWordFlaggedDate, getCategoryPracticeQuizTarget, getDayKey, getNewStudyWords, getRecentDays, getStreakMessage, getStreakWeek, getTypedRecallHint, getWordMastery, getWordMasteryCategoryForWord, NEW_STUDY_GROUP, shuffle, WORD_MASTERY_CATEGORIES, type WordMasteryCategoryId } from '../utils';
import { DashboardSection, DashboardStat, EmptyPractice, HomeAction, HomeMiniCard, LegalLink, LevelRow, QuizComplete, QuizFact, ReminderTimeButton, ScreenHeader, StreakDay, WordInfoPanel, WordRow, SortButton } from '../components';
import { reportError, trackEvent } from '../services';

const REVEALED_TYPED_ANSWER = '__wordwiz-revealed-answer__';
type QuizStudyGroupId = WordMasteryCategoryId | 'new' | 'flagged';

const FLAGGED_STUDY_GROUP = {
  id: 'flagged' as const,
  label: 'Flagged Words',
  shortLabel: 'Flagged',
  icon: 'bookmark' as const,
  color: COLORS.purpleDark,
  pale: COLORS.purplePale,
};

export function QuizScreen({
  words,
  analytics,
  progress,
  priorityWordIds = [],
  initialStudyGroup,
  onComplete,
  onReviewCards,
  onToggleFlag,
}: {
  words: Word[];
  analytics: AnalyticsData;
  progress: QuizProgress | null;
  priorityWordIds?: string[];
  initialStudyGroup?: 'flagged';
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
  const [isPracticeRound, setIsPracticeRound] = useState(false);
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
    selectedCategory === 'all'
      ? Math.min(filteredQuizWords.length, 10)
      : getCategoryPracticeQuizTarget(filteredQuizWords.length);
  const canChangeCategory = quiz.length === 0 || finishedScore !== null;

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
    if (filteredQuizWords.length === 0) {
      return;
    }

    const masteryByWordId = Object.fromEntries(
      filteredQuizWords.map((word) => [
        word.id,
        getWordMastery(word, analytics),
      ]),
    );
    const nextQuiz =
      selectedCategory === 'all'
        ? buildQuiz(
            filteredQuizWords,
            analytics.quizHistory,
            masteryByWordId,
            priorityWordIds,
          )
        : buildCategoryPracticeQuiz(
            filteredQuizWords,
            analytics.quizHistory,
            masteryByWordId,
            priorityWordIds,
          );

    setQuiz(nextQuiz);
    setQuestionIndex(0);
    setSelected(null);
    setTypedResponse('');
    setHintStep(0);
    setReviewRating('correct');
    setScore(0);
    setFinishedScore(null);
    setAnswers([]);
    setQuizStartedAt(Date.now());
    setIsPracticeRound(Boolean(progress));
    trackEvent('quiz_started', {
      category: selectedCategory,
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
    ).correct;
    if (correct) setScore((current) => current + 1);
    setAnswers((current) => [
      ...current,
      {
        wordId: question.word.id,
        correct,
        difficulty: question.difficulty,
        answeredAt: new Date().toISOString(),
        reviewRating: correct ? 'correct' : undefined,
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
    );
    const currentAnswer = {
      wordId: question.word.id,
      correct: evaluation.correct,
      difficulty: question.difficulty,
      answeredAt: new Date().toISOString(),
      reviewRating: evaluation.correct ? reviewRating : undefined,
    };
    const completedAnswers = answers.some(
      (answer) => answer.wordId === currentAnswer.wordId,
    )
      ? answers.map((answer) =>
          answer.wordId === currentAnswer.wordId && answer.correct
            ? { ...answer, reviewRating }
            : answer,
        )
      : [...answers, currentAnswer];
    const finalScore = completedAnswers.filter((answer) => answer.correct).length;
    if (questionIndex === quiz.length - 1) {
      const durationSeconds = Math.max(
        1,
        Math.round((Date.now() - quizStartedAt) / 1000),
      );
      setFinishedScore(finalScore);
      try {
        await onComplete(finalScore, quiz.length, durationSeconds, completedAnswers);
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
  }

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
        <Pressable
          disabled={filteredQuizWords.length === 0}
          onPress={startQuiz}
          style={({ pressed }) => [
            styles.quizPracticeButton,
            filteredQuizWords.length === 0 && styles.practiceButtonDisabled,
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
          total={quiz.length}
          mode={isPracticeRound ? 'practice' : 'daily'}
        />
        <Text style={styles.quizPracticeNote}>
          {isPracticeRound
            ? 'Practice did not replace today’s daily score. It still counted as real review.'
            : 'Practice again anytime to keep learning.'}
        </Text>
        {categorySelector}
        <Pressable
          disabled={filteredQuizWords.length === 0}
          onPress={startQuiz}
          style={({ pressed }) => [
            styles.quizPracticeButton,
            filteredQuizWords.length === 0 && styles.practiceButtonDisabled,
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
            {selectedCategory === 'new'
              ? 'Start with your newest words. They will move into Learning after this completed practice.'
              : 'You’ll answer a fresh mix of meanings, synonyms, sentence context, and recall questions. It only takes a minute.'}
          </Text>
          <View style={styles.quizFacts}>
            <QuizFact icon="time-outline" text="About 1 minute" />
            <QuizFact
              icon="help-circle-outline"
              text={`${categoryQuizQuestionCount} questions`}
            />
          </View>
          {categorySelector}
          <View
            style={[
              styles.practiceCategoryBanner,
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
              {filteredQuizWords.length} {selectedCategoryDetails.shortLabel.toLowerCase()} words ready
            </Text>
          </View>
          <Pressable
            disabled={filteredQuizWords.length === 0}
            onPress={startQuiz}
            style={({ pressed }) => [
              styles.primaryButton,
              filteredQuizWords.length === 0 && styles.primaryButtonDisabled,
              pressed && styles.primaryButtonPressed,
            ]}
          >
            <Text style={styles.primaryButtonText}>START QUIZ</Text>
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
  );
  const selectedIsCorrect = selectedEvaluation.correct;
  const selectedHasSpellingNote = selectedEvaluation.hasSpellingNote;
  const typedHint =
    question.mode === 'typed-word'
      ? getTypedRecallHint(question.word, hintStep)
      : null;
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
        <View
          style={[
            styles.quizProgressFill,
            { width: `${((questionIndex + 1) / quiz.length) * 100}%` },
          ]}
        />
      </View>

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
              {typedHint ? (
                <View style={styles.typedHintCard}>
                  <Ionicons name="bulb" size={16} color={COLORS.orange} />
                  <Text style={styles.typedHintText}>{typedHint}</Text>
                </View>
              ) : null}
              <View style={styles.typedActionRow}>
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
              {selectedIsCorrect
                ? selectedHasSpellingNote
                  ? 'Almost perfect!'
                  : 'Nicely done!'
                : 'Keep learning!'}
            </Text>
            <Text style={styles.feedbackText}>
              {selectedIsCorrect
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
