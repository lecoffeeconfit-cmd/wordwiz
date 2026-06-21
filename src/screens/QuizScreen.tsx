import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, Text, View } from 'react-native';
import { COLORS } from '../constants/theme';
import type { AnalyticsData, LegalPage, QuizAnswer, QuizProgress, QuizQuestion, ReminderSettings, SortMode, Word } from '../types';
import { styles } from '../styles';
import { buildQuiz, calculateStreakStats, formatReminderTime, formatStudyTime, getDayKey, getRecentDays, getStreakMessage, getStreakWeek, getWordMastery, shuffle } from '../utils';
import { DashboardSection, DashboardStat, EmptyPractice, HomeAction, HomeMiniCard, LegalLink, LevelRow, QuizComplete, QuizFact, ReminderTimeButton, ScreenHeader, StreakDay, WordInfoPanel, WordRow, SortButton } from '../components';

export function QuizScreen({
  words,
  progress,
  onComplete,
}: {
  words: Word[];
  progress: QuizProgress | null;
  onComplete: (
    score: number,
    total: number,
    durationSeconds: number,
    answers: QuizAnswer[],
  ) => Promise<void>;
}) {
  const [quiz, setQuiz] = useState<QuizQuestion[]>([]);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const [finishedScore, setFinishedScore] = useState<number | null>(null);
  const [answers, setAnswers] = useState<QuizAnswer[]>([]);
  const [quizStartedAt, setQuizStartedAt] = useState(Date.now());

  function startQuiz() {
    setQuiz(buildQuiz(words));
    setQuestionIndex(0);
    setSelected(null);
    setScore(0);
    setFinishedScore(null);
    setAnswers([]);
    setQuizStartedAt(Date.now());
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
    const finalScore = score;
    if (questionIndex === quiz.length - 1) {
      const durationSeconds = Math.max(
        1,
        Math.round((Date.now() - quizStartedAt) / 1000),
      );
      setFinishedScore(finalScore);
      await onComplete(finalScore, quiz.length, durationSeconds, answers);
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
        <QuizComplete score={finishedScore} total={quiz.length} />
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
            You’ll match up to 5 words with their meanings. It only takes a
            minute.
          </Text>
          <View style={styles.quizFacts}>
            <QuizFact icon="time-outline" text="About 1 minute" />
            <QuizFact
              icon="help-circle-outline"
              text={`${Math.min(words.length, 5)} questions`}
            />
          </View>
          <Pressable
            onPress={startQuiz}
            style={({ pressed }) => [
              styles.primaryButton,
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
  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.quizContent}
      showsVerticalScrollIndicator={false}
    >
      <ScreenHeader
        eyebrow="DAILY QUIZ"
        title="Choose the meaning"
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
        <Text style={styles.questionPrompt}>WHAT DOES THIS WORD MEAN?</Text>
        <Text style={styles.questionWord}>{question.word.term}</Text>
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
                : `“${question.word.term}” means ${question.answer.toLowerCase()}`}
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
