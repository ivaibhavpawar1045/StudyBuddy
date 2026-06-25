require('dotenv').config();

const express = require('express');
const session = require('express-session');
const path = require('path');
const { getDb } = require('./db/init');
const { initAI } = require('./services/ai');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ─────────────────────────────────────────────────
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

app.use(session({
  secret: process.env.SESSION_SECRET || 'study-buddy-dev-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    httpOnly: true,
    sameSite: 'lax'
  }
}));

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// ── API Routes ────────────────────────────────────────────────
app.use('/api/auth', require('./routes/auth'));
app.use('/api/sources', require('./routes/sources'));
app.use('/api/chat', require('./routes/chat'));
app.use('/api/summarize', require('./routes/summarize'));
app.use('/api/quiz', require('./routes/quiz'));
app.use('/api/flashcards', require('./routes/flashcards'));

// ── SPA Fallback ──────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Error Handler ─────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ── Start ─────────────────────────────────────────────────────
function start() {
  // Initialize database
  getDb();
  console.log('✅ Database initialized');

  // Initialize AI
  const aiReady = initAI();
  if (aiReady) {
    console.log('✅ Gemini AI initialized');
  } else {
    console.log('⚠️  AI running in mock mode (set GEMINI_API_KEY in .env)');
  }

  if (!process.env.VERCEL) {
    app.listen(PORT, () => {
      console.log(`\n🎓 Study Buddy is running at http://localhost:${PORT}\n`);
    });
  }
}

start();

module.exports = app;
