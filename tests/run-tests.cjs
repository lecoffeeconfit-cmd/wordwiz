const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const ts = require('typescript');

const projectRoot = path.resolve(__dirname, '..');
const moduleCache = new Map();

function loadTsModule(relativePath) {
  const filename = path.resolve(projectRoot, relativePath);

  if (moduleCache.has(filename)) {
    return moduleCache.get(filename).exports;
  }

  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
    fileName: filename,
  }).outputText;

  const mod = new Module(filename, module);
  moduleCache.set(filename, mod);
  mod.filename = filename;
  mod.paths = Module._nodeModulePaths(path.dirname(filename));
  mod.require = function requireFromTs(request) {
    if (request.startsWith('.')) {
      const resolved = resolveLocalTs(path.dirname(filename), request);
      if (resolved) {
        return loadTsModule(path.relative(projectRoot, resolved));
      }
    }

    return Module.prototype.require.call(mod, request);
  };
  mod._compile(output, filename);
  return mod.exports;
}

function resolveLocalTs(dirname, request) {
  const base = path.resolve(dirname, request);
  const candidates = [
    `${base}.ts`,
    `${base}.tsx`,
    path.join(base, 'index.ts'),
    path.join(base, 'index.tsx'),
    base,
  ];

  return candidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
}

const learning = loadTsModule('src/utils/learning.ts');
const dictionaryUtils = loadTsModule('src/utils/dictionary.ts');
const quiz = loadTsModule('src/utils/quiz.ts');
const dictionary = loadTsModule('src/services/dictionary.ts');
const wordnik = loadTsModule('src/services/wordnik.ts');

function makeWord(id, term, definition, reviews = 0) {
  return {
    id,
    term,
    definition,
    simpleDefinition: `${definition} simple`,
    example: `${term} example.`,
    createdAt: `2026-01-0${reviews + 1}T00:00:00.000Z`,
    reviews,
  };
}

