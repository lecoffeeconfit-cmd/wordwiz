import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { COLORS, SOFT_SHADOW } from '../../constants/theme';
import type { GameAnswer, GameAttempt, GameType, Word } from '../../types';
import {
  createUuid,
  deterministicShuffle,
  getGameDateKey,
  getGameRoundWords,
  getGameWeekKey,
  getGameWords,
  getGameXp,
  getGameXpLabel,
  getTypedRecallHint,
} from '../../utils';

type GameFinish = (
  gameType: GameType,
  gameKey: string,
  answers: GameAnswer[],
  score: number,
  total: number,
  startedAt: number,
) => void;

type QuizGamesProps = {
  words: Word[];
  gameHistory: GameAttempt[];
  onComplete: (attempt: GameAttempt) => void | Promise<void>;
};

type GameDefinition = {
  type: GameType;
  title: string;
  description: string;
  teaches: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  pale: string;
  minimumWords: number;
  total: number;
};

const GAME_DEFINITIONS: GameDefinition[] = [
  {
    type: 'speed-match',
    title: 'Speed Match',
    description: 'Pair words with their meanings before the clock catches you.',
    teaches: 'Fast recognition',
    icon: 'flash-outline',
    color: '#4F78D8',
    pale: '#EAF2FF',
    minimumWords: 4,
    total: 4,
  },
  {
    type: 'fill-gap',
    title: 'Fill the Gap',
    description: 'Choose the word that makes a real sentence make sense.',
    teaches: 'Using words in context',
    icon: 'create-outline',
    color: '#2A9C79',
    pale: '#E5F8F0',
    minimumWords: 4,
    total: 5,
  },
  {
    type: 'word-connections',
    title: 'Word Connections',
    description: 'Find the synonym, antonym, or closest idea hiding nearby.',
    teaches: 'Deeper understanding',
    icon: 'git-compare-outline',
    color: '#8B65D9',
    pale: '#F0EAFF',
    minimumWords: 4,
    total: 5,
  },
  {
    type: 'crossword',
    title: 'Your Weekly Crossword',
    description: 'A weekly mini crossword built from your saved words.',
    teaches: 'Recall + spelling',
    icon: 'grid-outline',
    color: '#C17A2B',
    pale: '#FFF1D9',
    minimumWords: 3,
    total: 12,
  },
  {
    type: 'word-scramble',
    title: 'Word Scramble',
    description: 'Rebuild the word from its clue and a tangle of letters.',
    teaches: 'Spelling + recall',
    icon: 'shuffle-outline',
    color: '#D36B89',
    pale: '#FFE9F0',
    minimumWords: 4,
    total: 5,
  },
  {
    type: 'rapid-fire',
    title: 'Rapid Fire',
    description: 'You have 60 seconds to answer, repeat, and build a combo.',
    teaches: 'Speed + repetition',
    icon: 'timer-outline',
    color: '#D07B22',
    pale: '#FFF0D8',
    minimumWords: 2,
    total: 20,
  },
];

const GAME_BY_TYPE = Object.fromEntries(
  GAME_DEFINITIONS.map((definition) => [definition.type, definition]),
) as Record<GameType, GameDefinition>;

function normalizeWord(value: string) {
  return value.toLowerCase().replace(/[^a-z]/g, '');
}

function createGameKey(type: GameType, words: Word[]) {
  const periodKey = type === 'crossword' ? getGameWeekKey() : getGameDateKey();
  return `${periodKey}:${type}`;
}

function getExampleWithGap(word: Word) {
  const example = word.contextExamples?.find(Boolean) ?? word.example;
  const pattern = new RegExp(`\\b${word.term.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}\\b`, 'i');
  const replaced = example.replace(pattern, '_____');
  return replaced === example
    ? `Use the word that means: ${word.simpleDefinition ?? word.definition}`
    : replaced;
}

function getHintLevels(word: Word, answer = word.term) {
  const hintWord = answer === word.term ? word : { ...word, term: answer };
  return [1, 2, 3]
    .map((step) => getTypedRecallHint(hintWord, step))
    .filter((hint): hint is string => Boolean(hint));
}

function getHintButtonLabel(hintStep: number, hintCount: number) {
  if (hintStep === 0) return 'HINT';
  if (hintStep < hintCount) return 'NEXT HINT';
  return 'HIDE HINT';
}

function triggerGameHaptic(feedback: 'light' | 'success' | 'error') {
  const action = feedback === 'light'
    ? Haptics.selectionAsync()
    : Haptics.notificationAsync(
        feedback === 'success'
          ? Haptics.NotificationFeedbackType.Success
          : Haptics.NotificationFeedbackType.Error,
      );
  void action.catch(() => undefined);
}

function getOptions(correct: string, words: Word[], count = 3, seed = correct) {
  return deterministicShuffle([
    correct,
    ...deterministicShuffle(
      words.filter((word) => word.term !== correct).map((word) => word.term),
      `${seed}:distractors`,
    ).slice(0, count),
  ], `${seed}:options`);
}

function getPlayableGameWords(gameType: GameType, words: Word[]) {
  if (gameType === 'word-connections') {
    return words.filter(
      (word) => Boolean(
        word.synonyms?.some((item) => item.trim()) ||
        word.commonWords?.some((item) => item.trim()),
      ),
    );
  }

  if (gameType === 'crossword') {
    return words.filter((word) => crosswordLetters(word).length >= 3 && crosswordLetters(word).length <= 10);
  }

  return words;
}

function makeAnswer(
  gameType: GameType,
  gameKey: string,
  word: Word,
  correct: boolean,
  startedAt: number,
): GameAnswer {
  return {
    wordId: word.id,
    wordTerm: word.term,
    correct,
    gameType,
    gameKey,
    answeredAt: new Date().toISOString(),
    responseTimeSeconds: Math.max(1, Math.round((Date.now() - startedAt) / 1000)),
  };
}

