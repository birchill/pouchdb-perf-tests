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

export async function runFetchByIdTest({ numCards, numNotes }) {
  clear(output);

  const queryResults = [];

  try {
    log(
      `Generating test data for ${numCards} card(s) and ${numNotes} note(s)...`
    );
    const testData = getTestData({ numCards, numNotes });
    const idsToFetch = getIdsToFetch(testData.cards);

    log('Running overdueness test...');
    queryResults.push(await runViewTest(testData, idsToFetch));
    queryResults.push(await runIdTest(testData, idsToFetch));

    log('Re-running all tests a second time in reverse order...');
    await runIdTest(testData, idsToFetch);
    await runViewTest(testData, idsToFetch);

    log('Done.');
  } catch (e) {
    log(e.message, 'error');
  }

  compareQueryResults(queryResults);
}

function getIdsToFetch(cards) {
  // We typically would fetch a whole review at once which would be, say, 20
  // cards. But just to exercise the function a little more, let's try a review
  // of 100 cards.
  const numIds = Math.min(cards.length, 100);
  const result = new Set();

  while (result.size < numIds) {
    const index = Math.floor(Math.random() * cards.length);
    const id = cards[index]._id.substr('card-'.length);
    result.add(id);
  }

  // Add a couple of missing cards
  result.add('definitely-not-an-id');
  result.add('neither-is-this');

  return [...result];
}

// 1. With separate combined view (current setup)

async function runViewTest(testData, idsToFetch) {
  // Prep
  log('1. Lookup by view', 'heading');
  log('Preparing database...');
  const db = await prepareTestDatabase(testData);
  await waitForIdle();
  log('Running test...');

  const reviewTime = new Date();

  // Run test
  const startTime = performance.now();
  await db.put({
    _id: `_design/cards`,
    views: {
      cards: {
        map: `function(doc) {
    if (!doc._id.startsWith('progress-')) {
      return;
    }

    emit(doc._id, {
      _id: 'card-' + doc._id.substr('progress-'.length),
      progress: {
        level: doc.level,
        due: doc.due,
      },
    });
  }`,
      },
    },
  });
  await db.query('cards', { limit: 0 });
  const indexCreationTimeMs = performance.now() - startTime;

  const timeResults = [];
  let queryResult;
  for (let i = 0; i < 5; i++) {
    const runStartTime = performance.now();
    const keys = idsToFetch.map(id => `progress-${id}`);
    const result = await db.query('cards', {
      keys,
      include_docs: true,
    });
    queryResult = result.rows.map(row => {
      // TODO: This doesn't actually work. Despite what the docs say, query
      // doesn't return error objects for missing keys.
      if (row.doc && !row.deleted && !row.error) {
        return {
          ...row.doc,
          progress: row.value.progress,
        };
      } else {
        return { status: 'missing' };
      }
    });
    timeResults.push(performance.now() - runStartTime);
  }
  const durationMs = performance.now() - startTime;

  // Clean up
  await db.destroy();

  log(`Index creation took ${indexCreationTimeMs}ms`);
  logResults(durationMs, timeResults);

  return queryResult;
}

// 2. Looking up by ID twice and pairing them up

async function runIdTest(testData, idsToFetch) {
  // Prep
  log('2. Lookup by ID twice', 'heading');
  log('Preparing database...');
  const db = await prepareTestDatabase(testData);
  await waitForIdle();
  log('Running test...');

  const reviewTime = new Date();

  // Run test
  const startTime = performance.now();

  const timeResults = [];
  let queryResult = [];
  for (let i = 0; i < 5; i++) {
    const runStartTime = performance.now();
    queryResult = [];

    const progressKeys = idsToFetch.map(id => `progress-${id}`);
    const progressResult = await db.allDocs({
      include_docs: true,
      keys: progressKeys,
    });

    const cardKeys = idsToFetch.map(id => `card-${id}`);
    const cardResult = await db.allDocs({
      include_docs: true,
      keys: cardKeys,
    });

    if (progressResult.rows.length !== cardResult.rows.length) {
      throw new Error(
        `Got mismatched number of card records (progress: ${progressResult.rows.length} vs cards: ${cardResult.rows.length})`
      );
    }

    for (const [i, progressRow] of progressResult.rows.entries()) {
      if (!progressRow.doc) {
        queryResult.push({ status: 'missing' });
        continue;
      }

      queryResult.push({
        ...cardResult.rows[i].doc,
        progress: { level: progressRow.doc.level, due: progressRow.doc.due },
      });
    }

    timeResults.push(performance.now() - runStartTime);
  }
  const durationMs = performance.now() - startTime;

  // Clean up
  await db.destroy();

  logResults(durationMs, timeResults);

  return queryResult;
}
