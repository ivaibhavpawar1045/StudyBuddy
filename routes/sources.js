const express = require('express');
const multer = require('multer');
const pdf = require('pdf-parse');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/init');

const router = express.Router();

// Configure multer for memory storage (no files saved to disk)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (req, file, cb) => {
    const allowed = ['text/plain', 'application/pdf'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only .txt and .pdf files are allowed'));
    }
  }
});

// Upload a source file
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    let content = '';
    const fileType = req.file.mimetype === 'application/pdf' ? 'pdf' : 'txt';

    if (fileType === 'pdf') {
      try {
        const parseFunc = typeof pdf === 'function' ? pdf : (pdf.default || pdf.PDFParse || pdf);
        if (typeof parseFunc !== 'function') throw new Error('PDF parse library failed to load a valid function');
        const data = await parseFunc(req.file.buffer);
        content = data.text;
      } catch (e) {
        console.error('PDF parse error:', e);
        return res.status(400).json({ error: 'Failed to parse PDF. Make sure it contains readable text.' });
      }
    } else {
      content = req.file.buffer.toString('utf-8');
    }

    if (!content || content.trim().length < 20) {
      return res.status(400).json({ error: 'File has too little readable text (minimum 20 characters).' });
    }

    const id = uuidv4();
    const filename = req.file.originalname;
    const charCount = content.trim().length;

    const db = getDb();
    db.prepare(
      'INSERT INTO sources (id, user_id, filename, file_type, content, char_count) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(id, req.session.userId || null, filename, fileType, content.trim(), charCount);

    res.json({
      id,
      filename,
      file_type: fileType,
      char_count: charCount,
      preview: content.trim().substring(0, 200) + (charCount > 200 ? '...' : ''),
      created_at: new Date().toISOString()
    });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: err.message || 'Failed to upload file' });
  }
});

// Get all sources (session-based or recent anonymous)
router.get('/', (req, res) => {
  const db = getDb();
  let sources;

  if (req.session.userId) {
    sources = db.prepare(
      'SELECT id, filename, file_type, char_count, created_at FROM sources WHERE user_id = ? ORDER BY created_at DESC'
    ).all(req.session.userId);
  } else {
    // For anonymous users, return sources from the last hour
    sources = db.prepare(
      'SELECT id, filename, file_type, char_count, created_at FROM sources WHERE user_id IS NULL ORDER BY created_at DESC LIMIT 20'
    ).all();
  }

  res.json(sources);
});

// Get source content by ID
router.get('/:id', (req, res) => {
  const db = getDb();
  const source = db.prepare('SELECT * FROM sources WHERE id = ?').get(req.params.id);

  if (!source) {
    return res.status(404).json({ error: 'Source not found' });
  }

  res.json(source);
});

// Get combined content of multiple sources
router.post('/combined', (req, res) => {
  const { sourceIds } = req.body;

  if (!sourceIds || !Array.isArray(sourceIds) || sourceIds.length === 0) {
    return res.status(400).json({ error: 'No source IDs provided' });
  }

  const db = getDb();
  const placeholders = sourceIds.map(() => '?').join(',');
  const sources = db.prepare(
    `SELECT id, filename, content FROM sources WHERE id IN (${placeholders})`
  ).all(...sourceIds);

  if (sources.length === 0) {
    return res.status(404).json({ error: 'No sources found' });
  }

  const combined = sources.map(s => `--- ${s.filename} ---\n${s.content}`).join('\n\n');
  res.json({ content: combined, sourceCount: sources.length });
});

// Delete a source
router.delete('/:id', (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM sources WHERE id = ?').run(req.params.id);
  res.json({ message: 'Deleted' });
});

module.exports = router;