export function QuizGames({ words, gameHistory, onComplete }: QuizGamesProps) {
  const [activeGame, setActiveGame] = useState<GameType | null>(null);
  const [result, setResult] = useState<GameAttempt | null>(null);
  const gameWords = useMemo(() => getGameWords(words), [words]);

  const finishGame: GameFinish = (gameType, gameKey, answers, score, total, startedAt) => {
    const recordedAnswers = answers.length
      ? answers
      : [{
          wordId: '__game-session__',
          correct: false,
          gameType,
          gameKey,
          answeredAt: new Date().toISOString(),
        }];
    const attempt: GameAttempt = {
      id: createUuid(),
      date: getGameDateKey(),
      gameType,
      gameKey,
      score,
      total,
      durationSeconds: Math.max(1, Math.round((Date.now() - startedAt) / 1000)),
      answers: recordedAnswers,
      completedAt: new Date().toISOString(),
      xpEarned: getGameXp({ gameType, gameKey, score, total }, gameHistory),
      completed: true,
    };
    setResult(attempt);
    void onComplete(attempt);
  };

  if (result) {
    return (
      <GameResult
        attempt={result}
        onBack={() => {
          setResult(null);
          setActiveGame(null);
        }}
        onPlayAgain={() => {
          setResult(null);
          setActiveGame(result.gameType);
        }}
      />
    );
  }

  if (activeGame) {
    const definition = GAME_BY_TYPE[activeGame];
    return (
      <View style={gameStyles.shell}>
        <View style={gameStyles.gameHeader}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back to games"
            onPress={() => setActiveGame(null)}
            style={({ pressed }) => [gameStyles.backButton, pressed && gameStyles.pressed]}
          >
            <Ionicons name="arrow-back" size={18} color={COLORS.purpleDark} />
          </Pressable>
          <View style={gameStyles.gameHeaderCopy}>
            <Text style={gameStyles.gameEyebrow}>GAME · {definition.teaches.toUpperCase()}</Text>
            <Text style={gameStyles.gameTitle}>{definition.title}</Text>
          </View>
          <View style={[gameStyles.gameHeaderIcon, { backgroundColor: definition.pale }]}>
            <Ionicons name={definition.icon} size={20} color={definition.color} />
          </View>
        </View>
        {activeGame === 'speed-match' ? (
          <SpeedMatchGame words={getPlayableGameWords(activeGame, gameWords)} onFinish={finishGame} />
        ) : activeGame === 'fill-gap' ? (
          <FillGapGame words={getPlayableGameWords(activeGame, gameWords)} onFinish={finishGame} />
        ) : activeGame === 'word-connections' ? (
          <WordConnectionsGame words={getPlayableGameWords(activeGame, gameWords)} onFinish={finishGame} />
        ) : activeGame === 'crossword' ? (
          <CrosswordGame words={getPlayableGameWords(activeGame, gameWords)} onFinish={finishGame} />
        ) : activeGame === 'word-scramble' ? (
          <WordScrambleGame words={getPlayableGameWords(activeGame, gameWords)} onFinish={finishGame} />
        ) : (
          <RapidFireGame words={getPlayableGameWords(activeGame, gameWords)} onFinish={finishGame} />
        )}
      </View>
    );
  }

  return (
    <View style={gameStyles.shell}>
      <View style={gameStyles.gameIntro}>
        <View style={gameStyles.gameIntroIcon}>
          <Ionicons name="game-controller-outline" size={25} color={COLORS.purpleDark} />
        </View>
        <View style={gameStyles.gameIntroCopy}>
          <Text style={gameStyles.gameIntroTitle}>Practice, but make it playful.</Text>
          <Text style={gameStyles.gameIntroText}>
            Every game uses your own words. Earn XP, build fluency, and keep quizzes focused on real recall.
          </Text>
        </View>
      </View>
      {gameWords.length < 2 ? (
        <View style={gameStyles.emptyCard}>
          <Ionicons name="sparkles-outline" size={24} color={COLORS.purple} />
          <Text style={gameStyles.emptyTitle}>Add a few words to unlock Games</Text>
          <Text style={gameStyles.emptyText}>Games become more useful once your WordWiz collection has at least two words.</Text>
        </View>
      ) : null}
      {GAME_DEFINITIONS.map((definition) => {
        const playableWords = getPlayableGameWords(definition.type, gameWords);
        const enoughWords = playableWords.length >= definition.minimumWords;
        const plays = gameHistory.filter((attempt) => attempt.gameType === definition.type);
        const latest = plays[0];
        return (
          <Pressable
            key={definition.type}
            accessibilityRole="button"
            accessibilityLabel={`Play ${definition.title}`}
            accessibilityHint={enoughWords ? definition.description : `Add ${definition.minimumWords - playableWords.length} more usable words to unlock this game`}
            disabled={!enoughWords}
            onPress={() => setActiveGame(definition.type)}
            style={({ pressed }) => [
              gameStyles.gameCard,
              !enoughWords && gameStyles.gameCardDisabled,
              pressed && enoughWords && gameStyles.gameCardPressed,
            ]}
          >
            <View style={[gameStyles.gameCardIcon, { backgroundColor: definition.pale }]}>
              <Ionicons name={definition.icon} size={23} color={definition.color} />
            </View>
            <View style={gameStyles.gameCardCopy}>
              <View style={gameStyles.gameCardTitleRow}>
                <Text style={gameStyles.gameCardTitle}>{definition.title}</Text>
                {latest ? <Text style={gameStyles.gameCardLast}>{latest.score}/{latest.total}</Text> : null}
              </View>
              <Text style={gameStyles.gameCardDescription}>{definition.description}</Text>
              <View style={gameStyles.gameCardMeta}>
                <Text style={[gameStyles.gameCardSkill, { color: definition.color }]}>{definition.teaches}</Text>
                <Text style={gameStyles.gameCardXp}>
                  {getGameXpLabel(
                    definition.type,
                    definition.type === 'crossword'
                      ? Math.min(definition.total, gameWords.length)
                      : definition.total,
                  )}
                </Text>
              </View>
            </View>
            <Ionicons name={enoughWords ? 'chevron-forward' : 'lock-closed-outline'} size={18} color={enoughWords ? COLORS.muted : '#B9B2CC'} />
          </Pressable>
        );
      })}
      <View style={gameStyles.gameNote}>
        <Ionicons name="shield-checkmark-outline" size={16} color={COLORS.greenDark} />
        <Text style={gameStyles.gameNoteText}>Games give lighter mastery evidence than quizzes, and replaying the same daily puzzle earns reduced XP.</Text>
      </View>
    </View>
  );
}

