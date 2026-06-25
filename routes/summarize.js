const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/init');
const { summarizeNotes } = require('../services/ai');

const router = express.Router();

// Summarize from source IDs
router.post('/', async (req, res) => {
  try {
    const { sourceIds, text } = req.body;
    let contentToSummarize = '';

    if (sourceIds && Array.isArray(sourceIds) && sourceIds.length > 0) {
      const db = getDb();
      const placeholders = sourceIds.map(() => '?').join(',');
      const sources = db.prepare(
        `SELECT filename, content FROM sources WHERE id IN (${placeholders})`
      ).all(...sourceIds);

      if (sources.length === 0) {
        return res.status(404).json({ error: 'No sources found' });
      }

      contentToSummarize = sources.map(s => `--- ${s.filename} ---\n${s.content}`).join('\n\n');
    } else if (text && text.trim()) {
      contentToSummarize = text.trim();
    } else {
      return res.status(400).json({ error: 'Please provide source files or text to summarize' });
    }

    if (contentToSummarize.length < 50) {
      return res.status(400).json({ error: 'Content is too short to summarize (minimum 50 characters)' });
    }

    const summary = await summarizeNotes(contentToSummarize);

    // Save if user is logged in
    if (req.session.userId) {
      const db = getDb();
      const id = uuidv4();
      db.prepare('INSERT INTO summaries (id, user_id, original_text, summary) VALUES (?, ?, ?, ?)')
        .run(id, req.session.userId, contentToSummarize.substring(0, 5000), summary);
    }

    res.json({ summary });
  } catch (err) {
    console.error('Summarize error:', err);
    res.status(500).json({ error: 'Failed to summarize. Please try again.' });
  }
});

// Get summary history
router.get('/history', (req, res) => {
  if (!req.session.userId) {
    return res.json([]);
  }

  const db = getDb();
  const history = db.prepare(
    'SELECT id, original_text, summary, created_at FROM summaries WHERE user_id = ? ORDER BY created_at DESC LIMIT 30'
  ).all(req.session.userId);

  res.json(history);
});

module.exports = router;
