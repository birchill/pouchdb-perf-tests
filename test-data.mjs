const MS_PER_DAY = 1000 * 60 * 60 * 24;
let prevTimeStamp = 0;

export function getTestData({ numCards, numNotes }) {
  // Create 75% unique keywords to share between cards and notes
  const keywordSet = new Set();
  while (keywordSet.size < numNotes * 0.75) {
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
  for (let i = 0; i < numCards; i++) {
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
    let due;
    if (newCards < 50 && Math.random() < 0.05) {
      level = 0;
      due = null;
    } else {
      level = Math.random() * 365;
      // Set the due time so that we have a small-ish (~16.667%) chance
      // of being overdue.
      const overdueness = Math.random() * 1.2 - 1;
      due = now - level * MS_PER_DAY * overdueness;
    }
    progress.push({
      _id: `progress-${id}`,
      level,
      due,
    });
  }

  // Create notes with mostly unique keywords
  const notes = [];
  for (let i = 0; i < numNotes; i++) {
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
