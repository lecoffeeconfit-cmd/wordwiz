const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const parser = require('@babel/parser');
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
const dateUtils = loadTsModule('src/utils/date.ts');
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

function walkAst(node, parent, visit) {
  if (!node || typeof node !== 'object') {
    return;
  }

  visit(node, parent);

  for (const key of Object.keys(node)) {
    if (
      [
        'loc',
        'start',
        'end',
        'leadingComments',
        'trailingComments',
        'innerComments',
      ].includes(key)
    ) {
      continue;
    }

    const value = node[key];
    if (Array.isArray(value)) {
      value.forEach((child) => walkAst(child, node, visit));
    } else {
      walkAst(value, node, visit);
    }
  }
}

function getJsxName(node) {
  if (!node) return '';
  if (node.type === 'JSXIdentifier') return node.name;
  if (node.type === 'JSXMemberExpression') {
    return `${getJsxName(node.object)}.${getJsxName(node.property)}`;
  }
  return '';
}

function listFiles(dir, predicate) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name === 'node_modules' ? [] : listFiles(fullPath, predicate);
    }

    return predicate(fullPath) ? [fullPath] : [];
  });
}

function expressionCanRenderString(expression) {
  if (!expression) return false;
  if (expression.type === 'StringLiteral' || expression.type === 'TemplateLiteral') {
    return true;
  }
  if (expression.type === 'ConditionalExpression') {
    return (
      expressionCanRenderString(expression.consequent) ||
      expressionCanRenderString(expression.alternate)
    );
  }
  if (expression.type === 'LogicalExpression') {
    return expressionCanRenderString(expression.right);
  }
  return false;
}

test('native container JSX does not render raw text nodes', () => {
  const nativeContainers = new Set([
    'Animated.ScrollView',
    'Animated.View',
    'FlatList',
    'KeyboardAvoidingView',
    'LinearGradient',
    'Modal',
    'Pressable',
    'SafeAreaView',
    'ScrollView',
    'TouchableOpacity',
    'View',
  ]);
  const violations = [];
  const sourceFiles = listFiles(path.join(projectRoot, 'src'), (file) =>
    file.endsWith('.tsx'),
  );

  sourceFiles.forEach((file) => {
    const source = fs.readFileSync(file, 'utf8');
    const ast = parser.parse(source, {
      sourceType: 'module',
      plugins: ['typescript', 'jsx'],
    });

    walkAst(ast, null, (node, parent) => {
      if (!parent || parent.type !== 'JSXElement') {
        return;
      }

      const parentName = getJsxName(parent.openingElement.name);
      if (!nativeContainers.has(parentName)) {
        return;
      }

      if (node.type === 'JSXText' && node.value.trim()) {
        violations.push(
          `${path.relative(projectRoot, file)}:${node.loc.start.line} raw text ${JSON.stringify(node.value.trim())}`,
        );
      }

      if (
        node.type === 'JSXExpressionContainer' &&
        expressionCanRenderString(node.expression)
      ) {
        violations.push(
          `${path.relative(projectRoot, file)}:${node.loc.start.line} string expression inside ${parentName}`,
        );
      }
    });
  });

  assert.deepEqual(violations, []);
});

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

