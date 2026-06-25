const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/init');
const { generateFlashcards } = require('../services/ai');

const router = express.Router();

// Generate flashcards from sources
router.post('/generate', async (req, res) => {
  try {
    const { sourceIds, topic, count } = req.body;

    if (!sourceIds || !Array.isArray(sourceIds) || sourceIds.length === 0) {
      return res.status(400).json({ error: 'Please upload source files first' });
    }

    const db = getDb();
    const placeholders = sourceIds.map(() => '?').join(',');
    const sources = db.prepare(
      `SELECT filename, content FROM sources WHERE id IN (${placeholders})`
    ).all(...sourceIds);

    if (sources.length === 0) {
      return res.status(404).json({ error: 'No sources found' });
    }

    const sourceText = sources.map(s => `--- ${s.filename} ---\n${s.content}`).join('\n\n');
    const cardCount = Math.min(Math.max(parseInt(count) || 10, 5), 20);
    const deck = await generateFlashcards(sourceText, topic || '', cardCount);

    // Save if user is logged in
    if (req.session.userId) {
      const id = uuidv4();
      db.prepare('INSERT INTO flashcard_decks (id, user_id, topic, cards, card_count) VALUES (?, ?, ?, ?, ?)')
        .run(id, req.session.userId, topic || 'Study Material', JSON.stringify(deck.cards), deck.cards.length);
      deck.id = id;
    }

    res.json(deck);
  } catch (err) {
    console.error('Flashcard generation error:', err);
    res.status(500).json({ error: err.message || 'Failed to generate flashcards. Please try again.' });
  }
});

// Get all saved decks
router.get('/decks', (req, res) => {
  if (!req.session.userId) {
    return res.json([]);
  }

  const db = getDb();
  const decks = db.prepare(
    'SELECT id, topic, card_count, created_at FROM flashcard_decks WHERE user_id = ? ORDER BY created_at DESC LIMIT 30'
  ).all(req.session.userId);

  res.json(decks);
});

// Get a specific deck
router.get('/deck/:id', (req, res) => {
  const db = getDb();
  const deck = db.prepare('SELECT * FROM flashcard_decks WHERE id = ?').get(req.params.id);

  if (!deck) {
    return res.status(404).json({ error: 'Deck not found' });
  }

  deck.cards = JSON.parse(deck.cards);
  res.json(deck);
});

// Delete a deck
router.delete('/deck/:id', (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not logged in' });
  }

  const db = getDb();
  db.prepare('DELETE FROM flashcard_decks WHERE id = ? AND user_id = ?').run(req.params.id, req.session.userId);
  res.json({ message: 'Deleted' });
});

module.exports = router;
