import { waitForIdle } from './wait-for-idle.mjs';
import { getTestData } from './test-data.mjs';
import {
  log,
  logResults,
  clear,
  prepareTestDatabase,
  compareQueryResults,
} from './utils.mjs';

const MS_PER_DAY = 1000 * 60 * 60 * 24;
const EXP_FACTOR = 0.00225;

const output = document.querySelector('output');

export async function runOverdueCardsTest({ numCards, numNotes }) {
  clear(output);

  const queryResults = [];

  try {
    log(
      `Generating test data for ${numCards} card(s) and ${numNotes} note(s)...`
    );
    const testData = getTestData({ numCards, numNotes });

    log('Running overdueness test...');
    queryResults.push(await runViewTest(testData));
    queryResults.push(await runIndexTest(testData));
    queryResults.push(await runIndexWithIdTest(testData));
    queryResults.push(await runNoIndexTest(testData));

    log('Re-running all tests a second time in reverse order...');
    await runNoIndexTest(testData);
    await runIndexWithIdTest(testData);
    await runIndexTest(testData);
    await runViewTest(testData);

    log('Done.');
  } catch (e) {
    log(e.message, 'error');
  }

  compareQueryResults(queryResults);
}

// 1. With separate overdueness view (current setup)

async function runViewTest(testData, searchKeys) {
  // Prep
  log('1. Overdueness view', 'heading');
  log('Preparing database...');
  const db = await prepareTestDatabase(testData);
  await waitForIdle();
  log('Running test...');

  const reviewTime = new Date();

  // Run test
  const startTime = performance.now();
  await db.put({
    _id: `_design/overdueness`,
    views: {
      overdueness: {
        map: `function(doc) {
    if (
      !doc._id.startsWith('progress-') ||
      typeof doc.level !== 'number' ||
      typeof doc.due !== 'number'
    ) {
      return;
    }
    if (doc.level === 0) {
      // Unfortunately 'Infinity' doesn't seem to work here
      emit(Number.MAX_VALUE, {
        _id: 'card-' + doc._id.substr('progress-'.length),
        progress: {
          level: 0,
          due: doc.due,
        },
      });
      return;
    }

    const daysOverdue = (${reviewTime.getTime()} - doc.due) / ${MS_PER_DAY};
    const linearComponent = daysOverdue / doc.level;
    const expComponent = Math.exp(${EXP_FACTOR} * daysOverdue) - 1;
    const overdueValue = linearComponent + expComponent;
    emit(overdueValue, {
        _id: 'card-' + doc._id.substr('progress-'.length),
      progress: {
        level: doc.level,
        due: doc.due,
      }
    });
  }`,
      },
    },
  });
  await db.query('overdueness', { limit: 0 });
  const indexCreationTimeMs = performance.now() - startTime;

  const timeResults = [];
  let queryResult;
  for (let i = 0; i < 5; i++) {
    const runStartTime = performance.now();
    const result = await db.query('overdueness', {
      include_docs: true,
      descending: true,
      endkey: 0,
    });
    queryResult = result.rows.map(row => ({
      ...row.doc,
      progress: row.value.progress,
    }));
    timeResults.push(performance.now() - runStartTime);
  }
  const durationMs = performance.now() - startTime;

  // Clean up
  await db.destroy();

  log(`Index creation took ${indexCreationTimeMs}ms`);
  logResults(durationMs, timeResults);

  return queryResult;
}

// 2. Using an index on due field

async function runIndexTest(testData, searchKeys) {
  // Prep
  log('2. Due index', 'heading');
  log('Preparing database...');
  const db = await prepareTestDatabase(testData);
  await waitForIdle();
  log('Running test...');

  const reviewTime = new Date();

  // Run test
  const startTime = performance.now();
  await db.createIndex({
    index: {
      fields: ['due'],
      name: 'due',
      ddoc: 'progress_by_due_date',
    },
  });
  const indexCreationTimeMs = performance.now() - startTime;

  const timeResults = [];
  let queryResult;
  for (let i = 0; i < 5; i++) {
    const runStartTime = performance.now();
    const findResult = await db.find({
      selector: {
        _id: { $gt: 'progress-', $lt: 'progress-\ufff0' },
        due: { $gt: 0, $lte: reviewTime.getTime() },
      },
      use_index: ['progress_by_due_date', 'due'],
    });

    const reviewTimeAsNumber = reviewTime.getTime();
    const progressByOverdueness = [];
    for (const doc of findResult.docs) {
      progressByOverdueness.push([
        getOverdueness(doc, reviewTimeAsNumber),
        doc,
      ]);
    }
    progressByOverdueness.sort((a, b) => b[0] - a[0]);

    const progressDocs = progressByOverdueness.map(([_, doc]) => doc);
    queryResult = await getCardsFromProgressDocs(db, progressDocs);

    timeResults.push(performance.now() - runStartTime);
  }
  const durationMs = performance.now() - startTime;

  // Clean up
  await db.destroy();

  log(`Index creation took ${indexCreationTimeMs}ms`);
  logResults(durationMs, timeResults);

  return queryResult;
}

