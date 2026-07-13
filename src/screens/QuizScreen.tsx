import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, Text, View } from 'react-native';
import { COLORS } from '../constants/theme';
import type { AnalyticsData, LegalPage, QuizAnswer, QuizProgress, QuizQuestion, ReminderSettings, SortMode, Word } from '../types';
import { styles } from '../styles';
import { buildQuiz, calculateStreakStats, formatReminderTime, formatStudyTime, getDayKey, getRecentDays, getStreakMessage, getStreakWeek, getWordMastery, getWordMasteryCategoryId, shuffle, WORD_MASTERY_CATEGORIES, type WordMasteryCategoryId } from '../utils';
import { DashboardSection, DashboardStat, EmptyPractice, HomeAction, HomeMiniCard, LegalLink, LevelRow, QuizComplete, QuizFact, ReminderTimeButton, ScreenHeader, StreakDay, WordInfoPanel, WordRow, SortButton } from '../components';
import { reportError, trackEvent } from '../services';

export function QuizScreen({
  words,
  analytics,
  progress,
  onComplete,
  onReviewCards,
}: {
  words: Word[];
  analytics: AnalyticsData;
  progress: QuizProgress | null;
  onComplete: (
    score: number,
    total: number,
    durationSeconds: number,
    answers: QuizAnswer[],
  ) => Promise<void>;
  onReviewCards: () => void;
}) {
  const [quiz, setQuiz] = useState<QuizQuestion[]>([]);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const [finishedScore, setFinishedScore] = useState<number | null>(null);
  const [answers, setAnswers] = useState<QuizAnswer[]>([]);
  const [quizStartedAt, setQuizStartedAt] = useState(Date.now());
  const [isPracticeRound, setIsPracticeRound] = useState(false);
  const [selectedCategory, setSelectedCategory] =
    useState<WordMasteryCategoryId>('all');
  const wordMastery = useMemo(
    () =>
      words.map((word) => ({
        word,
        categoryId: getWordMasteryCategoryId(getWordMastery(word, analytics)),
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
  const filteredQuizWords = useMemo(
    () =>
      selectedCategory === 'all'
        ? words
        : wordMastery
            .filter((item) => item.categoryId === selectedCategory)
            .map((item) => item.word),
    [selectedCategory, wordMastery, words],
  );
  const selectedCategoryDetails =
    WORD_MASTERY_CATEGORIES.find(
      (category) => category.id === selectedCategory,
    ) ?? WORD_MASTERY_CATEGORIES[0];
  const canChangeCategory = quiz.length === 0 || finishedScore !== null;

  const categorySelector = (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.practiceCategoryList}
      style={styles.practiceCategoryScroller}
    >
      {WORD_MASTERY_CATEGORIES.map((category) => {
        const isActive = selectedCategory === category.id;
        const count = categoryCounts[category.id] ?? 0;

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

    setQuiz(buildQuiz(filteredQuizWords, analytics.quizHistory));
    setQuestionIndex(0);
    setSelected(null);
    setScore(0);
    setFinishedScore(null);
    setAnswers([]);
    setQuizStartedAt(Date.now());
    setIsPracticeRound(Boolean(progress));
    trackEvent('quiz_started', {
      category: selectedCategory,
      questions: Math.min(filteredQuizWords.length, 10),
    });
  }

  function chooseAnswer(option: string) {
    if (selected) return;
    const question = quiz[questionIndex];
    setSelected(option);
    const correct = option === question.answer;
    if (correct) setScore((current) => current + 1);
    setAnswers((current) => [
      ...current,
      { wordId: question.word.id, correct },
    ]);
  }

  async function nextQuestion() {
    if (!selected) {
      return;
    }

    const question = quiz[questionIndex];
    const currentAnswer = {
      wordId: question.word.id,
      correct: selected === question.answer,
    };
    const completedAnswers = answers.some(
      (answer) => answer.wordId === currentAnswer.wordId,
    )
      ? answers
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
        <Pressable
          onPress={onReviewCards}
          style={({ pressed }) => [
            styles.quizFlashcardButton,
            pressed && styles.pressed,
          ]}
        >
          <Ionicons name="albums-outline" size={19} color={COLORS.greenDark} />
          <Text style={styles.quizFlashcardButtonText}>REVIEW FLASHCARDS</Text>
          <Ionicons name="arrow-forward" size={17} color={COLORS.greenDark} />
        </Pressable>
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
        <Pressable
          onPress={onReviewCards}
          style={({ pressed }) => [
            styles.quizFlashcardButton,
            pressed && styles.pressed,
          ]}
        >
          <Ionicons name="albums-outline" size={19} color={COLORS.greenDark} />
          <Text style={styles.quizFlashcardButtonText}>REVIEW FLASHCARDS</Text>
          <Ionicons name="arrow-forward" size={17} color={COLORS.greenDark} />
        </Pressable>
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
            You’ll answer a fresh mix of meaning, word match, and true or
            false questions. It only takes a minute.
          </Text>
          <View style={styles.quizFacts}>
            <QuizFact icon="time-outline" text="About 1 minute" />
            <QuizFact
              icon="help-circle-outline"
              text={`${Math.min(filteredQuizWords.length, 10)} questions`}
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
            question.mode !== 'word-to-definition' && styles.questionStatement,
          ]}
        >
          {question.displayText}
        </Text>
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

      {selected && (
        <View
          style={[
            styles.feedbackBox,
            selected === question.answer
              ? styles.feedbackCorrect
              : styles.feedbackWrong,
          ]}
        >
          <Ionicons
            name={
              selected === question.answer
                ? 'checkmark-circle'
                : 'heart-outline'
            }
            size={23}
            color={
              selected === question.answer ? COLORS.greenDark : COLORS.red
            }
          />
          <View style={styles.feedbackCopy}>
            <Text style={styles.feedbackTitle}>
              {selected === question.answer ? 'Nicely done!' : 'Keep learning!'}
            </Text>
            <Text style={styles.feedbackText}>
              {selected === question.answer
                ? 'You matched it perfectly.'
                : question.feedback}
            </Text>
          </View>
        </View>
      )}

      <Pressable
        disabled={!selected}
        onPress={nextQuestion}
        style={({ pressed }) => [
          styles.primaryButton,
          !selected && styles.primaryButtonDisabled,
          pressed && selected && styles.primaryButtonPressed,
        ]}
      >
        <Text style={styles.primaryButtonText}>
          {questionIndex === quiz.length - 1 ? 'SEE RESULTS' : 'CONTINUE'}
        </Text>
        <Ionicons name="arrow-forward" size={21} color={COLORS.white} />
      </Pressable>
    </ScrollView>
  );
}