function GameResult({ attempt, onBack, onPlayAgain }: { attempt: GameAttempt; onBack: () => void; onPlayAgain: () => void }) {
  const definition = GAME_BY_TYPE[attempt.gameType];
  const perfect = attempt.score >= attempt.total && attempt.total > 0;
  const cardEntrance = useRef(new Animated.Value(0)).current;
  const iconScale = useRef(new Animated.Value(0.78)).current;

  useEffect(() => {
    triggerGameHaptic(perfect ? 'success' : 'light');
    cardEntrance.setValue(0);
    iconScale.setValue(0.78);
    const entrance = Animated.parallel([
      Animated.timing(cardEntrance, {
        toValue: 1,
        duration: 320,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.spring(iconScale, {
        toValue: 1,
        friction: 5,
        tension: 90,
        useNativeDriver: true,
      }),
    ]);
    entrance.start();
    return () => entrance.stop();
  }, [cardEntrance, iconScale, perfect]);

  return (
    <Animated.View
      style={[
        gameStyles.resultCard,
        {
          opacity: cardEntrance,
          transform: [{ translateY: cardEntrance.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }],
        },
      ]}
    >
      <Animated.View style={[gameStyles.resultIcon, { backgroundColor: definition.pale, transform: [{ scale: iconScale }] }]}>
        <Ionicons name={perfect ? 'trophy' : 'sparkles'} size={34} color={definition.color} />
      </Animated.View>
      <Text style={gameStyles.resultEyebrow}>{perfect ? 'PERFECT GAME' : 'ROUND COMPLETE'}</Text>
      <Text style={gameStyles.resultTitle}>{definition.title}</Text>
      <Text style={gameStyles.resultScore}>{attempt.score}<Text style={gameStyles.resultScoreMuted}>/{attempt.total}</Text></Text>
      <View style={gameStyles.resultXpPill}>
        <Ionicons name="flash" size={15} color={COLORS.orange} />
        <Text style={gameStyles.resultXpText}>+{attempt.xpEarned ?? 0} XP earned</Text>
      </View>
      <Text style={gameStyles.resultText}>
        {perfect ? 'Great work. That was useful practice for your vocabulary.' : 'Nice round. Keep going and these words will feel more natural.'}
      </Text>
      <Pressable onPress={onPlayAgain} style={({ pressed }) => [gameStyles.primaryButton, pressed && gameStyles.pressed]}>
        <Text style={gameStyles.primaryButtonText}>PLAY AGAIN</Text>
        <Ionicons name="refresh" size={18} color={COLORS.white} />
      </Pressable>
      <Pressable onPress={onBack} style={({ pressed }) => [gameStyles.secondaryButton, pressed && gameStyles.pressed]}>
        <Text style={gameStyles.secondaryButtonText}>BACK TO GAMES</Text>
      </Pressable>
    </Animated.View>
  );
}

function HintButton({
  visible,
  onPress,
  color = COLORS.orange,
  label,
}: {
  visible: boolean;
  onPress: () => void;
  color?: string;
  label?: string;
}) {
  const buttonLabel = label ?? (visible ? 'HIDE HINT' : 'HINT');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={buttonLabel.toLowerCase()}
      accessibilityState={{ expanded: visible }}
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => [gameStyles.hintButton, pressed && gameStyles.pressed]}
    >
      <Ionicons name={visible ? 'bulb' : 'bulb-outline'} size={14} color={color} />
      <Text style={[gameStyles.hintButtonText, { color }]}>{buttonLabel}</Text>
    </Pressable>
  );
}

function HintCard({ hint, color = COLORS.orange }: { hint: string; color?: string }) {
  const entrance = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    entrance.setValue(0);
    const animation = Animated.timing(entrance, {
      toValue: 1,
      duration: 180,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [entrance, hint]);

  return (
    <Animated.View
      style={[
        gameStyles.hintCard,
        {
          opacity: entrance,
          transform: [{ translateY: entrance.interpolate({ inputRange: [0, 1], outputRange: [-4, 0] }) }],
        },
      ]}
    >
      <Ionicons name="bulb" size={15} color={color} />
      <Text style={[gameStyles.hintText, { color }]}>{hint}</Text>
    </Animated.View>
  );
}

function GameFeedback({ text, correct }: { text: string; correct: boolean }) {
  const entrance = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    entrance.setValue(0);
    const animation = Animated.timing(entrance, {
      toValue: 1,
      duration: 180,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [entrance, text]);

  return (
    <Animated.Text
      style={[
        correct ? gameStyles.successText : gameStyles.errorText,
        {
          opacity: entrance,
          transform: [{ translateY: entrance.interpolate({ inputRange: [0, 1], outputRange: [4, 0] }) }],
        },
      ]}
    >
      {text}
    </Animated.Text>
  );
}

function GamePrompt({
  label,
  prompt,
  hints,
  hintKey,
  hintColor,
}: {
  label: string;
  prompt: string;
  hints?: string[];
  hintKey?: string | number;
  hintColor?: string;
}) {
  const [hintStep, setHintStep] = useState(0);
  const hintCount = hints?.length ?? 0;
  const visibleHint = hintStep > 0 ? hints?.[hintStep - 1] : null;
  const promptEntrance = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    setHintStep(0);
    promptEntrance.setValue(0);
    const animation = Animated.timing(promptEntrance, {
      toValue: 1,
      duration: 240,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [hintKey, prompt, promptEntrance]);

  return (
    <Animated.View
      style={[
        gameStyles.promptCard,
        {
          opacity: promptEntrance,
          transform: [{ translateY: promptEntrance.interpolate({ inputRange: [0, 1], outputRange: [6, 0] }) }],
        },
      ]}
    >
      <View style={gameStyles.promptHeader}>
        <Text style={gameStyles.promptLabel}>{label}</Text>
        {hintCount > 0 ? (
          <HintButton
            color={hintColor}
            label={getHintButtonLabel(hintStep, hintCount)}
            onPress={() => setHintStep((current) => current >= hintCount ? 0 : current + 1)}
            visible={hintStep > 0}
          />
        ) : null}
      </View>
      <Text style={gameStyles.promptText}>{prompt}</Text>
      {visibleHint ? <HintCard color={hintColor} hint={visibleHint} /> : null}
    </Animated.View>
  );
}

function GameProgress({ current, total, color = COLORS.purple }: { current: number; total: number; color?: string }) {
  const progress = Math.min(1, current / Math.max(1, total));
  const animatedProgress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.timing(animatedProgress, {
      toValue: progress,
      duration: 280,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    });
    animation.start();
    return () => animation.stop();
  }, [animatedProgress, progress]);

  return (
    <View style={gameStyles.progressWrap}>
      <View style={gameStyles.progressTrack}>
        <Animated.View style={[gameStyles.progressFill, { width: animatedProgress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }), backgroundColor: color }]} />
      </View>
      <Text style={gameStyles.progressText}>{current} / {total}</Text>
    </View>
  );
}