// 3. Using an index on due and ID fields
//
// XXX This currently produces wrong results when using indexeddb adapter on
// both Firefox and Chrome. It works with the idb adapter but takes longer so
// it's possibly just wrong.

async function runIndexWithIdTest(testData, searchKeys) {
  // Prep
  log('3. Due and ID index', 'heading');
  log('Preparing database...');
  const db = await prepareTestDatabase(testData);
  await waitForIdle();
  log('Running test...');

  const reviewTime = new Date();

  // Run test
  const startTime = performance.now();
  await db.createIndex({
    index: {
      fields: ['_id', 'due'],
      name: 'due',
      ddoc: 'progress_by_due_date',
    },
  });
  const indexCreationTimeMs = performance.now() - startTime;

  const timeResults = [];
  let queryResult;
  for (let i = 0; i < 5; i++) {
    const runStartTime = performance.now();
    const findResult = await db.find({
      selector: {
        _id: { $gt: 'progress-', $lt: 'progress-\ufff0' },
        due: { $gt: 0, $lte: reviewTime.getTime() },
      },
      use_index: ['progress_by_due_date', 'due'],
    });

    const reviewTimeAsNumber = reviewTime.getTime();
    const progressByOverdueness = [];
    for (const doc of findResult.docs) {
      progressByOverdueness.push([
        getOverdueness(doc, reviewTimeAsNumber),
        doc,
      ]);
    }
    progressByOverdueness.sort((a, b) => b[0] - a[0]);

    const progressDocs = progressByOverdueness.map(([_, doc]) => doc);
    queryResult = await getCardsFromProgressDocs(db, progressDocs);

    timeResults.push(performance.now() - runStartTime);
  }
  const durationMs = performance.now() - startTime;

  // Clean up
  await db.destroy();

  log(`Index creation took ${indexCreationTimeMs}ms`);
  logResults(durationMs, timeResults);

  return queryResult;
}

// 4. Using no index

async function runNoIndexTest(testData, searchKeys) {
  // Prep
  log('4. No index', 'heading');
  log('Preparing database...');
  const db = await prepareTestDatabase(testData);
  await waitForIdle();
  log('Running test...');

  const reviewTime = new Date();

  // Run test
  const startTime = performance.now();

  const timeResults = [];
  let queryResult;
  for (let i = 0; i < 5; i++) {
    const runStartTime = performance.now();
    const findResult = await db.find({
      selector: {
        _id: { $gt: 'progress-', $lt: 'progress-\ufff0' },
        due: { $gt: 0, $lte: reviewTime.getTime() },
      },
    });

    const reviewTimeAsNumber = reviewTime.getTime();
    const progressByOverdueness = [];
    for (const doc of findResult.docs) {
      progressByOverdueness.push([
        getOverdueness(doc, reviewTimeAsNumber),
        doc,
      ]);
    }
    progressByOverdueness.sort((a, b) => b[0] - a[0]);

    const progressDocs = progressByOverdueness.map(([_, doc]) => doc);
    queryResult = await getCardsFromProgressDocs(db, progressDocs);

    timeResults.push(performance.now() - runStartTime);
  }
  const durationMs = performance.now() - startTime;

  // Clean up
  await db.destroy();

  logResults(durationMs, timeResults);

  return queryResult;
}

function getOverdueness(doc, reviewTimeAsNumber) {
  const daysOverdue = (reviewTimeAsNumber - doc.due) / MS_PER_DAY;
  const linearComponent = daysOverdue / doc.level;
  const expComponent = Math.exp(EXP_FACTOR * daysOverdue) - 1;

  return linearComponent + expComponent;
}

async function getCardsFromProgressDocs(db, progressDocs) {
  const keys = progressDocs.map(doc => doc._id.replace('progress-', 'card-'));
  const cards = await db.allDocs({
    include_docs: true,
    keys,
  });

  if (cards.rows.length !== progressDocs.length) {
    throw new Error('Got mismatched number of card records');
  }

  const result = [];
  for (let i = 0; i < cards.rows.length; i++) {
    const cardDoc = cards.rows[i];
    if (!cardDoc.doc || cardDoc.error) {
      console.warn(
        `Got missing card for progress record ${progressDocs[i]._id}`
      );
      continue;
    }
    if (cardDoc.value.deleted) {
      console.warn(
        `Got deleted card for progress record ${progressDocs[i]._id}`
      );
      continue;
    }

    result.push({
      ...cardDoc.doc,
      progress: {
        level: progressDocs[i].level,
        due: progressDocs[i].due,
      },
    });
  }

  return result;
}