test('word added timestamps use concise, human-friendly dates', () => {
  const now = new Date('2026-07-13T12:00:00.000Z');

  assert.equal(
    dateUtils.formatWordAddedDate('2026-07-13T08:00:00.000Z', now),
    'Added today',
  );
  assert.equal(
    dateUtils.formatWordAddedDate('2026-07-12T08:00:00.000Z', now),
    'Added yesterday',
  );
  assert.equal(
    dateUtils.formatWordAddedDate('2026-05-04T08:00:00.000Z', now),
    'Added May 4',
  );
  assert.equal(
    dateUtils.formatWordAddedDate('2025-05-04T08:00:00.000Z', now),
    'Added May 4, 2025',
  );
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

test('dictionary cleanup turns circular encyclopedia openings into definitions', () => {
  const cleaned = dictionary.cleanLookupDefinitionForDisplay(
    'Sinicization, sinofication, sinification, or sinonization is the process by which non-Chinese societies come under the influence of Chinese culture.',
    'sinicization',
  );

  assert.equal(
    cleaned,
    'The process by which non-Chinese societies come under the influence of Chinese culture.',
  );
});

test('dictionary ranking prefers modern common definitions over older senses', () => {
  const definition = dictionary.selectBestDefinitionForDisplay(
    [
      {
        source: 'dictionary',
        text: 'A person employed to perform computations; one who computes.',
      },
      {
        source: 'dictionary',
        text: 'A programmable electronic device that stores, retrieves, and processes data.',
      },
    ],
    'computer',
  );

  assert.equal(
    definition,
    'A programmable electronic device that stores, retrieves, and processes data.',
  );
});

test('definition options preserve ranked sources and remove duplicates', () => {
  const options = dictionary.rankDefinitionCandidates(
    [
      {
        source: 'dictionary',
        text: 'A bright glow produced by a source of light.',
        partOfSpeech: 'noun',
      },
      {
        source: 'wiktionary',
        text: 'A bright glow produced by a source of light.',
        partOfSpeech: 'noun',
      },
      {
        source: 'wordnik',
        text: 'The visible brightness that shines from something.',
        partOfSpeech: 'noun',
      },
    ],
    'radiance',
  );

  assert.equal(options.length, 2);
  assert.equal(options[0].source, 'Dictionary');
  assert.equal(options[0].recommended, true);
  assert.equal(options[1].source, 'Wordnik');
  assert.equal(options[1].recommended, false);
});

test('dictionary selection rejects placeholder definitions', () => {
  const definition = dictionary.selectBestDefinitionForDisplay(
    [
      {
        source: 'datamuse',
        text: 'A meaning for Bananna was found, but this source did not provide a full dictionary definition.',
      },
    ],
    'bananna',
  );

  assert.equal(definition, null);
});

test('dictionary fallbacks cover common words with reliable definitions', () => {
  const computer = dictionary.getDefinitionFallbackForTest('computer');
  const banana = dictionary.getDefinitionFallbackForTest('banana');

  assert.match(computer.definition, /electronic machine/i);
  assert.match(computer.simpleDefinition, /information/i);
  assert.match(banana.definition, /fruit/i);
  assert.match(banana.simpleDefinition, /yellow fruit/i);
});

test('wiktionary definition parser extracts English dictionary senses', () => {
  const extract = `
==English==
===Etymology===
From a local language.

===Noun===
# A small Australian marsupial with a short tail.
#: The quokka rested in the shade.

===Verb===
# To smile warmly in a photograph.

==Spanish==
===Noun===
# A Spanish-language definition that should not be used.
`;
  const lookup = dictionary.getWiktionaryDefinitionLookupForTest(
    extract,
    'quokka',
  );

  assert.deepEqual(
    lookup.definitions.map((item) => item.text),
    [
      'A small Australian marsupial with a short tail.',
      'To smile warmly in a photograph.',
    ],
  );
  assert.equal(lookup.partOfSpeech, 'noun');
});

test('wiktionary definition parser rejects misspelling entries', () => {
  const extract = `
English
Noun
# Misspelling of banana.
`;
  const lookup = dictionary.getWiktionaryDefinitionLookupForTest(
    extract,
    'bananna',
  );

  assert.deepEqual(lookup.definitions, []);
});

test('simple definitions are distinct and written in plainer English', () => {
  const definition = 'Able to recover quickly after something difficult.';
  const simpleDefinition = dictionaryUtils.makeSimpleDefinition(
    definition,
    'resilient',
  );

  assert.equal(simpleDefinition, 'Able to bounce back after something hard.');
  assert.notEqual(simpleDefinition.toLowerCase(), definition.toLowerCase());
});

test('simple definitions preserve the full first sentence', () => {
  const simpleDefinition = dictionaryUtils.makeSimpleDefinition(
    'The process by which non-Chinese societies or groups are acculturated or assimilated into Chinese culture.',
    'Sinicization',
  );

  assert.equal(
    simpleDefinition,
    'In plain English, the process by which non-Chinese societies or groups are acculturated or assimilated into Chinese culture.',
  );
});

test('flashcards use the complete definition when a saved summary ends mid-sentence', () => {
  const definition =
    'A combination of events which have come together by chance to make a surprisingly good or wonderful outcome.';

  assert.equal(
    dictionaryUtils.getCompleteFlashcardDefinition(
      definition,
      'A combination of events which have come together by chance to make a surprisingly good or wonde',
    ),
    definition,
  );
});

test('word saving replaces duplicate simple definitions', () => {
  const savedWord = learning.buildWordFromInput({
    term: '  Curious ',
    definition: 'Eager to know or learn something.',
    example: 'The curious student asked a question.',
    details: {
      simpleDefinition: 'Eager to know or learn something.',
    },
    id: 'word-simple',
    createdAt: '2026-01-01T00:00:00.000Z',
  });

  assert.equal(savedWord.definition, 'Eager to know or learn something.');
  assert.equal(
    savedWord.simpleDefinition,
    'Wanting to learn or ask questions.',
  );
  assert.notEqual(savedWord.simpleDefinition, savedWord.definition);
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

test('flashcard alphabetical ordering is case-insensitive and does not mutate words', () => {
  const words = [
    makeWord('3', 'zebra', 'A striped animal.'),
    makeWord('1', 'Apple', 'A fruit.'),
    makeWord('2', 'banana', 'A yellow fruit.'),
  ];

  assert.deepEqual(
    learning.sortWordsAlphabetically(words).map((word) => word.term),
    ['Apple', 'banana', 'zebra'],
  );
  assert.deepEqual(
    words.map((word) => word.term),
    ['zebra', 'Apple', 'banana'],
  );
});

test('review ordering always puts the most missed words before new words', () => {
  const words = [
    makeWord('new', 'New word', 'A new word.', 0),
    makeWord('missed-once', 'Missed once', 'A missed word.', 4),
    makeWord('missed-twice', 'Missed twice', 'Another missed word.', 4),
  ];
  const analytics = {
    cardHistory: [],
    quizHistory: [
      {
        id: 'quiz-1',
        date: '2026-07-13',
        score: 0,
        total: 3,
        durationSeconds: 30,
        completedAt: '2026-07-13T12:00:00.000Z',
        answers: [
          { wordId: 'missed-once', correct: false },
          { wordId: 'missed-twice', correct: false },
          { wordId: 'missed-twice', correct: false },
        ],
      },
    ],
  };

  assert.deepEqual(
    learning.sortWordsForReview(words, analytics).map((word) => word.id),
    ['missed-twice', 'missed-once', 'new'],
  );
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

test('quiz attempt labels keep the first quiz of a day as daily', () => {
  const dailyAttempt = {
    id: 'daily-1',
    date: '2026-01-01',
    score: 2,
    total: 2,
    durationSeconds: 12,
    completedAt: '2026-01-01T09:00:00.000Z',
    answers: [],
  };
  const practiceAttempt = {
    ...dailyAttempt,
    id: 'practice-1',
    completedAt: '2026-01-01T14:00:00.000Z',
  };
  const nextDailyAttempt = {
    ...dailyAttempt,
    id: 'daily-2',
    date: '2026-01-02',
    completedAt: '2026-01-02T09:00:00.000Z',
  };
  const history = [practiceAttempt, nextDailyAttempt, dailyAttempt];

  assert.equal(learning.getQuizAttemptKind(dailyAttempt, history), 'daily');
  assert.equal(learning.getQuizAttemptKind(practiceAttempt, history), 'practice');
  assert.equal(learning.getQuizAttemptKind(nextDailyAttempt, history), 'daily');
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
  assert.deepEqual(
    learning.MASTERY_LEVELS.map((level) => level.color),
    ['#89CFF0', '#39C69A', '#8DE7C7', '#FFD87A', '#8E78FF', '#F2A65A', '#FF7E9F'],
  );
});

test('word mastery categories distinguish proficient words from WordWiz ranks', () => {
  assert.equal(learning.getWordMasteryCategory(100).label, 'Proficient words');
  assert.equal(learning.getWordMasteryCategory(100).shortLabel, 'Proficient');
  assert.equal(learning.getMasteryLevel(92).shortTitle, 'Grandmaster');
  assert.equal(learning.getMasteryLevel(100).shortTitle, 'Grandmaster');
});

test('mastery level progress measures progress to the next rank', () => {
  assert.equal(learning.getMasteryLevelProgress(0), 0);
  assert.equal(learning.getMasteryLevelProgress(7), 47);
  assert.equal(learning.getMasteryLevelProgress(15), 0);
  assert.equal(learning.getMasteryLevelProgress(40), 67);
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

test('achievement builder recognizes three quizzes in one day', () => {
  const quizHistory = Array.from({ length: 3 }, (_, index) => ({
    id: `quiz-${index}`,
    date: '2026-01-02',
    score: 1,
    total: 2,
    durationSeconds: 10,
    completedAt: `2026-01-02T0${index}:00:00.000Z`,
    answers: [],
  }));
  const achievements = learning.buildAchievements({
    words: [],
    analytics: { cardHistory: [], quizHistory },
  });

  assert.equal(
    achievements.find((achievement) => achievement.id === 'quiz-day-3').unlocked,
    true,
  );
  assert.equal(
    achievements.find((achievement) => achievement.id === 'quiz-day-5').unlocked,
    false,
  );
  assert.ok(
    achievements.some(
      (achievement) =>
        achievement.id.startsWith('review-horizon-') && !achievement.unlocked,
    ),
  );
});

test('progress colors move through stronger learning states', () => {
  assert.equal(learning.getProgressColor(0), '#3E9BDA');
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
  assert.equal(learning.getHeroProgressColor(0), '#89CFF0');
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
