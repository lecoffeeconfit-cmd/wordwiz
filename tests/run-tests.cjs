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
  assert.equal(
    dateUtils.formatWordFlaggedDate('2026-07-13T08:00:00.000Z', now),
    'Flagged today',
  );
  assert.equal(
    dateUtils.formatWordFlaggedDate('2026-05-04T08:00:00.000Z', now),
    'Flagged May 4',
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
  assert.equal(options[0].source, 'Dictionary API');
  assert.equal(options[0].recommended, true);
  assert.equal(options[1].source, 'Wordnik');
  assert.equal(options[1].recommended, false);
});

test('definition options prioritize distinct sources before extra senses', () => {
  const options = dictionary.rankDefinitionCandidates(
    [
      {
        source: 'dictionary',
        text: 'A small brightly colored songbird found in forests.',
      },
      {
        source: 'dictionary',
        text: 'A bird with a short beak and a cheerful call.',
      },
      {
        source: 'dictionary',
        text: 'A woodland bird known for colorful feathers.',
      },
      {
        source: 'wiktionary',
        text: 'A perching bird often recognized by its melodic song.',
      },
      {
        source: 'wordnik',
        text: 'Any of several small passerine birds with a musical voice.',
      },
    ],
    'warbler',
  );

  assert.deepEqual(
    options.slice(0, 3).map((option) => option.source),
    ['Dictionary API', 'Wiktionary', 'Wordnik'],
  );
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

test('context examples keep source sentences distinct and add clear learning cues', () => {
  const contexts = dictionaryUtils.buildWordContextExamples({
    term: 'Serendipity',
    definition: 'A fortunate discovery that happens by chance.',
    example: 'Finding the quiet cafe after getting lost was serendipity.',
    sourceExamples: [
      'Finding the quiet cafe after getting lost was serendipity.',
      'Their meeting was pure serendipity after the missed train.',
    ],
  });

  assert.equal(contexts.length, 3);
  assert.equal(new Set(contexts.map((context) => context.toLowerCase())).size, 3);
  assert.ok(contexts.every((context) => /serendipity/i.test(context)));
  assert.equal(contexts[0], 'Finding the quiet cafe after getting lost was serendipity.');
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
  const questions = quiz.buildQuiz(
    words,
    [],
    {
      '1': 0,
      '2': 0,
      '3': 45,
      '4': 45,
      '5': 75,
      '6': 75,
    },
  );

  assert.equal(questions.length, 6);
  assert.ok(
    questions.some((question) => question.mode === 'definition-to-word'),
  );
  assert.ok(questions.some((question) => question.mode === 'true-false'));
  questions.forEach((question) => {
    if (question.mode === 'typed-word') {
      assert.equal(question.options.length, 0);
    } else {
      assert.ok(question.options.includes(question.answer));
    }
    assert.equal(new Set(question.options).size, question.options.length);
    assert.ok(
      question.mode === 'typed-word' || question.options.length >= 2,
    );
    assert.ok(question.options.length <= 4);
    assert.ok(question.prompt);
    assert.ok(question.displayText);
    assert.ok(question.helperText);
  });
});

test('quick, hard, and ultra quiz profiles build the requested retrieval challenge', () => {
  const words = [
    makeWord('quick-a', 'Avid', 'Very eager or enthusiastic.'),
    makeWord('quick-b', 'Calm', 'Peaceful and free from excitement.'),
    makeWord('quick-c', 'Daring', 'Willing to take risks.'),
  ];
  const mastery = Object.fromEntries(words.map((word) => [word.id, 75]));
  const quick = quiz.buildQuiz(words, [], mastery, [], {
    sessionMode: 'quick',
    difficulty: 'standard',
    questionLimit: 20,
  });
  const hard = quiz.buildQuiz(words, [], mastery, [], {
    difficulty: 'hard',
  });
  const ultra = quiz.buildQuiz(words, [], mastery, [], {
    difficulty: 'ultra',
  });

  assert.equal(quick.length, 20);
  assert.ok(hard.filter((question) => question.mode === 'typed-word').length >= 2);
  assert.ok(ultra.every((question) => question.mode === 'typed-word'));
  assert.ok(ultra.every((question) => question.strictSpelling));
  assert.equal(
    quiz.evaluateQuizAnswer('Avid', 'Avdi', 'typed-word', true).correct,
    false,
  );
});

test('mistake review prioritizes missed and unusually slow words', () => {
  const priority = quiz.getMistakeReviewWordIds({
    cardHistory: [],
    quizHistory: [{
      id: 'mistake-review',
      completedAt: '2026-01-02T10:00:00.000Z',
      durationSeconds: 20,
      score: 1,
      total: 2,
      answers: [
        { wordId: 'missed', correct: false, difficulty: 'multiple-choice' },
        { wordId: 'slow', correct: true, difficulty: 'typed-recall', responseTimeSeconds: 45 },
      ],
    }],
  });
  assert.deepEqual(priority, ['missed', 'slow']);
});

test('contextual quiz formats use saved examples and meaningful synonym choices', () => {
  const words = [
    {
      ...makeWord('serendipity', 'Serendipity', 'A fortunate discovery by chance.'),
      partOfSpeech: 'noun',
      example: 'Finding the quiet cafe after getting lost was pure serendipity.',
      synonyms: ['chance discovery', 'happy accident'],
    },
    {
      ...makeWord('compensation', 'Compensation', 'Payment for work or loss.'),
      partOfSpeech: 'noun',
      example: 'The company offered compensation for the damaged equipment.',
      synonyms: ['payment', 'reimbursement'],
    },
    {
      ...makeWord('resilience', 'Resilience', 'The ability to recover after difficulty.'),
      partOfSpeech: 'noun',
      example: 'Her resilience helped her return to training after the injury.',
      synonyms: ['strength', 'adaptability'],
    },
    {
      ...makeWord('curiosity', 'Curiosity', 'A desire to learn or know more.'),
      partOfSpeech: 'noun',
      example: 'His curiosity led him to ask thoughtful questions about the stars.',
      synonyms: ['inquisitiveness', 'interest'],
    },
  ];
  const questions = quiz.buildQuiz(
    words,
    [],
    Object.fromEntries(words.map((word) => [word.id, 70])),
    words.map((word) => word.id),
  );
  const sentenceQuestion = questions.find(
    (question) => question.mode === 'sentence-usage',
  );
  const synonymQuestion = questions.find(
    (question) => question.mode === 'closest-synonym',
  );
  const completionQuestion = questions.find(
    (question) => question.mode === 'sentence-completion',
  );

  assert.ok(sentenceQuestion);
  assert.ok(synonymQuestion);
  assert.ok(completionQuestion);
  assert.match(sentenceQuestion.displayText, /uses “.+” correctly/);
  assert.equal(sentenceQuestion.options.length, 4);
  assert.equal(new Set(sentenceQuestion.options).size, 4);
  assert.ok(
    sentenceQuestion.options.every((option) =>
      option.toLocaleLowerCase().includes(sentenceQuestion.word.term.toLocaleLowerCase()),
    ),
  );
  assert.ok(sentenceQuestion.options.includes(sentenceQuestion.answer));
  assert.equal(synonymQuestion.options.length, 4);
  assert.ok(synonymQuestion.options.includes(synonymQuestion.answer));
  assert.equal(synonymQuestion.difficulty, 'multiple-choice');
  assert.match(completionQuestion.displayText, /_____/);
  assert.ok(completionQuestion.options.includes(completionQuestion.answer));
  assert.equal(completionQuestion.difficulty, 'fill-in-options');
});

test('quiz questions become more demanding as word mastery grows', () => {
  assert.equal(quiz.getQuestionModeForMastery(0), 'word-to-definition');
  assert.equal(quiz.getQuestionModeForMastery(24), 'word-to-definition');
  assert.equal(quiz.getQuestionModeForMastery(25), 'true-false');
  assert.equal(quiz.getQuestionModeForMastery(69), 'true-false');
  assert.equal(quiz.getQuestionModeForMastery(70), 'definition-to-word');
  assert.equal(quiz.getQuestionModeForMastery(85), 'typed-word');
});

test('strong-word quizzes rotate formats and cap typed recall', () => {
  const words = Array.from({ length: 10 }, (_, index) =>
    makeWord(`strong-${index}`, `Strong${index}`, `Definition ${index}`, 0),
  );
  const questions = quiz.buildQuiz(
    words,
    [],
    Object.fromEntries(words.map((word) => [word.id, 92])),
    words.map((word) => word.id),
  );
  const modes = questions.map((question) => question.mode);
  const typedCount = modes.filter((mode) => mode === 'typed-word').length;

  assert.ok(typedCount >= 3);
  assert.ok(typedCount <= 4);
  modes.forEach((mode, index) => {
    assert.notDeepEqual(modes.slice(index, index + 3), [mode, mode, mode]);
  });
});

test('typed recall hints progress without exposing the full answer', () => {
  const word = {
    ...makeWord('hint-word', 'Compensatory', 'Making up for a loss.', 0),
    partOfSpeech: 'adjective',
    example: 'The payment was compensatory.',
  };
  const firstHint = quiz.getTypedRecallHint(word, 1);
  const secondHint = quiz.getTypedRecallHint(word, 2);
  const thirdHint = quiz.getTypedRecallHint(word, 3);

  assert.equal(firstHint, 'It starts with “C”.');
  assert.match(secondHint, /12 letters/);
  assert.ok(!secondHint.includes('Compensatory'));
  assert.equal(thirdHint, 'Part of speech: adjective.');
  assert.equal(
    quiz.evaluateQuizAnswer('Compensatory', '__wordwiz-revealed-answer__', 'typed-word').correct,
    false,
  );
});

test('typed recall accepts close spellings but flags the correction', () => {
  assert.deepEqual(
    quiz.evaluateQuizAnswer('Compensatory', 'Compensitory', 'typed-word'),
    { correct: true, hasSpellingNote: true },
  );
  assert.deepEqual(
    quiz.evaluateQuizAnswer('Compensatory', 'compensatory', 'typed-word'),
    { correct: true, hasSpellingNote: false },
  );
  assert.deepEqual(
    quiz.evaluateQuizAnswer('Compensatory', 'Compensation', 'typed-word'),
    { correct: false, hasSpellingNote: false },
  );
  assert.deepEqual(
    quiz.evaluateQuizAnswer('Compensatory', 'Compensitory', 'definition-to-word'),
    { correct: false, hasSpellingNote: false },
  );
});

test('timed learning rewards fast answers without punishing a timeout', () => {
  assert.equal(quiz.getTimedLearningBonusXp(15), 5);
  assert.equal(quiz.getTimedLearningBonusXp(4), 2);
  assert.equal(quiz.getTimedLearningBonusXp(0), 0);

  const word = {
    ...makeWord('timed-word', 'Fluent', 'Able to speak easily.', 3),
    mastery: {
      masteryPercent: 82,
      totalCorrect: 5,
      totalIncorrect: 1,
      correctStreak: 2,
      successfulReviewDays: ['2026-01-01'],
      recentResults: [],
      reviewStage: 4,
      successfulReviewCount: 5,
      lapseCount: 1,
      nextReviewAt: '2026-01-03T10:00:00.000Z',
    },
  };
  const timedOut = learning.applyQuizMastery(
    [word],
    [{
      wordId: word.id,
      correct: false,
      timedOut: true,
      difficulty: 'multiple-choice',
      answeredAt: '2026-01-02T10:00:00.000Z',
    }],
    { cardHistory: [], quizHistory: [] },
  )[0];

  assert.equal(timedOut.reviews, 4);
  assert.equal(timedOut.mastery.masteryPercent, 82);
  assert.equal(timedOut.mastery.totalIncorrect, 1);
  assert.equal(timedOut.mastery.reviewStage, 4);
});

test('response pace uses practical defaults by question format', () => {
  const defaults = quiz.DEFAULT_TIME_BASED_LEARNING_SETTINGS;

  assert.equal(
    quiz.getQuizRecallPaceSignal({
      correct: true,
      responseTimeSeconds: 5,
      difficulty: 'typed-recall',
      settings: defaults,
    }),
    'fluent',
  );
  assert.equal(
    quiz.getQuizRecallPaceSignal({
      correct: true,
      responseTimeSeconds: 16,
      difficulty: 'multiple-choice',
      settings: defaults,
    }),
    'reinforcement',
  );
  assert.equal(
    quiz.getQuizRecallPaceSignal({
      correct: true,
      responseTimeSeconds: 16,
      difficulty: 'fill-in-options',
      settings: defaults,
    }),
    'successful',
  );
  assert.equal(
    quiz.getQuizRecallPaceSignal({
      correct: false,
      responseTimeSeconds: 2,
      difficulty: 'multiple-choice',
      settings: defaults,
    }),
    'incorrect',
  );
  assert.equal(
    quiz.getTimeBasedLearningLimitSeconds('typed-recall', {
      multipleChoiceSeconds: 15,
      fillInSeconds: 25,
      typedRecallSeconds: 36,
    }),
    36,
  );
});

test('slow correct recall reinforces earlier without treating it as wrong', () => {
  const word = {
    ...makeWord('pace-word', 'Steady', 'Firm and regular.', 3),
    mastery: {
      masteryPercent: 60,
      totalCorrect: 4,
      totalIncorrect: 0,
      correctStreak: 4,
      successfulReviewDays: ['2026-01-01'],
      recentResults: [],
      reviewStage: 4,
      successfulReviewCount: 4,
      lapseCount: 0,
      nextReviewAt: '2026-01-01T10:00:00.000Z',
    },
  };
  const [updated] = learning.applyQuizMastery(
    [word],
    [{
      wordId: word.id,
      correct: true,
      difficulty: 'multiple-choice',
      responseTimeSeconds: 18,
      recallPace: 'reinforcement',
      reviewRating: 'easy',
      answeredAt: '2026-01-02T10:00:00.000Z',
    }],
    { cardHistory: [], quizHistory: [] },
  );

  assert.equal(updated.mastery.totalCorrect, 5);
  assert.equal(updated.mastery.totalIncorrect, 0);
  assert.equal(updated.mastery.lastReviewResult, 'hard');
});

test('response signal summary groups fluent, successful, reinforcement, and missed answers', () => {
  const summary = quiz.getQuizResponseSignalSummary({
    cardHistory: [],
    quizHistory: [{
      id: 'signals',
      date: '2026-07-16',
      score: 3,
      total: 4,
      durationSeconds: 30,
      completedAt: '2026-07-16T12:00:00.000Z',
      answers: [
        { wordId: 'a', correct: true, difficulty: 'multiple-choice', responseTimeSeconds: 4 },
        { wordId: 'b', correct: true, difficulty: 'multiple-choice', responseTimeSeconds: 9 },
        { wordId: 'c', correct: true, difficulty: 'multiple-choice', responseTimeSeconds: 20 },
        { wordId: 'd', correct: false, difficulty: 'multiple-choice', responseTimeSeconds: 7 },
      ],
    }],
  });

  assert.deepEqual(summary, {
    fluent: 1,
    successful: 1,
    reinforcement: 1,
    incorrect: 1,
    total: 4,
  });
});

test('retrieval profile separates recognition evidence from delayed direct recall', () => {
  const profile = quiz.getQuizRetrievalProfile({
    cardHistory: [],
    quizHistory: [{
      id: 'retrieval-profile',
      completedAt: '2026-01-03T10:00:00.000Z',
      durationSeconds: 30,
      score: 3,
      total: 3,
      answers: [
        {
          wordId: 'word-a',
          correct: true,
          difficulty: 'multiple-choice',
          questionMode: 'word-to-definition',
          answeredAt: '2026-01-01T10:00:00.000Z',
          responseTimeSeconds: 4,
        },
        {
          wordId: 'word-a',
          correct: true,
          difficulty: 'typed-recall',
          questionMode: 'typed-word',
          answeredAt: '2026-01-02T10:00:00.000Z',
          responseTimeSeconds: 10,
        },
        {
          wordId: 'word-a',
          correct: true,
          difficulty: 'typed-recall',
          questionMode: 'typed-word',
          answeredAt: '2026-01-03T10:00:00.000Z',
          responseTimeSeconds: 10,
        },
      ],
    }],
  });

  assert.ok(profile.recallPercent > profile.recognitionPercent);
  assert.equal(profile.directRecallCorrect, 2);
  assert.equal(profile.delayedDirectRecallCorrect, 1);
});

test('quiz feedback summaries group confidence choices overall and by word', () => {
  const analytics = {
    cardHistory: [],
    quizHistory: [
      {
        id: 'feedback-1',
        date: '2026-01-01',
        score: 2,
        total: 3,
        durationSeconds: 20,
        completedAt: '2026-01-01T10:00:00.000Z',
        answers: [
          { wordId: 'one', correct: true, reviewRating: 'easy' },
          { wordId: 'one', correct: true, reviewRating: 'hard' },
          { wordId: 'two', correct: false },
        ],
      },
      {
        id: 'feedback-2',
        date: '2026-01-02',
        score: 2,
        total: 2,
        durationSeconds: 12,
        completedAt: '2026-01-02T10:00:00.000Z',
        answers: [
          { wordId: 'two', correct: true, reviewRating: 'correct' },
          { wordId: 'one', correct: true, reviewRating: 'hard' },
        ],
      },
    ],
  };

  assert.deepEqual(learning.getQuizFeedbackSummary(analytics), {
    hard: 2,
    correct: 1,
    easy: 1,
    total: 4,
  });
  assert.deepEqual(learning.getQuizFeedbackByWord(analytics), [
    { wordId: 'one', hard: 2, correct: 0, easy: 1, total: 3 },
    { wordId: 'two', hard: 0, correct: 1, easy: 0, total: 1 },
  ]);
});

test('quiz recall pace keeps timing for every question type and word', () => {
  const analytics = {
    cardHistory: [],
    quizHistory: [
      {
        id: 'pace-1',
        date: '2026-07-16',
        score: 2,
        total: 3,
        durationSeconds: 18,
        completedAt: '2026-07-16T12:00:00.000Z',
        answers: [
          { wordId: 'love', correct: true, questionMode: 'typed-word', responseTimeSeconds: 8 },
          { wordId: 'love', correct: true, questionMode: 'typed-word', responseTimeSeconds: 4 },
          { wordId: 'curious', correct: false, questionMode: 'true-false', responseTimeSeconds: 2 },
          { wordId: 'legacy', correct: true },
        ],
      },
    ],
  };

  assert.deepEqual(learning.getQuizRecallPaceByQuestionType(analytics), [
    { key: 'typed-word', answerCount: 2, totalSeconds: 12, averageSeconds: 6 },
    { key: 'true-false', answerCount: 1, totalSeconds: 2, averageSeconds: 2 },
  ]);
  assert.deepEqual(learning.getQuizRecallPaceByWord(analytics), [
    { key: 'love', answerCount: 2, totalSeconds: 12, averageSeconds: 6 },
    { key: 'curious', answerCount: 1, totalSeconds: 2, averageSeconds: 2 },
  ]);
});

test('quiz prompts use a complete definition when a saved summary is cut off', () => {
  const definition =
    'A combination of events that come together by chance to make a surprisingly good or wonderful outcome.';
  const word = {
    ...makeWord('complete-prompt', 'Serendipity', definition, 0),
    simpleDefinition:
      'A combination of events that come together by chance to make a surprisingly good or wonde',
  };
  const [question] = quiz.buildQuiz([word], [], { [word.id]: 85 });
  assert.equal(question.mode, 'typed-word');
  assert.equal(question.displayText, definition);
});

test('durable mastery needs repeated, delayed quiz evidence', () => {
  const analytics = { cardHistory: [], quizHistory: [] };
  let word = makeWord('mastery-1', 'Durable', 'Able to last.', 0);

  word = learning.applyQuizMastery(
    [word],
    [{
      wordId: word.id,
      correct: true,
      difficulty: 'typed-recall',
      answeredAt: '2026-01-01T10:00:00.000Z',
    }],
    analytics,
  )[0];
  assert.equal(word.mastery.masteryPercent, 10);
  assert.equal(learning.isWordMastered(word.mastery), false);

  word = learning.applyQuizMastery(
    [word],
    [{ wordId: word.id, correct: true, difficulty: 'typed-recall', answeredAt: '2026-01-01T10:10:00.000Z' }],
    analytics,
  )[0];
  word = learning.applyQuizMastery(
    [word],
    [{ wordId: word.id, correct: true, difficulty: 'typed-recall', answeredAt: '2026-01-01T10:20:00.000Z' }],
    analytics,
  )[0];
  assert.equal(word.mastery.masteryPercent, 21);
});

test('delayed correct recall earns a retention bonus while mistakes reduce mastery', () => {
  const analytics = { cardHistory: [], quizHistory: [] };
  const word = {
    ...makeWord('mastery-2', 'Retain', 'Keep something.', 0),
    mastery: {
      masteryPercent: 20,
      totalCorrect: 1,
      totalIncorrect: 0,
      correctStreak: 1,
      lastReviewedAt: '2026-01-01T10:00:00.000Z',
      lastCorrectAt: '2026-01-01T10:00:00.000Z',
      successfulReviewDays: ['2026-01-01'],
      recentResults: [{ correct: true, difficulty: 'multiple-choice', answeredAt: '2026-01-01T10:00:00.000Z' }],
    },
  };
  const retained = learning.applyQuizMastery(
    [word],
    [{ wordId: word.id, correct: true, difficulty: 'multiple-choice', answeredAt: '2026-01-04T10:00:00.000Z' }],
    analytics,
  )[0];
  assert.equal(retained.mastery.masteryPercent, 30);

  const missed = learning.applyQuizMastery(
    [retained],
    [{ wordId: word.id, correct: false, difficulty: 'typed-recall', answeredAt: '2026-01-04T11:00:00.000Z' }],
    analytics,
  )[0];
  assert.equal(missed.mastery.masteryPercent, 18);
  assert.equal(missed.mastery.correctStreak, 0);
  assert.ok(missed.mastery.nextReviewAt.startsWith('2026-01-04T11:10:'));
});

test('mastery stays bounded and percentage alone cannot mark a word mastered', () => {
  const incomplete = {
    masteryPercent: 100,
    totalCorrect: 1,
    totalIncorrect: 0,
    correctStreak: 1,
    successfulReviewDays: ['2026-01-01'],
    recentResults: [{ correct: true, difficulty: 'typed-recall', answeredAt: '2026-01-01T10:00:00.000Z' }],
  };
  assert.equal(learning.isWordMastered(incomplete), false);

  const fullyProgressed = {
    ...makeWord('proficient-display', 'Proficient', 'Highly capable.', 0),
    mastery: incomplete,
  };
  assert.equal(
    learning.getWordMasteryCategoryForWord(fullyProgressed, {
      cardHistory: [],
      quizHistory: [],
    }).id,
    'master',
  );

  const nearlyProficient = {
    ...makeWord('nearly-proficient', 'Nearly Proficient', 'Almost complete.', 0),
    mastery: {
      ...incomplete,
      masteryPercent: 88,
      masteredAt: '2026-01-04T10:00:00.000Z',
    },
  };
  assert.equal(
    learning.getWordMasteryCategoryForWord(nearlyProficient, {
      cardHistory: [],
      quizHistory: [],
    }).id,
    'strong',
  );

  const analytics = { cardHistory: [], quizHistory: [] };
  const word = { ...makeWord('mastery-3', 'Bounded', 'Limited.', 0), mastery: incomplete };
  const missed = learning.applyQuizMastery(
    [word],
    [{ wordId: word.id, correct: false, difficulty: 'typed-recall', answeredAt: '2026-01-01T11:00:00.000Z' }],
    analytics,
  )[0];
  assert.equal(missed.mastery.masteryPercent, 88);

  const zeroed = learning.applyQuizMastery(
    [{ ...missed, mastery: { ...missed.mastery, masteryPercent: 2 } }],
    [{ wordId: word.id, correct: false, difficulty: 'typed-recall', answeredAt: '2026-01-01T12:00:00.000Z' }],
    analytics,
  )[0];
  assert.equal(zeroed.mastery.masteryPercent, 0);
});

test('mastery requires correct reviews on three separate days and flashcards do not raise it', () => {
  const analytics = { cardHistory: [], quizHistory: [] };
  const word = {
    ...makeWord('mastery-4', 'Separate', 'Distinct.', 0),
    mastery: {
      masteryPercent: 85,
      totalCorrect: 6,
      totalIncorrect: 0,
      correctStreak: 6,
      successfulReviewDays: ['2026-01-01', '2026-01-02'],
      highestQuestionDifficultyCompleted: 'typed-recall',
      recentResults: [{ correct: true, difficulty: 'typed-recall', answeredAt: '2026-01-02T10:00:00.000Z' }],
      nextReviewAt: '2026-01-03T10:00:00.000Z',
    },
  };
  assert.equal(learning.isWordMastered(word.mastery), false);
  const studied = learning.applyFlashcardReview(
    [word],
    word.id,
    true,
    analytics,
    new Date('2026-01-02T12:00:00.000Z'),
  )[0];
  assert.equal(studied.mastery.masteryPercent, 85);
  assert.equal(learning.isWordMastered(studied.mastery), false);
  const stillLearning = learning.applyFlashcardReview(
    [word],
    word.id,
    false,
    analytics,
    new Date('2026-01-02T12:00:00.000Z'),
  )[0];
  assert.equal(studied.mastery.nextReviewAt, word.mastery.nextReviewAt);
  assert.equal(stillLearning.mastery.nextReviewAt, word.mastery.nextReviewAt);

  const legacy = makeWord('legacy-mastery', 'Legacy', 'Existing progress.', 5);
  const migrated = learning.getWordMasteryProgress(legacy, analytics);
  assert.equal(migrated.masteryPercent, 60);
  assert.equal(learning.isWordMastered(migrated), false);
});

test('spaced review stages follow safe defaults and adapt to hard and easy recalls', () => {
  const analytics = { cardHistory: [], quizHistory: [] };
  let word = makeWord('staged-review', 'Staged', 'Arranged in steps.', 0);

  word = learning.applyQuizMastery(
    [word],
    [{ wordId: word.id, correct: true, difficulty: 'multiple-choice', answeredAt: '2026-01-01T09:00:00.000Z' }],
    analytics,
  )[0];
  assert.equal(word.mastery.reviewStage, 1);
  assert.equal(word.mastery.nextReviewAt, '2026-01-01T09:15:00.000Z');

  word = learning.applyQuizMastery(
    [word],
    [{ wordId: word.id, correct: true, difficulty: 'multiple-choice', answeredAt: '2026-01-01T09:15:00.000Z' }],
    analytics,
  )[0];
  assert.equal(word.mastery.reviewStage, 2);
  assert.equal(word.mastery.nextReviewAt, '2026-01-02T09:15:00.000Z');

  word = learning.applyQuizMastery(
    [word],
    [{ wordId: word.id, correct: true, difficulty: 'multiple-choice', reviewRating: 'hard', answeredAt: '2026-01-02T09:15:00.000Z' }],
    analytics,
  )[0];
  assert.equal(word.mastery.reviewStage, 2);
  assert.equal(word.mastery.nextReviewAt, '2026-01-03T09:15:00.000Z');

  word = learning.applyQuizMastery(
    [word],
    [{ wordId: word.id, correct: true, difficulty: 'multiple-choice', reviewRating: 'easy', answeredAt: '2026-01-03T09:15:00.000Z' }],
    analytics,
  )[0];
  assert.equal(word.mastery.reviewStage, 4);
  assert.equal(word.mastery.nextReviewAt, '2026-01-10T09:15:00.000Z');
});

test('new mastery requires the fourteen-day interval and preserves mastery after a lapse', () => {
  const analytics = { cardHistory: [], quizHistory: [] };
  const word = {
    ...makeWord('interval-mastery', 'Interval', 'A space between things.', 0),
    mastery: {
      masteryPercent: 80,
      totalCorrect: 5,
      totalIncorrect: 0,
      correctStreak: 5,
      successfulReviewCount: 5,
      reviewStage: 5,
      successfulReviewDays: ['2025-12-01', '2025-12-02', '2025-12-05', '2025-12-12', '2025-12-26'],
      highestQuestionDifficultyCompleted: 'typed-recall',
      recentResults: [{ correct: true, difficulty: 'typed-recall', answeredAt: '2025-12-26T09:00:00.000Z' }],
      nextReviewAt: '2026-01-09T09:00:00.000Z',
    },
  };
  const mastered = learning.applyQuizMastery(
    [word],
    [{ wordId: word.id, correct: true, difficulty: 'typed-recall', answeredAt: '2026-01-09T09:00:00.000Z' }],
    analytics,
  )[0];
  assert.equal(mastered.mastery.reviewStage, 6);
  assert.equal(learning.isWordMastered(mastered.mastery), true);
  assert.equal(mastered.mastery.masteredAt, '2026-01-09T09:00:00.000Z');

  const lapsed = learning.applyQuizMastery(
    [mastered],
    [{ wordId: word.id, correct: false, difficulty: 'typed-recall', answeredAt: '2026-02-08T09:00:00.000Z' }],
    analytics,
  )[0];
  assert.equal(lapsed.mastery.reviewStage, 1);
  assert.equal(lapsed.mastery.nextReviewAt, '2026-02-08T09:10:00.000Z');
  assert.equal(lapsed.mastery.masteredAt, '2026-01-09T09:00:00.000Z');

  const relearned = learning.applyQuizMastery(
    [lapsed],
    [{ wordId: word.id, correct: true, difficulty: 'typed-recall', answeredAt: '2026-02-08T09:10:00.000Z' }],
    analytics,
  )[0];
  assert.equal(relearned.mastery.reviewStage, 2);
  assert.equal(relearned.mastery.nextReviewAt, '2026-02-09T09:10:00.000Z');
});

test('due reviews sort locally by overdue time and safely handle malformed schedules', () => {
  const analytics = { cardHistory: [], quizHistory: [] };
  const words = [
    {
      ...makeWord('due-oldest', 'Oldest', 'Existing the longest.', 0),
      createdAt: '2026-01-01T09:00:00.000Z',
      mastery: { ...learning.createWordMasteryProgress('2026-01-01T09:00:00.000Z'), masteryPercent: 40, nextReviewAt: '2026-01-08T09:00:00.000Z' },
    },
    {
      ...makeWord('due-weaker', 'Weaker', 'Less strong.', 0),
      createdAt: '2026-01-01T09:00:00.000Z',
      mastery: { ...learning.createWordMasteryProgress('2026-01-01T09:00:00.000Z'), masteryPercent: 10, nextReviewAt: '2026-01-09T09:00:00.000Z' },
    },
    {
      ...makeWord('malformed-due', 'Malformed', 'Not correctly formed.', 0),
      createdAt: '2026-01-02T09:00:00.000Z',
      mastery: { ...learning.createWordMasteryProgress('2026-01-02T09:00:00.000Z'), nextReviewAt: 'not-a-date' },
    },
  ];
  const due = learning.getDueReviewWords(
    words,
    analytics,
    new Date('2026-01-10T09:00:00.000Z'),
  );
  assert.deepEqual(
    due.map((item) => item.word.id),
    ['malformed-due', 'due-oldest', 'due-weaker'],
  );
  assert.equal(due[0].timingLabel, '8 days overdue');
  assert.equal(due[1].timingLabel, '2 days overdue');
});

test('quiz builder prioritizes due word ids and still fills a normal quiz without duplicates', () => {
  const words = [
    makeWord('one', 'One', 'First.', 0),
    makeWord('two', 'Two', 'Second.', 0),
    makeWord('three', 'Three', 'Third.', 0),
    makeWord('four', 'Four', 'Fourth.', 0),
  ];
  const questions = quiz.buildQuiz(words, [], {}, ['three', 'one']);
  assert.deepEqual(
    questions.slice(0, 2).map((question) => question.word.id),
    ['three', 'one'],
  );
  assert.equal(new Set(questions.map((question) => question.word.id)).size, questions.length);
});

test('category practice expands small groups with distinct formats without extra mastery updates', () => {
  const oneWord = [makeWord('solo', 'Solo', 'Existing alone.', 0)];
  const twoWords = [
    makeWord('one', 'One', 'First.', 0),
    makeWord('two', 'Two', 'Second.', 0),
  ];
  const threeWords = [
    ...twoWords,
    makeWord('three', 'Three', 'Third.', 0),
  ];
  const fourWords = [
    ...threeWords,
    makeWord('four', 'Four', 'Fourth.', 0),
  ];
  const quizSets = [
    [oneWord, 3],
    [twoWords, 4],
    [threeWords, 6],
  ];

  quizSets.forEach(([words, expectedLength]) => {
    const questions = quiz.buildCategoryPracticeQuiz(words, [], {});
    assert.equal(questions.length, expectedLength);
    assert.equal(
      new Set(
        questions.map(
          (question) =>
            `${question.prompt}\u0000${question.displayText}\u0000${question.answer}`,
        ),
      ).size,
      questions.length,
    );
    assert.equal(
      new Set(questions.map((question) => `${question.word.id}\u0000${question.mode}`)).size,
      questions.length,
    );
    assert.ok(
      questions.filter((question) => question.mode === 'typed-word').length <=
        Math.max(1, Math.round(questions.length * 0.35)),
    );
    questions.forEach((question) => {
      assert.ok(
        questions.filter((item) => item.word.id === question.word.id).length <= 3,
      );
    });
  });

  const normalFourWordQuiz = quiz.buildQuiz(fourWords, [], {});
  const categoryFourWordQuiz = quiz.buildCategoryPracticeQuiz(fourWords, [], {});
  assert.equal(categoryFourWordQuiz.length, normalFourWordQuiz.length);

  const oneWordQuestions = quiz.buildCategoryPracticeQuiz(oneWord, [], {});
  const updatedWord = learning.applyQuizMastery(
    oneWord,
    oneWordQuestions.map((question) => ({
      wordId: question.word.id,
      correct: true,
      difficulty: question.difficulty,
      answeredAt: '2026-01-01T10:00:00.000Z',
    })),
    { cardHistory: [], quizHistory: [] },
  )[0];
  assert.equal(updatedWord.reviews, oneWord[0].reviews + 1);
  assert.equal(updatedWord.mastery.totalCorrect, 1);
});

test('flagged words remain ordinary words for mastery and small-group practice', () => {
  const flaggedWord = {
    ...makeWord('flagged', 'Flagged', 'Marked for extra study.', 0),
    isFlagged: true,
    flaggedAt: '2026-01-01T09:00:00.000Z',
  };
  const questions = quiz.buildCategoryPracticeQuiz([flaggedWord], [], {});
  assert.equal(questions.length, 3);

  const updatedWord = learning.applyQuizMastery(
    [flaggedWord],
    [{
      wordId: flaggedWord.id,
      correct: true,
      difficulty: 'multiple-choice',
      answeredAt: '2026-01-01T10:00:00.000Z',
    }],
    { cardHistory: [], quizHistory: [] },
  )[0];
  assert.equal(updatedWord.isFlagged, true);
  assert.equal(updatedWord.flaggedAt, flaggedWord.flaggedAt);
  assert.equal(updatedWord.reviews, flaggedWord.reviews + 1);
});

test('new study words remain in the new group until their first recorded review', () => {
  const newWord = makeWord('new-study-word', 'Fresh', 'Recently added.', 0);
  const starterWord = makeWord('starter-4', 'Starter', 'Included by default.', 0);
  const analytics = { cardHistory: [], quizHistory: [] };

  assert.equal(learning.NEW_STUDY_GROUP.label, 'New words');
  assert.equal(learning.isNewStudyWord(newWord, analytics), true);
  assert.equal(learning.isNewStudyWord(starterWord, analytics), false);
  assert.deepEqual(learning.getNewStudyWords([newWord, starterWord], analytics), [newWord]);

  const flashcardStudied = {
    ...analytics,
    cardHistory: [
      {
        id: 'card-new-study',
        wordId: newWord.id,
        date: '2026-01-02',
        studiedAt: '2026-01-02T09:00:00.000Z',
        remembered: true,
        durationSeconds: 12,
      },
    ],
  };
  assert.equal(learning.isNewStudyWord(newWord, flashcardStudied), false);

  const quizStudied = {
    cardHistory: [],
    quizHistory: [
      {
        id: 'quiz-new-study',
        date: '2026-01-02',
        score: 1,
        total: 1,
        durationSeconds: 20,
        completedAt: '2026-01-02T10:00:00.000Z',
        answers: [
          {
            wordId: newWord.id,
            correct: true,
            answeredAt: '2026-01-02T10:00:00.000Z',
          },
        ],
      },
    ],
  };
  assert.equal(learning.isNewStudyWord(newWord, quizStudied), false);
});

test('word merging keeps local flagged metadata when legacy cloud words omit it', () => {
  const cloudWord = makeWord('merge-flag', 'Merge Flag', 'A cloud word.', 0);
  const localWord = {
    ...cloudWord,
    isFlagged: true,
    flaggedAt: '2026-01-02T09:00:00.000Z',
  };
  const [mergedWord] = learning.mergeWordLists([cloudWord], [localWord]);
  assert.equal(mergedWord.isFlagged, true);
  assert.equal(mergedWord.flaggedAt, localWord.flaggedAt);
});

test('mastery keeps only the ten most recent quiz results', () => {
  const analytics = { cardHistory: [], quizHistory: [] };
  let word = makeWord('recent-results', 'Recent', 'Latest.', 0);

  for (let day = 1; day <= 11; day += 1) {
    word = learning.applyQuizMastery(
      [word],
      [{
        wordId: word.id,
        correct: true,
        difficulty: 'multiple-choice',
        answeredAt: `2026-01-${String(day).padStart(2, '0')}T10:00:00.000Z`,
      }],
      analytics,
    )[0];
  }

  assert.equal(word.mastery.recentResults.length, 10);
  assert.equal(word.mastery.recentResults[0].answeredAt, '2026-01-02T10:00:00.000Z');
});

test('harder quiz evidence earns more mastery than recognition', () => {
  const analytics = { cardHistory: [], quizHistory: [] };
  const recognition = learning.applyQuizMastery(
    [makeWord('easy-evidence', 'Easy', 'Simple.', 0)],
    [{ wordId: 'easy-evidence', correct: true, difficulty: 'recognition', answeredAt: '2026-01-01T10:00:00.000Z' }],
    analytics,
  )[0];
  const recall = learning.applyQuizMastery(
    [makeWord('hard-evidence', 'Recall', 'Remember.', 0)],
    [{ wordId: 'hard-evidence', correct: true, difficulty: 'typed-recall', answeredAt: '2026-01-01T10:00:00.000Z' }],
    analytics,
  )[0];

  assert.equal(recognition.mastery.masteryPercent, 3);
  assert.equal(recall.mastery.masteryPercent, 10);
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
