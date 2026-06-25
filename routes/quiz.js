const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/init');
const { generateQuiz } = require('../services/ai');

const router = express.Router();

// Generate a quiz from sources
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
    const questionCount = Math.min(Math.max(parseInt(count) || 5, 3), 15);
    const quiz = await generateQuiz(sourceText, topic || '', questionCount);

    // Save if user is logged in
    if (req.session.userId) {
      const id = uuidv4();
      db.prepare('INSERT INTO quizzes (id, user_id, topic, questions, total) VALUES (?, ?, ?, ?, ?)')
        .run(id, req.session.userId, topic || 'Study Material', JSON.stringify(quiz.questions), quiz.questions.length);
      quiz.id = id;
    }

    res.json(quiz);
  } catch (err) {
    console.error('Quiz generation error:', err);
    res.status(500).json({ error: err.message || 'Failed to generate quiz. Please try again.' });
  }
});

// Submit quiz answers and get score
router.post('/check', (req, res) => {
  try {
    const { quizId, questions, answers } = req.body;

    if (!questions || !answers) {
      return res.status(400).json({ error: 'Questions and answers are required' });
    }

    let correct = 0;
    const results = questions.map((q, i) => {
      const userAnswer = answers[i] || '';
      const isCorrect = userAnswer === q.correct;
      if (isCorrect) correct++;
      return { ...q, userAnswer, isCorrect };
    });

    const score = correct;
    const total = questions.length;

    // Update score in DB
    if (req.session.userId && quizId) {
      const db = getDb();
      db.prepare('UPDATE quizzes SET score = ? WHERE id = ? AND user_id = ?')
        .run(score, quizId, req.session.userId);
    }

    res.json({ score, total, percentage: Math.round((score / total) * 100), results });
  } catch (err) {
    console.error('Quiz check error:', err);
    res.status(500).json({ error: 'Failed to check quiz.' });
  }
});

module.exports = router;
