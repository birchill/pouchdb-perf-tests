const output = document.querySelector('output');

export function log(message, className = 'log') {
  const logElem = document.createElement('div');
  logElem.classList.add(className);
  logElem.textContent = message;
  output.append(logElem);
}

export function logResults(totalDuration, results) {
  const averageMs = results.reduce((a, b) => a + b, 0) / results.length;
  const maxMs = Math.max(...results);

  log(
    `Test completed in ${totalDuration}ms, average query time ${averageMs}ms, max query time ${maxMs}ms`,
    'result'
  );
}

export function clear(elem) {
  while (elem.children.length) {
    elem.lastChild.remove();
  }
}

export async function prepareTestDatabase(testData) {
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

export function compareQueryResults(queryResults) {
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
