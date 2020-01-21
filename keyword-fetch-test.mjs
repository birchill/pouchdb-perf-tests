import { waitForIdle } from './wait-for-idle.mjs';
import { getTestData } from './test-data.mjs';
import {
  log,
  logResults,
  clear,
  prepareTestDatabase,
  compareQueryResults,
} from './utils.mjs';

const output = document.querySelector('output');

export async function runKeywordFetchTest({ numCards, numNotes }) {
  clear(output);

  const queryResults = [];

  try {
    log(
      `Generating test data for ${numCards} card(s) and ${numNotes} note(s)...`
    );
    const testData = getTestData({ numCards, numNotes });
    const searchKeys = getSearchKeys(testData);

    log('Running keyword fetch test...');
    queryResults.push(await runNoIndexTest(testData, searchKeys));
    queryResults.push(await runNaiveIndexTest(testData, searchKeys));
    queryResults.push(await runIndexWithIdTest(testData, searchKeys));
    queryResults.push(await runKeywordsArrayViewTest(testData, searchKeys));

    log('Re-running all tests a second time...');
    await runNoIndexTest(testData, searchKeys);
    await runNaiveIndexTest(testData, searchKeys);
    await runIndexWithIdTest(testData, searchKeys);
    await runKeywordsArrayViewTest(testData, searchKeys);

    log('Done.');
  } catch (e) {
    log(e.message, 'error');
  }

  compareQueryResults(queryResults);
}

function getSearchKeys(testData) {
  const keywordA =
    testData.notes[Math.floor(Math.random() * testData.notes.length)]
      .keywords[0];
  const keywordB =
    testData.notes[Math.floor(Math.random() * testData.notes.length)]
      .keywords[0];

  return [
    // 1: A regular keyword
    [keywordA],
    // 2: Two regular keywords
    [keywordB, keywordA],
    // 3: A substring match
    ['あいお', 'あ', 'い', 'お'],
    // 4: A missing string
    [keywordA + 'zzzz'],
  ];
}

// 1. No index

async function runNoIndexTest(testData, searchKeys) {
  // Prep
  log('1. No index', 'heading');
  log('Preparing database...');
  const db = await prepareTestDatabase(testData);
  await waitForIdle();
  log('Running test...');

  // Run test
  const startTime = performance.now();
  const results = [];
  const queryResults = [];
  for (let i = 0; i < 5; i++) {
    for (const keys of searchKeys) {
      const request = {
        selector: {
          _id: { $gt: 'note-', $lt: 'note-\ufff0' },
          keywords: { $elemMatch: { $in: keys } },
        },
      };
      const runStartTime = performance.now();
      const result = await db.find(request);
      if (i === 0) {
        queryResults.push(result.docs);
      }
      results.push(performance.now() - runStartTime);
    }
  }
  const durationMs = performance.now() - startTime;

  // Clean up
  await db.destroy();

  logResults(durationMs, results);

  return queryResults;
}

// 2. Naive index

async function runNaiveIndexTest(testData, searchKeys) {
  // Prep
  log('2. Naive index', 'heading');
  log('Preparing database...');
  const db = await prepareTestDatabase(testData);
  await waitForIdle();
  log('Running test...');

  // Run test
  const startTime = performance.now();
  await db.createIndex({
    index: {
      fields: ['keywords'],
      name: 'keywords',
      ddoc: 'notes_by_keywords',
    },
  });
  const indexCreationTimeMs = performance.now() - startTime;

  const results = [];
  const queryResults = [];
  for (let i = 0; i < 5; i++) {
    for (const keys of searchKeys) {
      const request = {
        selector: {
          _id: { $gt: 'note-', $lt: 'note-\ufff0' },
          keywords: { $elemMatch: { $in: keys } },
        },
        use_index: ['notes_by_keywords', 'keywords'],
      };
      const runStartTime = performance.now();
      const result = await db.find(request);
      if (i === 0) {
        queryResults.push(result.docs);
      }
      results.push(performance.now() - runStartTime);
    }
  }
  const durationMs = performance.now() - startTime;

  // Clean up
  await db.destroy();

  log(`Index creation took ${indexCreationTimeMs}ms`);
  logResults(durationMs, results);

  return queryResults;
}

// 3. With index which includes _id

async function runIndexWithIdTest(testData, searchKeys) {
  // Prep
  log('3. Index with _id', 'heading');
  log('Preparing database...');
  const db = await prepareTestDatabase(testData);
  await waitForIdle();
  log('Running test...');

  // Run test
  const startTime = performance.now();
  await db.createIndex({
    index: {
      fields: ['_id', 'keywords'],
      name: 'keywords',
      ddoc: 'notes_by_keywords',
    },
  });
  const indexCreationTimeMs = performance.now() - startTime;

  const results = [];
  const queryResults = [];
  for (let i = 0; i < 5; i++) {
    for (const keys of searchKeys) {
      const request = {
        selector: {
          _id: { $gt: 'note-', $lt: 'note-\ufff0' },
          keywords: { $elemMatch: { $in: keys } },
        },
        use_index: ['notes_by_keywords', 'keywords'],
      };
      const runStartTime = performance.now();
      const result = await db.find(request);
      if (i === 0) {
        queryResults.push(result.docs);
      }
      results.push(performance.now() - runStartTime);
    }
  }
  const durationMs = performance.now() - startTime;

  // Clean up
  await db.destroy();

  log(`Index creation took ${indexCreationTimeMs}ms`);
  logResults(durationMs, results);

  return queryResults;
}

// 4. View for the note keywords only

async function runKeywordsArrayViewTest(testData, searchKeys) {
  // Prep
  log('4. View for note keywords', 'heading');
  log('Preparing database...');
  const db = await prepareTestDatabase(testData);
  await waitForIdle();
  log('Running test...');

  // Run test
  const startTime = performance.now();
  await db.put({
    _id: `_design/note_keywords`,
    views: {
      note_keywords: {
        map: `function(doc) {
  if (!doc._id.startsWith('note-')) {
    return;
  }

  if (!Array.isArray(doc.keywords) || !doc.keywords.length) {
    return;
  }

  for (const keyword of doc.keywords) {
    emit(keyword, null);
  }
}`,
      },
    },
  });
  await db.query('note_keywords', { limit: 0 });
  const indexCreationTimeMs = performance.now() - startTime;

  const results = [];
  const queryResults = [];
  for (let i = 0; i < 5; i++) {
    for (const keys of searchKeys) {
      const runStartTime = performance.now();
      const queryResult = [];
      for (const key of keys) {
        const result = await db.query('note_keywords', {
          key,
          include_docs: true,
        });
        if (i === 0) {
          queryResult.push(...result.rows.map(row => row.doc));
        }
      }
      results.push(performance.now() - runStartTime);
      if (i === 0) {
        queryResults.push(queryResult);
      }
    }
  }
  const durationMs = performance.now() - startTime;

  // Clean up
  await db.destroy();

  log(`Index creation took ${indexCreationTimeMs}ms`);
  logResults(durationMs, results);

  return queryResults;
}

// TODO: 5. Forcefully create an IndexedDB multi-entry index somehow