function OptionList({ options, selected, correct, onSelect }: { options: string[]; selected: string | null; correct: string; onSelect: (option: string) => void }) {
  return (
    <View style={gameStyles.options}>
      {options.map((option, index) => {
        const isSelected = selected === option;
        const isCorrect = selected !== null && option === correct;
        return (
          <Pressable
            key={`${option}-${index}`}
            disabled={selected !== null}
            onPress={() => onSelect(option)}
            style={({ pressed }) => [
              gameStyles.option,
              isCorrect && gameStyles.optionCorrect,
              isSelected && !isCorrect && gameStyles.optionWrong,
              pressed && selected === null && gameStyles.pressed,
            ]}
          >
            <View style={[gameStyles.optionLetter, isCorrect && gameStyles.optionLetterCorrect, isSelected && !isCorrect && gameStyles.optionLetterWrong]}>
              {isCorrect || (isSelected && !isCorrect) ? <Ionicons name={isCorrect ? 'checkmark' : 'close'} size={15} color={COLORS.white} /> : <Text style={gameStyles.optionLetterText}>{String.fromCharCode(65 + index)}</Text>}
            </View>
            <Text style={gameStyles.optionText}>{option}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function SpeedMatchGame({ words, onFinish }: { words: Word[]; onFinish: GameFinish }) {
  const roundWords = useMemo(() => getGameRoundWords('speed-match', words, 4), [words]);
  const startedAt = useRef(Date.now()).current;
  const gameKey = useMemo(() => createGameKey('speed-match', roundWords), [roundWords]);
  const [selectedWord, setSelectedWord] = useState<string | null>(null);
  const [selectedDefinition, setSelectedDefinition] = useState<string | null>(null);
  const [matched, setMatched] = useState<string[]>([]);
  const [wrong, setWrong] = useState(false);
  const answersRef = useRef<GameAnswer[]>([]);
  const finishScheduled = useRef(false);
  const wrongResetTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const definitions = useMemo(
    () => deterministicShuffle(roundWords, `${gameKey}:definitions`),
    [gameKey, roundWords],
  );
  const nextHintWord = roundWords.find((word) => !matched.includes(word.id));

  useEffect(() => () => {
    if (wrongResetTimeout.current) clearTimeout(wrongResetTimeout.current);
  }, []);

  useEffect(() => {
    if (!selectedWord || !selectedDefinition || wrong) return;
    const word = roundWords.find((item) => item.id === selectedWord);
    const definitionWord = roundWords.find((item) => item.id === selectedDefinition);
    if (!word || !definitionWord) return;
    const isCorrect = word.id === definitionWord.id;
    triggerGameHaptic(isCorrect ? 'success' : 'error');
    answersRef.current = [...answersRef.current, makeAnswer('speed-match', gameKey, word, isCorrect, startedAt)];
    if (isCorrect) {
      const nextMatched = [...matched, word.id];
      setMatched(nextMatched);
      setSelectedWord(null);
      setSelectedDefinition(null);
      if (nextMatched.length === roundWords.length && !finishScheduled.current) {
        finishScheduled.current = true;
        setTimeout(() => onFinish('speed-match', gameKey, answersRef.current, roundWords.length, roundWords.length, startedAt), 220);
      }
      return;
    }
    setWrong(true);
    if (wrongResetTimeout.current) clearTimeout(wrongResetTimeout.current);
    wrongResetTimeout.current = setTimeout(() => {
      wrongResetTimeout.current = null;
      setWrong(false);
      setSelectedWord(null);
      setSelectedDefinition(null);
    }, 500);
  }, [gameKey, matched, onFinish, roundWords, selectedDefinition, selectedWord, startedAt, wrong]);

  return (
    <View style={gameStyles.playArea}>
      <GameProgress current={matched.length} total={roundWords.length} color="#4F78D8" />
      <GamePrompt
        hintKey={nextHintWord?.id}
        hints={nextHintWord ? getHintLevels(nextHintWord) : undefined}
        hintColor="#4F78D8"
        label="MATCH THE PAIRS"
        prompt="Tap a word, then tap the meaning that belongs to it."
      />
      <View style={gameStyles.matchColumns}>
        <View style={gameStyles.matchColumn}>
          <Text style={gameStyles.columnLabel}>WORDS</Text>
          {roundWords.map((word) => (
            <Pressable key={word.id} disabled={matched.includes(word.id)} onPress={() => setSelectedWord(word.id)} style={({ pressed }) => [gameStyles.matchTile, selectedWord === word.id && gameStyles.matchTileSelected, matched.includes(word.id) && gameStyles.matchTileMatched, pressed && !matched.includes(word.id) && gameStyles.pressed]}>
              <Text style={[gameStyles.matchTileWord, matched.includes(word.id) && gameStyles.mutedText]}>{word.term}</Text>
            </Pressable>
          ))}
        </View>
        <View style={gameStyles.matchColumn}>
          <Text style={gameStyles.columnLabel}>MEANINGS</Text>
          {definitions.map((word) => (
            <Pressable key={word.id} disabled={matched.includes(word.id)} onPress={() => setSelectedDefinition(word.id)} style={({ pressed }) => [gameStyles.matchTile, selectedDefinition === word.id && gameStyles.matchTileSelected, matched.includes(word.id) && gameStyles.matchTileMatched, pressed && !matched.includes(word.id) && gameStyles.pressed]}>
              <Text numberOfLines={3} style={[gameStyles.matchTileDefinition, matched.includes(word.id) && gameStyles.mutedText]}>{word.simpleDefinition ?? word.definition}</Text>
            </Pressable>
          ))}
        </View>
      </View>
      {wrong ? <GameFeedback correct={false} text="Not quite — try that pair again." /> : <Text style={gameStyles.helperText}>A match clears both tiles.</Text>}
    </View>
  );
}

function FillGapGame({ words, onFinish }: { words: Word[]; onFinish: GameFinish }) {
  const roundWords = useMemo(() => getGameRoundWords('fill-gap', words, 5), [words]);
  const startedAt = useRef(Date.now()).current;
  const gameKey = useMemo(() => createGameKey('fill-gap', roundWords), [roundWords]);
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const [answers, setAnswers] = useState<GameAnswer[]>([]);
  const word = roundWords[index];
  const options = useMemo(
    () => word ? getOptions(word.term, words, 3, `${gameKey}:${word.id}`) : [],
    [gameKey, word, words],
  );

  function answer(option: string) {
    if (selected || !word) return;
    const isCorrect = normalizeWord(option) === normalizeWord(word.term);
    triggerGameHaptic(isCorrect ? 'success' : 'error');
    const nextAnswers = [...answers, makeAnswer('fill-gap', gameKey, word, isCorrect, startedAt)];
    const nextScore = score + (isCorrect ? 1 : 0);
    setSelected(option);
    setAnswers(nextAnswers);
    setScore(nextScore);
    setTimeout(() => {
      if (index === roundWords.length - 1) {
        onFinish('fill-gap', gameKey, nextAnswers, nextScore, roundWords.length, startedAt);
        return;
      }
      setIndex((current) => current + 1);
      setSelected(null);
    }, 500);
  }

  if (!word) return null;
  return (
    <View style={gameStyles.playArea}>
      <GameProgress current={index} total={roundWords.length} color="#2A9C79" />
      <GamePrompt
        hintKey={word.id}
        hints={getHintLevels(word)}
        hintColor="#2A9C79"
        label="CHOOSE THE BEST FIT"
        prompt={getExampleWithGap(word)}
      />
      <View style={gameStyles.contextWordCard}>
        <Text style={gameStyles.contextWordLabel}>CONTEXT CLUE</Text>
        <Text style={gameStyles.contextDefinition}>
          {word.partOfSpeech ?? 'Choose the word that makes the sentence sound natural.'}
        </Text>
      </View>
      <OptionList options={options} selected={selected} correct={word.term} onSelect={answer} />
      {selected ? <GameFeedback correct={normalizeWord(selected) === normalizeWord(word.term)} text={normalizeWord(selected) === normalizeWord(word.term) ? 'Nice fit.' : `The best fit is ${word.term}.`} /> : null}
    </View>
  );
}

function WordConnectionsGame({ words, onFinish }: { words: Word[]; onFinish: GameFinish }) {
  const roundWords = useMemo(() => getGameRoundWords('word-connections', words, 5), [words]);
  const startedAt = useRef(Date.now()).current;
  const gameKey = useMemo(() => createGameKey('word-connections', roundWords), [roundWords]);
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const [answers, setAnswers] = useState<GameAnswer[]>([]);
  const word = roundWords[index];
  const correct = word?.synonyms?.find((item) => item.trim()) ?? word?.commonWords?.find((item) => item.trim()) ?? '';
  const options = useMemo(
    () => word && correct ? getOptions(correct, words, 3, `${gameKey}:${word.id}`) : [],
    [correct, gameKey, word, words],
  );

  function answer(option: string) {
    if (selected || !word) return;
    const isCorrect = normalizeWord(option) === normalizeWord(correct);
    triggerGameHaptic(isCorrect ? 'success' : 'error');
    const nextAnswers = [...answers, makeAnswer('word-connections', gameKey, word, isCorrect, startedAt)];
    const nextScore = score + (isCorrect ? 1 : 0);
    setSelected(option);
    setAnswers(nextAnswers);
    setScore(nextScore);
    setTimeout(() => {
      if (index === roundWords.length - 1) {
        onFinish('word-connections', gameKey, nextAnswers, nextScore, roundWords.length, startedAt);
        return;
      }
      setIndex((current) => current + 1);
      setSelected(null);
    }, 500);
  }

  if (!word) return null;
  return (
    <View style={gameStyles.playArea}>
      <GameProgress current={index} total={roundWords.length} color="#8B65D9" />
      <GamePrompt
        hintKey={word.id}
        hints={correct ? getHintLevels(word, correct) : undefined}
        hintColor="#8B65D9"
        label="FIND THE CONNECTION"
        prompt={`Which word is closest in meaning to “${word.term}”?`}
      />
      <View style={gameStyles.connectionClue}>
        <Text style={gameStyles.connectionClueLabel}>WORD</Text>
        <Text style={gameStyles.connectionWord}>{word.term}</Text>
        <Text style={gameStyles.contextDefinition}>{word.simpleDefinition ?? word.definition}</Text>
      </View>
      <OptionList options={options} selected={selected} correct={correct} onSelect={answer} />
    </View>
  );
}

type CrosswordPlacement = { word: Word; letters: string; row: number; col: number; direction: 'across' | 'down'; number: number };

function crosswordLetters(word: Word) {
  return normalizeWord(word.term).toUpperCase();
}

function canPlaceCrosswordWord(placement: CrosswordPlacement, placements: CrosswordPlacement[]) {
  if (placement.letters.length < 3 || placement.letters.length > 10) return false;
  for (let index = 0; index < placement.letters.length; index += 1) {
    const row = placement.row + (placement.direction === 'down' ? index : 0);
    const col = placement.col + (placement.direction === 'across' ? index : 0);
    if (row < 0 || row > 14 || col < 0 || col > 14) return false;
    const conflict = placements.some((existing) => {
      for (let existingIndex = 0; existingIndex < existing.letters.length; existingIndex += 1) {
        const existingRow = existing.row + (existing.direction === 'down' ? existingIndex : 0);
        const existingCol = existing.col + (existing.direction === 'across' ? existingIndex : 0);
        if (existingRow === row && existingCol === col && existing.letters[existingIndex] !== placement.letters[index]) return true;
      }
      return false;
    });
    if (conflict) return false;
  }
  return true;
}

function buildCrossword(words: Word[]) {
  const candidates = words.filter((word) => crosswordLetters(word).length >= 3 && crosswordLetters(word).length <= 10);
  const placements: CrosswordPlacement[] = [];
  const first = candidates[0];
  if (!first) return placements;
  placements.push({ word: first, letters: crosswordLetters(first), row: 7, col: 2, direction: 'across', number: 1 });
  for (const word of candidates.slice(1, 12)) {
    const letters = crosswordLetters(word);
    let placed: CrosswordPlacement | null = null;
    for (const existing of placements) {
      if (placed) break;
      for (let existingIndex = 0; existingIndex < existing.letters.length && !placed; existingIndex += 1) {
        const matchingIndex = letters.indexOf(existing.letters[existingIndex]);
        if (matchingIndex < 0) continue;
        const direction = existing.direction === 'across' ? 'down' : 'across';
        const candidate: CrosswordPlacement = {
          word,
          letters,
          row: existing.row + (existing.direction === 'across' ? 0 : existingIndex) - (direction === 'down' ? matchingIndex : 0),
          col: existing.col + (existing.direction === 'down' ? 0 : existingIndex) - (direction === 'across' ? matchingIndex : 0),
          direction,
          number: placements.length + 1,
        };
        if (canPlaceCrosswordWord(candidate, placements)) placed = candidate;
      }
    }
    if (!placed) {
      for (let row = 0; row < 15 && !placed; row += 1) {
        for (let col = 0; col <= 15 - letters.length && !placed; col += 1) {
          const fallback: CrosswordPlacement = {
            word,
            letters,
            row,
            col,
            direction: 'across',
            number: placements.length + 1,
          };
          if (canPlaceCrosswordWord(fallback, placements)) placed = fallback;
        }
      }
    }
    if (placed) placements.push(placed);
  }
  return placements;
}

function CrosswordGame({ words, onFinish }: { words: Word[]; onFinish: GameFinish }) {
  const orderedWords = useMemo(() => getGameRoundWords('crossword', words), [words]);
  const placements = useMemo(() => buildCrossword(orderedWords), [orderedWords]);
  const startedAt = useRef(Date.now()).current;
  const gameKey = useMemo(() => createGameKey('crossword', placements.map((placement) => placement.word)), [placements]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [solved, setSolved] = useState<number[]>([]);
  const [response, setResponse] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [hintStep, setHintStep] = useState(0);
  const answersRef = useRef<GameAnswer[]>([]);
  const active = placements[activeIndex];
  const activeHints = active ? getHintLevels(active.word) : [];

  useEffect(() => {
    setHintStep(0);
  }, [activeIndex]);

  function checkAnswer() {
    if (!active || !response.trim() || solved.includes(activeIndex)) return;
    const isCorrect = normalizeWord(response) === active.letters.toLowerCase();
    triggerGameHaptic(isCorrect ? 'success' : 'error');
    answersRef.current = [...answersRef.current, makeAnswer('crossword', gameKey, active.word, isCorrect, startedAt)];
    if (!isCorrect) {
      setFeedback('Not quite — use the clue and try again.');
      return;
    }
    const nextSolved = [...solved, activeIndex];
    setSolved(nextSolved);
    setFeedback('Entry locked in.');
    setResponse('');
    if (nextSolved.length === placements.length) {
      setTimeout(() => onFinish('crossword', gameKey, answersRef.current, placements.length, placements.length, startedAt), 300);
    } else {
      setTimeout(() => {
        setActiveIndex((current) => {
          const next = placements.findIndex((_, index) => !nextSolved.includes(index) && index > current);
          return next >= 0 ? next : placements.findIndex((_, index) => !nextSolved.includes(index));
        });
        setFeedback(null);
      }, 300);
    }
  }

  const cells = useMemo(() => {
    const map = new Map<string, { letter: string; solved: boolean }>();
    placements.forEach((placement, placementIndex) => {
      for (let index = 0; index < placement.letters.length; index += 1) {
        const row = placement.row + (placement.direction === 'down' ? index : 0);
        const col = placement.col + (placement.direction === 'across' ? index : 0);
        const key = `${row}:${col}`;
        map.set(key, { letter: placement.letters[index], solved: Boolean(map.get(key)?.solved || solved.includes(placementIndex)) });
      }
    });
    return map;
  }, [placements, solved]);

  if (!active || placements.length < 3) return <Text style={gameStyles.emptyText}>Add three longer words to build your crossword.</Text>;
  const gridRows = Array.from({ length: 15 });
  const gridCols = Array.from({ length: 15 });
  return (
    <View style={gameStyles.playArea}>
      <GameProgress current={solved.length} total={placements.length} color="#C17A2B" />
      <View style={gameStyles.crosswordBoard}>
        {gridRows.map((_, row) => (
          <View key={row} style={gameStyles.crosswordRow}>
            {gridCols.map((__, col) => {
              const cell = cells.get(`${row}:${col}`);
              return <View key={`${row}-${col}`} style={[gameStyles.crosswordCell, !cell && gameStyles.crosswordEmptyCell, cell?.solved && gameStyles.crosswordSolvedCell]}>{cell?.solved ? <Text style={gameStyles.crosswordLetter}>{cell.letter}</Text> : null}</View>;
            })}
          </View>
        ))}
      </View>
      <View style={gameStyles.crosswordClues}>
        {placements.map((placement, index) => (
          <Pressable key={placement.word.id} onPress={() => { if (!solved.includes(index)) { setActiveIndex(index); setFeedback(null); } }} style={({ pressed }) => [gameStyles.crosswordClue, activeIndex === index && gameStyles.crosswordClueActive, solved.includes(index) && gameStyles.crosswordClueSolved, pressed && !solved.includes(index) && gameStyles.pressed]}>
            <Text style={gameStyles.crosswordClueNumber}>{placement.number}</Text>
            <View style={gameStyles.crosswordClueCopy}>
              <Text style={gameStyles.crosswordClueDirection}>{placement.direction.toUpperCase()} · {placement.letters.length} LETTERS</Text>
              <Text style={gameStyles.crosswordClueText}>{placement.word.simpleDefinition ?? placement.word.definition}</Text>
            </View>
            {solved.includes(index) ? <Ionicons name="checkmark-circle" size={17} color={COLORS.greenDark} /> : null}
          </Pressable>
        ))}
      </View>
      <View style={gameStyles.crosswordHintRow}>
        <HintButton
          color="#B57924"
          label={getHintButtonLabel(hintStep, activeHints.length)}
          onPress={() => setHintStep((current) => current >= activeHints.length ? 0 : current + 1)}
          visible={hintStep > 0}
        />
      </View>
      {activeHints[hintStep - 1] ? (
        <HintCard color="#B57924" hint={activeHints[hintStep - 1]} />
      ) : null}
      <TextInput autoCapitalize="none" autoCorrect={false} onChangeText={setResponse} onSubmitEditing={checkAnswer} placeholder="Type the answer" placeholderTextColor={COLORS.muted} returnKeyType="done" style={gameStyles.textInput} value={response} />
      <Pressable disabled={!response.trim()} onPress={checkAnswer} style={({ pressed }) => [gameStyles.primaryButton, !response.trim() && gameStyles.disabledButton, pressed && gameStyles.pressed]}>
        <Text style={gameStyles.primaryButtonText}>CHECK ENTRY</Text>
        <Ionicons name="checkmark" size={18} color={COLORS.white} />
      </Pressable>
      {feedback ? <GameFeedback correct={feedback === 'Entry locked in.'} text={feedback} /> : null}
    </View>
  );
}

function WordScrambleGame({ words, onFinish }: { words: Word[]; onFinish: GameFinish }) {
  const roundWords = useMemo(() => getGameRoundWords('word-scramble', words, 5), [words]);
  const startedAt = useRef(Date.now()).current;
  const gameKey = useMemo(() => createGameKey('word-scramble', roundWords), [roundWords]);
  const [index, setIndex] = useState(0);
  const [response, setResponse] = useState('');
  const [score, setScore] = useState(0);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [answers, setAnswers] = useState<GameAnswer[]>([]);
  const word = roundWords[index];
  const scrambled = useMemo(
    () => word
      ? deterministicShuffle(Array.from(normalizeWord(word.term)), `${gameKey}:${word.id}:letters`).join('').toUpperCase()
      : '',
    [gameKey, word],
  );

  function checkAnswer() {
    if (!word || !response.trim() || feedback) return;
    const isCorrect = normalizeWord(response) === normalizeWord(word.term);
    triggerGameHaptic(isCorrect ? 'success' : 'error');
    const nextAnswers = [...answers, makeAnswer('word-scramble', gameKey, word, isCorrect, startedAt)];
    const nextScore = score + (isCorrect ? 1 : 0);
    setAnswers(nextAnswers);
    setScore(nextScore);
    setFeedback(isCorrect ? 'Correct.' : `The word is ${word.term}.`);
    setTimeout(() => {
      if (index === roundWords.length - 1) {
        onFinish('word-scramble', gameKey, nextAnswers, nextScore, roundWords.length, startedAt);
        return;
      }
      setIndex((current) => current + 1);
      setResponse('');
      setFeedback(null);
    }, 500);
  }

  if (!word) return null;
  return (
    <View style={gameStyles.playArea}>
      <GameProgress current={index} total={roundWords.length} color="#D36B89" />
      <GamePrompt
        hintKey={word.id}
        hints={getHintLevels(word)}
        hintColor="#B95372"
        label="UNSCRAMBLE THE WORD"
        prompt={word.simpleDefinition ?? word.definition}
      />
      <View style={gameStyles.scrambleCard}>
        <Text style={gameStyles.scrambleLabel}>THE LETTERS</Text>
        <Text style={gameStyles.scrambleWord}>{scrambled}</Text>
        <Text style={gameStyles.contextDefinition}>{word.partOfSpeech ?? 'Vocabulary word'}</Text>
      </View>
      <TextInput autoCapitalize="none" autoCorrect={false} onChangeText={setResponse} onSubmitEditing={checkAnswer} placeholder="Rebuild the word" placeholderTextColor={COLORS.muted} returnKeyType="done" style={gameStyles.textInput} value={response} />
      <Pressable disabled={!response.trim()} onPress={checkAnswer} style={({ pressed }) => [gameStyles.primaryButton, !response.trim() && gameStyles.disabledButton, pressed && gameStyles.pressed]}>
        <Text style={gameStyles.primaryButtonText}>CHECK WORD</Text>
        <Ionicons name="checkmark" size={18} color={COLORS.white} />
      </Pressable>
      {feedback ? <GameFeedback correct={feedback === 'Correct.'} text={feedback} /> : null}
    </View>
  );
}

function RapidFireGame({ words, onFinish }: { words: Word[]; onFinish: GameFinish }) {
  const startedAt = useRef(Date.now()).current;
  const gameKey = useMemo(() => `${getGameDateKey()}:rapid-fire`, []);
  const [remaining, setRemaining] = useState(60);
  const [index, setIndex] = useState(0);
  const [score, setScore] = useState(0);
  const scoreRef = useRef(0);
  const [combo, setCombo] = useState(0);
  const [answers, setAnswers] = useState<GameAnswer[]>([]);
  const answersRef = useRef<GameAnswer[]>([]);
  const finished = useRef(false);
  const roundWords = useMemo(() => getGameRoundWords('rapid-fire', words), [words]);
  const word = roundWords[index % Math.max(1, roundWords.length)];
  const options = useMemo(
    () => word ? getOptions(word.term, words, 3, `${gameKey}:${word.id}`) : [],
    [gameKey, word, words],
  );

  function finish() {
    if (finished.current) return;
    finished.current = true;
    onFinish(
      'rapid-fire',
      gameKey,
      answersRef.current,
      scoreRef.current,
      answersRef.current.length,
      startedAt,
    );
  }

  useEffect(() => {
    const interval = setInterval(() => {
      setRemaining((current) => {
        if (current <= 1) {
          clearInterval(interval);
          finish();
          return 0;
        }
        return current - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  function answer(option: string) {
    if (!word || finished.current) return;
    const isCorrect = normalizeWord(option) === normalizeWord(word.term);
    triggerGameHaptic('light');
    const nextAnswer = makeAnswer('rapid-fire', gameKey, word, isCorrect, startedAt);
    answersRef.current = [...answersRef.current, nextAnswer];
    setAnswers(answersRef.current);
    if (isCorrect) {
      scoreRef.current += 1;
    }
    setScore(scoreRef.current);
    setCombo((current) => isCorrect ? current + 1 : 0);
    setIndex((current) => current + 1);
  }

  if (!word) return null;
  return (
    <View style={gameStyles.playArea}>
      <View style={gameStyles.rapidHeader}>
        <View><Text style={gameStyles.promptLabel}>TIME LEFT</Text><Text style={gameStyles.rapidTimer}>{remaining}s</Text></View>
        <View style={gameStyles.comboPill}><Ionicons name="flame" size={16} color={COLORS.orange} /><Text style={gameStyles.comboText}>{combo} combo</Text></View>
      </View>
      <GameProgress current={score} total={Math.max(1, answers.length + 1)} color="#D07B22" />
      <GamePrompt
        hintKey={word.id}
        hints={getHintLevels(word)}
        hintColor="#D07B22"
        label="GO WITH YOUR FIRST INSTINCT"
        prompt={`Which word matches “${word.simpleDefinition ?? word.definition}”?`}
      />
      <OptionList options={options} selected={null} correct={word.term} onSelect={answer} />
      <Text style={gameStyles.helperText}>Answer as many as you can. A miss resets your combo.</Text>
    </View>
  );
}

const gameStyles = StyleSheet.create({
  shell: { width: '100%', gap: 12 },
  pressed: { opacity: 0.78, transform: [{ scale: 0.98 }] },
  gameIntro: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 15, borderRadius: 22, borderWidth: 1, borderColor: '#DED5FF', backgroundColor: '#F8F5FF' },
  gameIntroIcon: { width: 45, height: 45, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EAE4FF' },
  gameIntroCopy: { flex: 1 },
  gameIntroTitle: { color: COLORS.ink, fontSize: 15, fontWeight: '900' },
  gameIntroText: { marginTop: 3, color: COLORS.muted, fontSize: 11, lineHeight: 16, fontWeight: '600' },
  emptyCard: { alignItems: 'center', gap: 7, padding: 20, borderRadius: 20, backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.border },
  emptyTitle: { color: COLORS.ink, fontSize: 15, fontWeight: '900', textAlign: 'center' },
  emptyText: { color: COLORS.muted, fontSize: 12, lineHeight: 17, fontWeight: '600', textAlign: 'center' },
  gameCard: { flexDirection: 'row', alignItems: 'center', gap: 11, minHeight: 84, padding: 13, borderRadius: 20, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.white, ...SOFT_SHADOW },
  gameCardDisabled: { opacity: 0.5 },
  gameCardPressed: { transform: [{ scale: 0.99 }] },
  gameCardIcon: { width: 45, height: 45, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  gameCardCopy: { flex: 1, minWidth: 0 },
  gameCardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  gameCardTitle: { flex: 1, color: COLORS.ink, fontSize: 15, fontWeight: '900' },
  gameCardLast: { color: COLORS.muted, fontSize: 10, fontWeight: '900' },
  gameCardDescription: { marginTop: 2, color: COLORS.muted, fontSize: 11, lineHeight: 15, fontWeight: '600' },
  gameCardMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  gameCardSkill: { fontSize: 9, fontWeight: '900', letterSpacing: 0.3 },
  gameCardXp: { color: COLORS.muted, fontSize: 9, fontWeight: '800' },
  gameNote: { flexDirection: 'row', alignItems: 'flex-start', gap: 7, paddingHorizontal: 5, paddingVertical: 4 },
  gameNoteText: { flex: 1, color: COLORS.muted, fontSize: 10, lineHeight: 15, fontWeight: '700' },
  gameHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingBottom: 2 },
  backButton: { width: 35, height: 35, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.border },
  gameHeaderCopy: { flex: 1 },
  gameEyebrow: { color: COLORS.purpleDark, fontSize: 8, fontWeight: '900', letterSpacing: 0.9 },
  gameTitle: { marginTop: 2, color: COLORS.ink, fontSize: 20, fontWeight: '900' },
  gameHeaderIcon: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  playArea: { gap: 12 },
  progressWrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  progressTrack: { flex: 1, height: 7, overflow: 'hidden', borderRadius: 4, backgroundColor: '#ECE8F5' },
  progressFill: { height: '100%', borderRadius: 4 },
  progressText: { minWidth: 38, color: COLORS.muted, fontSize: 10, fontWeight: '900', textAlign: 'right' },
  promptCard: { padding: 16, borderRadius: 20, backgroundColor: '#FFF8EC', borderWidth: 1, borderColor: '#F5E2B7' },
  promptHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  promptLabel: { color: COLORS.purpleDark, fontSize: 9, fontWeight: '900', letterSpacing: 0.9 },
  promptText: { marginTop: 6, color: COLORS.ink, fontSize: 18, lineHeight: 25, fontWeight: '900' },
  hintButton: { minHeight: 28, paddingHorizontal: 8, borderRadius: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, backgroundColor: '#FFF2D8' },
  hintButtonText: { fontSize: 9, fontWeight: '900', letterSpacing: 0.6 },
  hintCard: { marginTop: 10, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 12, borderWidth: 1, borderColor: '#F1D9A5', flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: '#FFF8E9' },
  hintText: { flex: 1, fontSize: 11, lineHeight: 16, fontWeight: '800' },
  matchColumns: { flexDirection: 'row', gap: 9 },
  matchColumn: { flex: 1, gap: 8 },
  columnLabel: { marginLeft: 2, color: COLORS.muted, fontSize: 9, fontWeight: '900', letterSpacing: 0.8 },
  matchTile: { minHeight: 66, padding: 10, justifyContent: 'center', borderRadius: 15, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.white },
  matchTileSelected: { borderColor: COLORS.blue, backgroundColor: '#EDF5FF' },
  matchTileMatched: { opacity: 0.45, borderColor: COLORS.green, backgroundColor: '#EAF8F1' },
  matchTileWord: { color: COLORS.ink, fontSize: 14, fontWeight: '900', textAlign: 'center' },
  matchTileDefinition: { color: COLORS.muted, fontSize: 10, lineHeight: 14, fontWeight: '700', textAlign: 'center' },
  mutedText: { color: COLORS.greenDark },
  helperText: { color: COLORS.muted, fontSize: 11, lineHeight: 16, fontWeight: '700', textAlign: 'center' },
  errorText: { color: COLORS.red, fontSize: 12, lineHeight: 17, fontWeight: '800', textAlign: 'center' },
  successText: { color: COLORS.greenDark, fontSize: 12, lineHeight: 17, fontWeight: '800', textAlign: 'center' },
  contextWordCard: { alignItems: 'center', padding: 15, borderRadius: 18, backgroundColor: '#F1FBF6', borderWidth: 1, borderColor: '#CDEFE0' },
  contextWordLabel: { color: COLORS.greenDark, fontSize: 9, fontWeight: '900', letterSpacing: 0.8 },
  contextWord: { marginTop: 3, color: COLORS.ink, fontSize: 24, fontWeight: '900' },
  contextDefinition: { marginTop: 3, color: COLORS.muted, fontSize: 11, lineHeight: 16, fontWeight: '700', textAlign: 'center' },
  options: { gap: 8 },
  option: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 11, borderRadius: 15, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.white },
  optionCorrect: { borderColor: '#9DDCBE', backgroundColor: '#ECFAF3' },
  optionWrong: { borderColor: '#F0B4C2', backgroundColor: '#FFF1F4' },
  optionLetter: { width: 28, height: 28, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EEE9FA' },
  optionLetterCorrect: { backgroundColor: COLORS.green },
  optionLetterWrong: { backgroundColor: COLORS.red },
  optionLetterText: { color: COLORS.purpleDark, fontSize: 11, fontWeight: '900' },
  optionText: { flex: 1, color: COLORS.ink, fontSize: 14, fontWeight: '800' },
  connectionClue: { alignItems: 'center', padding: 17, borderRadius: 18, backgroundColor: '#F5F0FF', borderWidth: 1, borderColor: '#DED0FF' },
  connectionClueLabel: { color: '#8B65D9', fontSize: 9, fontWeight: '900', letterSpacing: 0.8 },
  connectionWord: { marginTop: 3, color: COLORS.ink, fontSize: 25, fontWeight: '900' },
  crosswordBoard: { alignSelf: 'center', padding: 7, borderRadius: 15, backgroundColor: '#DCC9A7', gap: 1 },
  crosswordRow: { flexDirection: 'row', gap: 1 },
  crosswordCell: { width: 18, height: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.white },
  crosswordEmptyCell: { backgroundColor: '#C8AF87' },
  crosswordSolvedCell: { backgroundColor: '#E5F7EF' },
  crosswordLetter: { color: COLORS.greenDark, fontSize: 10, fontWeight: '900' },
  crosswordClues: { gap: 7 },
  crosswordClue: { flexDirection: 'row', alignItems: 'center', gap: 9, padding: 10, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.white },
  crosswordClueActive: { borderColor: '#D6A04C', backgroundColor: '#FFF8E9' },
  crosswordClueSolved: { borderColor: '#BFE7D4', backgroundColor: '#F2FBF6' },
  crosswordClueNumber: { width: 24, color: '#B57924', fontSize: 13, fontWeight: '900', textAlign: 'center' },
  crosswordClueCopy: { flex: 1 },
  crosswordClueDirection: { color: COLORS.muted, fontSize: 8, fontWeight: '900', letterSpacing: 0.8 },
  crosswordClueText: { marginTop: 2, color: COLORS.ink, fontSize: 11, lineHeight: 15, fontWeight: '800' },
  crosswordHintRow: { flexDirection: 'row', justifyContent: 'flex-end' },
  textInput: { minHeight: 53, paddingHorizontal: 15, borderRadius: 16, borderWidth: 1, borderColor: '#DCD3EE', backgroundColor: COLORS.white, color: COLORS.ink, fontSize: 16, fontWeight: '800' },
  primaryButton: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 16, backgroundColor: COLORS.purple, ...SOFT_SHADOW },
  primaryButtonText: { color: COLORS.white, fontSize: 13, fontWeight: '900', letterSpacing: 0.5 },
  secondaryButton: { minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 14 },
  secondaryButtonText: { color: COLORS.purpleDark, fontSize: 12, fontWeight: '900' },
  disabledButton: { opacity: 0.45 },
  scrambleCard: { alignItems: 'center', padding: 20, borderRadius: 20, backgroundColor: '#FFF1F5', borderWidth: 1, borderColor: '#F2CBD8' },
  scrambleLabel: { color: '#B95372', fontSize: 9, fontWeight: '900', letterSpacing: 0.9 },
  scrambleWord: { marginTop: 7, color: COLORS.ink, fontSize: 29, fontWeight: '900', letterSpacing: 3 },
  rapidHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, borderRadius: 18, backgroundColor: '#FFF5E6', borderWidth: 1, borderColor: '#F6DCA9' },
  rapidTimer: { marginTop: 2, color: COLORS.ink, fontSize: 25, fontWeight: '900' },
  comboPill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 11, paddingVertical: 8, borderRadius: 13, backgroundColor: '#FFE9BD' },
  comboText: { color: '#996913', fontSize: 11, fontWeight: '900' },
  resultCard: { alignItems: 'center', padding: 25, borderRadius: 27, backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.border, ...SOFT_SHADOW },
  resultIcon: { width: 72, height: 72, borderRadius: 25, alignItems: 'center', justifyContent: 'center' },
  resultEyebrow: { marginTop: 17, color: COLORS.purple, fontSize: 9, fontWeight: '900', letterSpacing: 1.1 },
  resultTitle: { marginTop: 4, color: COLORS.ink, fontSize: 23, fontWeight: '900' },
  resultScore: { marginTop: 9, color: COLORS.ink, fontSize: 42, lineHeight: 48, fontWeight: '900' },
  resultScoreMuted: { color: COLORS.muted, fontSize: 22 },
  resultXpPill: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 7, paddingHorizontal: 11, paddingVertical: 7, borderRadius: 12, backgroundColor: '#FFF5DE' },
  resultXpText: { color: '#9A6D13', fontSize: 11, fontWeight: '900' },
  resultText: { marginTop: 12, color: COLORS.muted, fontSize: 12, lineHeight: 18, fontWeight: '700', textAlign: 'center' },
});
