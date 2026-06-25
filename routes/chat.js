const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/init');
const { explainTopic } = require('../services/ai');

const router = express.Router();

// Ask a question (optionally with source context)
router.post('/', async (req, res) => {
  try {
    const { question, sourceIds } = req.body;

    if (!question || !question.trim()) {
      return res.status(400).json({ error: 'Please provide a question' });
    }

    // Get source context if source IDs provided
    let sourceContext = '';
    if (sourceIds && Array.isArray(sourceIds) && sourceIds.length > 0) {
      const db = getDb();
      const placeholders = sourceIds.map(() => '?').join(',');
      const sources = db.prepare(
        `SELECT filename, content FROM sources WHERE id IN (${placeholders})`
      ).all(...sourceIds);
      sourceContext = sources.map(s => `--- ${s.filename} ---\n${s.content}`).join('\n\n');
    }

    const answer = await explainTopic(question.trim(), sourceContext);

    // Save to history if user is logged in
    if (req.session.userId) {
      const db = getDb();
      const id = uuidv4();
      db.prepare('INSERT INTO chat_history (id, user_id, question, answer) VALUES (?, ?, ?, ?)')
        .run(id, req.session.userId, question.trim(), answer);
    }

    res.json({ question: question.trim(), answer });
  } catch (err) {
    console.error('Chat error:', err);
    res.status(500).json({ error: 'Failed to get AI response. Please try again.' });
  }
});

// Get chat history
router.get('/history', (req, res) => {
  if (!req.session.userId) {
    return res.json([]);
  }

  const db = getDb();
  const history = db.prepare(
    'SELECT id, question, answer, created_at FROM chat_history WHERE user_id = ? ORDER BY created_at DESC LIMIT 50'
  ).all(req.session.userId);

  res.json(history);
});

// Delete a chat entry
router.delete('/history/:id', (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not logged in' });
  }

  const db = getDb();
  db.prepare('DELETE FROM chat_history WHERE id = ? AND user_id = ?').run(req.params.id, req.session.userId);
  res.json({ message: 'Deleted' });
});

module.exports = router;
