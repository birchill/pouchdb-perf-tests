const output = document.querySelector('output');

// ------------------------------------------------------------
//
// Utils
//
// ------------------------------------------------------------

async function waitForIdle() {
  if (window.requestIdleCallback) {
    return new Promise(resolve => requestIdleCallback(resolve));
  }

  return new Promise(resolve => setTimeout(resolve, 1000));
}

function log(message, className = 'log') {
  const logElem = document.createElement('div');
  logElem.classList.add(className);
  logElem.textContent = message;
  output.append(logElem);
}

function logResults(totalDuration, results) {
  const averageMs = results.reduce((a, b) => a + b, 0) / results.length;
  const maxMs = Math.max(...results);

  log(
    `Test completed in ${totalDuration}ms, average query time ${averageMs}ms, max query time ${maxMs}ms`,
    'result'
  );
}

function clear(elem) {
  while (elem.children.length) {
    elem.lastChild.remove();
  }
}

let prevTimeStamp = 0;

function generateUniqueTimestampId() {
  let timestamp = Date.now() - Date.UTC(2016, 0, 1);

  if (timestamp <= prevTimeStamp) {
    timestamp = ++prevTimeStamp;
  }
  prevTimeStamp = timestamp;

  const id =
    `0${timestamp.toString(36)}`.slice(-8) +
    `00${Math.floor(Math.random() * 46656).toString(36)}`.slice(-3);
  return id;
}

function generateRandomString(length) {
  let result = '';
  const characters = [...'あいうえおかきくけこさしすせそたちつてとABC🤣'];
  const charactersLength = characters.length;
  for (let i = 0; i < length; i++) {
    result += characters[Math.floor(Math.random() * charactersLength)];
  }
  return result;
}

async function prepareTestDatabase(testData) {
  const db = new PouchDB('testdb', { auto_compaction: true });
  await db.info();

  const { cards, progress, notes } = testData;

  for (const card of cards) {
    await db.put(card);
  }

  for (const progressRecord of progress) {
    await db.put(progressRecord);
  }

  for (const note of notes) {
    await db.put(note);
  }

  return db;
}

function compareQueryResults(queryResults) {
  const firstRun = queryResults[0];

  let ok = true;
  for (let i = 1; i < queryResults.length; i++) {
    if (JSON.stringify(queryResults[i]) !== JSON.stringify(firstRun)) {
      log(`Result for run #${i} differs from first run. Check console`);
      console.log('First run:');
      console.log(firstRun);
      console.log(`Run #${i + 1}:`);
      console.log(queryResults[i]);
      ok = false;
    }
  }

  if (ok) {
    log('Query results match for all runs');
  }
}

const MS_PER_DAY = 1000 * 60 * 60 * 24;

// ------------------------------------------------------------
//
// Keyword fetching
//
// ------------------------------------------------------------

async function runKeywordFetchTest() {
  clear(output);

  const queryResults = [];

  try {
    log('Generating test data...');
    const testData = getKeywordFetchTestData();
    const searchKeys = getSearchKeys(testData);

    log('Running keyword fetch text...');
    queryResults.push(await runKeywordFetchTestNoIndex(testData, searchKeys));
    queryResults.push(
      await runKeywordFetchTestNaiveIndex(testData, searchKeys)
    );
    queryResults.push(
      await runKeywordFetchTestIndexWithId(testData, searchKeys)
    );
    queryResults.push(
      await runKeywordFetchTestWithKeywordsArrayView(testData, searchKeys)
    );

    log('Re-running all tests a second time...');
    await runKeywordFetchTestNoIndex(testData, searchKeys));
    await runKeywordFetchTestNaiveIndex(testData, searchKeys)
    await runKeywordFetchTestIndexWithId(testData, searchKeys)
    await runKeywordFetchTestWithKeywordsArrayView(testData, searchKeys);

    log('Done.');
  } catch (e) {
    log(e.message, 'error');
  }

  compareQueryResults(queryResults);
}

function getKeywordFetchTestData() {
  const NUM_CARDS = 2000;
  const NUM_NOTES = 400;

  // Create 75% unique keywords to share between cards and notes
  const keywordSet = new Set();
  while (keywordSet.size < NUM_NOTES * 0.75) {
    keywordSet.add(generateRandomString(Math.ceil(Math.random() * 5)));
  }
  const keywordsAsArray = [...keywordSet];
  const getRandomKeyword = () =>
    keywordsAsArray[Math.floor(Math.random() * keywordSet.size)];

  // Create progress and card records
  const now = new Date().getTime();
  let newCards = 0;
  const cards = [];
  const progress = [];
  for (let i = 0; i < NUM_CARDS; i++) {
    const id = generateUniqueTimestampId();

    // Add 1, sometimes 2, keywords
    const keywords = [getRandomKeyword()];
    if (Math.random() > 0.75) {
      keywords.push(getRandomKeyword());
    }

    cards.push({
      _id: `card-${id}`,
      front: generateRandomString(20),
      back: generateRandomString(20),
      keywords,
      created: now,
      modified: now,
    });

    // Let at most 50 cards be new cards
    let level;
    let reviewed;
    if (newCards < 50 && Math.random() < 0.05) {
      level = 0;
      reviewed = null;
    } else {
      level = Math.random() * 365;
      // Set the last review time so that we have a small-ish (~16.667%) chance
      // of being overdue.
      const overdueness = Math.random() * 1.2;
      reviewed = now - overdueness * MS_PER_DAY;
    }
    progress.push({
      _id: `progress-${id}`,
      level,
      reviewed,
    });
  }

  // Create notes with mostly unique keywords
  const notes = [];
  for (let i = 0; i < NUM_NOTES; i++) {
    const id = generateUniqueTimestampId();

    const keywords = [];
    const rand = Math.random();
    // Alternate between three different cases
    if (rand < 0.5) {
      // Case 1: A single keyword
      keywords.push(getRandomKeyword());
    } else if (rand < 0.7) {
      // Case 2: Two keywords
      keywords.push(getRandomKeyword());
      keywords.push(getRandomKeyword());
    } else {
      // Case 3: A single character of a keyword
      const singleCharKeyword = [...getRandomKeyword()][0];
      keywords.push(singleCharKeyword);
    }

    const contentLength = Math.floor(Math.random() * 20 + 10);
    const created = Math.floor(now - Math.random() * 365 * 2 * MS_PER_DAY);
    let modified;
    if (Math.random() < 0.5) {
      modified = created + Math.floor(Math.random() * (now - created));
    } else {
      modified = created;
    }

    notes.push({
      _id: `note-${id}`,
      keywords,
      content: generateRandomString(contentLength),
      created,
      modified,
    });
  }

  return { cards, progress, notes };
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

async function runKeywordFetchTestNoIndex(testData, searchKeys) {
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

async function runKeywordFetchTestNaiveIndex(testData, searchKeys) {
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

async function runKeywordFetchTestIndexWithId(testData, searchKeys) {
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

async function runKeywordFetchTestWithKeywordsArrayView(testData, searchKeys) {
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
