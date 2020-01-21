import { runKeywordFetchTest } from './keyword-fetch-test.mjs';
import { runOverdueCardsTest } from './overdue-cards-test.mjs';

const go = document.getElementById('go');
go.addEventListener('click', () => {
  const testToRun = document.getElementById('test');
  const numCards = parseInt(document.getElementById('num-cards').value);
  const numNotes = parseInt(document.getElementById('num-notes').value);

  switch (testToRun.value) {
    case 'keyword-fetch':
      runKeywordFetchTest({ numCards, numNotes });
      break;

    case 'overdue-cards':
      runOverdueCardsTest({ numCards, numNotes });
      break;
  }
});