function test(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

test('word saving trims input and creates a new saved word', () => {
  const savedWord = learning.buildWordFromInput({
    term: '  Luminous ',
    definition: '  Giving off light. ',
    example: ' The lamp was luminous. ',
    details: {
      simpleDefinition: ' Bright ',
      commonWords: ['bright'],
      antonyms: ['dim'],
    },
    id: 'word-1',
    createdAt: '2026-01-01T00:00:00.000Z',
  });

  assert.equal(savedWord.term, 'Luminous');
  assert.equal(savedWord.definition, 'Giving off light.');
  assert.equal(savedWord.simpleDefinition, 'Bright');
  assert.deepEqual(savedWord.antonyms, ['dim']);
  assert.deepEqual(learning.upsertSavedWord([], savedWord), [savedWord]);
});

test('word saving preserves optional Wordnik enrichment metadata locally', () => {
  const savedWord = learning.buildWordFromInput({
    term: 'resilient',
    definition: 'Able to recover quickly.',
    example: 'The resilient team recovered quickly.',
    details: {
      wordnik_definitions: [
        {
          text: 'Recovering readily from adversity.',
          attributionText: 'from a Wordnik source',
        },
      ],
      wordnik_examples: ['A resilient system keeps running.'],
      wordnik_pronunciations: ['ri-zil-yuhnt'],
      wordnik_etymology: ['From Latin resilire.'],
      wordnik_related_words: ['strong'],
      wordnik_antonyms: ['fragile'],
      wordnik_syllables: ['re', 'sil', 'ient'],
      wordnik_attribution: ['from a Wordnik source'],
      wordnik_url: 'https://www.wordnik.com/words/resilient',
    },
    id: 'word-wordnik',
    createdAt: '2026-01-01T00:00:00.000Z',
  });

  assert.equal(savedWord.wordnik_definitions[0].text, 'Recovering readily from adversity.');
  assert.deepEqual(savedWord.wordnik_related_words, ['strong']);
  assert.deepEqual(savedWord.wordnik_antonyms, ['fragile']);
  assert.equal(savedWord.wordnik_url, 'https://www.wordnik.com/words/resilient');
});

test('wordnik helper only treats non-empty enrichment as useful', () => {
  const base = {
    source: 'wordnik',
    word: 'resilient',
    wordnik_definitions: [],
    wordnik_examples: [],
    wordnik_pronunciations: [],
    wordnik_etymology: [],
    wordnik_related_words: [],
    wordnik_antonyms: [],
    wordnik_syllables: [],
    wordnik_attribution: [],
    wordnik_url: 'https://www.wordnik.com/words/resilient',
  };

  assert.equal(wordnik.hasUsefulWordnikData(base), false);
  assert.equal(
    wordnik.hasUsefulWordnikData({
      ...base,
      wordnik_definitions: [{ text: 'Able to recover quickly.' }],
    }),
    true,
  );
  assert.equal(
    wordnik.hasUsefulWordnikData({
      ...base,
      wordnik_antonyms: ['weak'],
    }),
    true,
  );
});

test('history formatting separates concise timeline from narrative', () => {
  const period = 'Timeline: 1754 - Horace Walpole coined "serendipity" in English. Source - Wiktionary etymology. Evidence - exact dates are not clear.';
  const origin = '"Serendipity" history from Wiktionary: coined after The Three Princes of Serendip. Today, it is commonly used to mean "happy accidental discovery."';

  const snapshot = dictionaryUtils.formatTimePeriodSnapshot(period, origin, 'Serendipity');
  const narrative = dictionaryUtils.formatWordHistoryNarrative(origin, 'Serendipity');

  assert.match(snapshot, /First recorded: 1754/);
  assert.match(snapshot, /Entered English: 1754/);
  assert.doesNotMatch(narrative, /Timeline:/);
  assert.doesNotMatch(narrative, /Source -/);
  assert.match(narrative, /happy accidental discovery/);
});

test('history formatting uses short fallback for missing older origin', () => {
  const narrative = dictionaryUtils.formatWordHistoryNarrative(
    '"Test" is listed as a noun. WordWiz did not find a fully sourced older etymology in the live lookup, so this history note focuses on current use and visible word parts. a aas',
    'Test',
  );

  assert.match(narrative, /A fully sourced older origin was not found/);
  assert.doesNotMatch(narrative, /a aas/);
  assert.doesNotMatch(narrative, /live lookup/);
});

test('word saving capitalizes the first letter for display', () => {
  const savedWord = learning.buildWordFromInput({
    term: '  serendipity ',
    definition: 'A happy accident.',
    example: 'Finding the book was serendipity.',
    id: 'word-2',
    createdAt: '2026-01-01T00:00:00.000Z',
  });
  const acronymWord = learning.buildWordFromInput({
    term: 'NASA',
    definition: 'A space agency.',
    example: 'NASA launched a mission.',
    id: 'word-3',
    createdAt: '2026-01-01T00:00:00.000Z',
  });

  assert.equal(savedWord.term, 'Serendipity');
  assert.equal(acronymWord.term, 'NASA');
});


test('word saving updates an existing word without duplicating it', () => {
  const existing = makeWord('word-1', 'Luminous', 'Old definition', 3);
  const updated = learning.buildWordFromInput({
    existingWord: existing,
    term: 'luminous',
    definition: 'Full of light',
    example: 'A luminous room.',
    id: 'new-id-that-should-not-be-used',
    createdAt: '2026-02-01T00:00:00.000Z',
  });
  const result = learning.upsertSavedWord([existing], updated);

  assert.equal(result.length, 1);
  assert.equal(result[0].id, existing.id);
  assert.equal(result[0].createdAt, existing.createdAt);
  assert.equal(result[0].reviews, 3);
  assert.equal(result[0].definition, 'Full of light');
});

test('word merge keeps local words and prefers more complete records', () => {
  const cloudWord = makeWord('cloud-1', 'Serendipity', 'Happy chance', 1);
  const localMoreComplete = {
    ...makeWord('local-1', 'serendipity', 'Happy chance', 3),
    origin: 'Coined by Horace Walpole in 1754.',
    originPeriod: 'Timeline: 1754 - coined in English.',
  };
  const localOnly = makeWord('local-2', 'Luminous', 'Giving off light', 0);
  const merged = learning.mergeWordLists(
    [cloudWord],
    [localMoreComplete, localOnly],
  );

  assert.equal(merged.length, 2);
  assert.equal(
    merged.find((word) => word.term.toLowerCase() === 'serendipity').origin,
    localMoreComplete.origin,
  );
  assert.equal(
    merged.find((word) => word.term.toLowerCase() === 'serendipity').reviews,
    3,
  );
  assert.ok(merged.some((word) => word.term === 'Luminous'));
});

test('quiz builder creates answer options for up to ten words', () => {
  const words = [
    makeWord('1', 'Alpha', 'First'),
    makeWord('2', 'Bravo', 'Second'),
    makeWord('3', 'Charlie', 'Third'),
    makeWord('4', 'Delta', 'Fourth'),
    makeWord('5', 'Echo', 'Fifth'),
    makeWord('6', 'Foxtrot', 'Sixth'),
  ];
  const questions = quiz.buildQuiz(words);

  assert.equal(questions.length, 6);
  assert.ok(
    questions.some((question) => question.mode === 'definition-to-word'),
  );
  assert.ok(questions.some((question) => question.mode === 'true-false'));
  questions.forEach((question) => {
    assert.ok(question.options.includes(question.answer));
    assert.equal(new Set(question.options).size, question.options.length);
    assert.ok(question.options.length >= 2);
    assert.ok(question.options.length <= 4);
    assert.ok(question.prompt);
    assert.ok(question.displayText);
    assert.ok(question.helperText);
  });
});

test('quiz builder avoids recently quizzed words when enough alternatives exist', () => {
  const words = [
    makeWord('1', 'Alpha', 'First'),
    makeWord('2', 'Bravo', 'Second'),
    makeWord('3', 'Charlie', 'Third'),
    makeWord('4', 'Delta', 'Fourth'),
    makeWord('5', 'Echo', 'Fifth'),
    makeWord('6', 'Foxtrot', 'Sixth'),
    makeWord('7', 'Golf', 'Seventh'),
    makeWord('8', 'Hotel', 'Eighth'),
    makeWord('9', 'India', 'Ninth'),
    makeWord('10', 'Juliet', 'Tenth'),
    makeWord('11', 'Kilo', 'Eleventh'),
    makeWord('12', 'Lima', 'Twelfth'),
    makeWord('13', 'Mike', 'Thirteenth'),
  ];
  const recentAttempts = [
    {
      id: 'recent-1',
      date: '2026-01-02',
      score: 3,
      total: 3,
      durationSeconds: 30,
      completedAt: '2026-01-02T00:00:00.000Z',
      answers: [
        { wordId: '1', correct: true },
        { wordId: '2', correct: false },
        { wordId: '3', correct: true },
      ],
    },
  ];
  const questions = quiz.buildQuiz(words, recentAttempts);
  const questionWordIds = new Set(
    questions.map((question) => question.word.id),
  );

  assert.equal(questions.length, 10);
  assert.equal(questionWordIds.has('1'), false);
  assert.equal(questionWordIds.has('2'), false);
  assert.equal(questionWordIds.has('3'), false);
});

test('quiz completion records progress, analytics, and review counts', () => {
  const words = [makeWord('1', 'Alpha', 'First'), makeWord('2', 'Bravo', 'Second')];
  const answers = [
    { wordId: '1', correct: true },
    { wordId: '2', correct: false },
  ];
  const { progress, attempt } = learning.buildQuizCompletion({
    score: 1,
    total: 2,
    durationSeconds: 12,
    answers,
    id: 'attempt-1',
    completedAt: '2026-01-01T00:00:00.000Z',
    date: '2026-01-01',
  });
  const reviewedWords = learning.applyQuizReviews(words, answers);
  const analytics = learning.addQuizAttempt(
    { quizHistory: [], cardHistory: [] },
    attempt,
  );

  assert.deepEqual(progress, { date: '2026-01-01', score: 1, total: 2 });
  assert.equal(analytics.quizHistory[0].answers.length, 2);
  assert.equal(reviewedWords[0].reviews, 1);
  assert.equal(reviewedWords[1].reviews, 1);
});

test('review priority favors missed words over ordinary new words', () => {
  const missedWord = makeWord('1', 'Acerbic', 'Sharp or biting', 1);
  const newWord = makeWord('2', 'Luminous', 'Giving off light', 0);
  const analytics = {
    cardHistory: [],
    quizHistory: [
      {
        id: 'quiz-1',
        date: '2026-01-01',
        score: 0,
        total: 1,
        durationSeconds: 10,
        completedAt: '2026-01-01T00:00:00.000Z',
        answers: [{ wordId: missedWord.id, correct: false }],
      },
    ],
  };

  assert.ok(
    learning.getWordReviewPriority(missedWord, analytics) >
      learning.getWordReviewPriority(newWord, analytics),
  );
});

test('mastery levels follow the WordWiz rank track', () => {
  assert.equal(learning.getMasteryLevel(0).title, 'Novice WordWiz');
  assert.equal(learning.getMasteryLevel(15).title, 'Apprentice WordWiz');
  assert.equal(learning.getMasteryLevel(45).title, 'Adept WordWiz');
  assert.equal(learning.getMasteryLevel(60).title, 'Mage WordWiz');
  assert.equal(learning.getMasteryLevel(90).title, 'Grandmaster WordWiz');
  assert.equal(learning.getNextMasteryLevel(89).title, 'Grandmaster WordWiz');
  assert.equal(learning.getNextMasteryLevel(100), null);
});

test('mastery level progress measures progress to the next rank', () => {
  assert.equal(learning.getMasteryLevelProgress(0), 0);
  assert.equal(learning.getMasteryLevelProgress(7), 47);
  assert.equal(learning.getMasteryLevelProgress(15), 0);
  assert.equal(learning.getMasteryLevelProgress(100), 100);
});

test('achievement builder unlocks practice milestones', () => {
  const words = [
    makeWord('1', 'Alpha', 'First', 5),
    makeWord('2', 'Bravo', 'Second', 1),
  ];
  const analytics = {
    cardHistory: [
      {
        id: 'card-1',
        wordId: '1',
        date: '2026-01-01',
        studiedAt: '2026-01-01T00:00:00.000Z',
        remembered: true,
        durationSeconds: 8,
      },
    ],
    quizHistory: [
      {
        id: 'quiz-1',
        date: '2026-01-01',
        score: 2,
        total: 2,
        durationSeconds: 14,
        completedAt: '2026-01-01T00:00:00.000Z',
        answers: [
          { wordId: '1', correct: true },
          { wordId: '2', correct: true },
        ],
      },
    ],
  };
  const achievements = learning.buildAchievements({ words, analytics });

  assert.equal(
    achievements.find((achievement) => achievement.id === 'first-word').unlocked,
    true,
  );
  assert.equal(
    achievements.find((achievement) => achievement.id === 'perfect-quiz').unlocked,
    true,
  );
  assert.equal(
    achievements.find((achievement) => achievement.id === 'word-loop').unlocked,
    true,
  );
});

test('progress colors move through stronger learning states', () => {
  assert.equal(learning.getProgressColor(0), '#2879E8');
  assert.equal(learning.getProgressColor(40), '#8E78FF');
  assert.equal(learning.getProgressColor(80), '#39C69A');
  assert.equal(learning.getProgressColor(100), '#F4B400');
});

test('progress shine appears halfway and peaks at complete', () => {
  assert.equal(learning.getProgressShineOpacity(49), 0);
  assert.ok(learning.getProgressShineOpacity(50) > 0);
  assert.ok(
    learning.getProgressShineOpacity(80) >
      learning.getProgressShineOpacity(50),
  );
  assert.equal(learning.getProgressShineOpacity(100), 0.58);
});

test('hero progress colors stay visible on the blue dashboard card', () => {
  assert.equal(learning.getHeroProgressColor(0), '#B9F5E0');
  assert.equal(learning.getHeroProgressColor(50), '#8DE7C7');
  assert.equal(learning.getHeroProgressColor(90), '#F4B400');
});

test('wiktionary parser extracts etymology text from heading variants', () => {
  const extract = `
English

Etymology
Coined by Horace Walpole from Serendip, an older name for Sri Lanka.

Noun
serendipity
`;

  const etymology = dictionary.getWiktionaryEtymologyForTest(extract);

  assert.equal(
    etymology,
    'Coined by Horace Walpole from Serendip, an older name for Sri Lanka.',
  );
});

test('wiktionary parser preserves dated etymology clues', () => {
  const extract = `
English

Etymology
Attested since 1754 and influenced by Middle English forms.

Noun
sample
`;

  const etymology = dictionary.getWiktionaryEtymologyForTest(extract);

  assert.ok(etymology.includes('1754'));
  assert.ok(etymology.includes('Middle English'));
});
