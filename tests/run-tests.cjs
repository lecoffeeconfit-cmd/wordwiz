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
const quiz = loadTsModule('src/utils/quiz.ts');
const dictionary = loadTsModule('src/services/dictionary.ts');

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
    },
    id: 'word-1',
    createdAt: '2026-01-01T00:00:00.000Z',
  });

  assert.equal(savedWord.term, 'Luminous');
  assert.equal(savedWord.definition, 'Giving off light.');
  assert.equal(savedWord.simpleDefinition, 'Bright');
  assert.deepEqual(learning.upsertSavedWord([], savedWord), [savedWord]);
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

test('quiz builder creates answer options for up to five words', () => {
  const words = [
    makeWord('1', 'Alpha', 'First'),
    makeWord('2', 'Bravo', 'Second'),
    makeWord('3', 'Charlie', 'Third'),
    makeWord('4', 'Delta', 'Fourth'),
    makeWord('5', 'Echo', 'Fifth'),
    makeWord('6', 'Foxtrot', 'Sixth'),
  ];
  const questions = quiz.buildQuiz(words);

  assert.equal(questions.length, 5);
  questions.forEach((question) => {
    assert.ok(question.options.includes(question.answer));
    assert.equal(new Set(question.options).size, question.options.length);
    assert.ok(question.options.length >= 2);
    assert.ok(question.options.length <= 4);
  });
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
