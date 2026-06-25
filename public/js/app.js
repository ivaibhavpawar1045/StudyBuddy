/* ═══════════════════════════════════════════════════════════════
   Study Buddy — NotebookLM-Inspired Frontend
   ═══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  // ── State ───────────────────────────────────────────────────
  const state = {
    user: null,
    sources: [],         // { id, filename, file_type, char_count, selected }
    selectedSourceIds: [],
    currentView: 'welcome', // welcome | summary | quiz | flashcards | chat
    quiz: { questions: [], currentIndex: 0, answers: {}, id: null },
    flashcards: { cards: [], currentIndex: 0, topic: '' }
  };

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  // ── Init ────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', () => {
    initUpload();
    initActions();
    initChat();
    initQuiz();
    initFlashcards();
    initAuth();
    checkAuth();
    loadSources();
  });

  // ═══════════════════════════════════════════════════════════
  //  SOURCES / FILE UPLOAD
  // ═══════════════════════════════════════════════════════════

  function initUpload() {
    const dropzone = $('#dropzone');
    const fileInput = $('#fileInput');

    // Click to open file picker
    dropzone.addEventListener('click', () => fileInput.click());

    // File selected via picker
    fileInput.addEventListener('change', (e) => {
      if (e.target.files.length > 0) uploadFiles(e.target.files);
      fileInput.value = '';
    });

    // Drag & drop
    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('dragover');
    });
    dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
      if (e.dataTransfer.files.length > 0) uploadFiles(e.dataTransfer.files);
    });

    // Select all button
    $('#selectAllBtn').addEventListener('click', toggleSelectAll);
  }

  async function uploadFiles(fileList) {
    for (const file of fileList) {
      const ext = file.name.split('.').pop().toLowerCase();
      if (!['txt', 'pdf'].includes(ext)) {
        showToast(`Skipped "${file.name}" — only TXT and PDF files are supported`, 'error');
        continue;
      }

      // Show uploading state
      addUploadingItem(file.name);

      try {
        const formData = new FormData();
        formData.append('file', file);

        const res = await fetch('/api/sources/upload', {
          method: 'POST',
          body: formData
        });
        const data = await res.json();

        removeUploadingItem(file.name);

        if (data.error) {
          showToast(`Failed: ${data.error}`, 'error');
          continue;
        }

        // Add to state and auto-select
        data.selected = true;
        state.sources.unshift(data);
        state.selectedSourceIds.push(data.id);

        showToast(`📄 "${data.filename}" uploaded successfully`, 'success');
      } catch (err) {
        removeUploadingItem(file.name);
        showToast(`Failed to upload "${file.name}"`, 'error');
      }
    }

    renderSourceList();
    updateActionCards();
  }

  function addUploadingItem(name) {
    let container = $('#uploadProgressArea');
    if (!container) {
      container = document.createElement('div');
      container.id = 'uploadProgressArea';
      container.className = 'upload-progress';
      $('#sourceList').before(container);
    }
    const item = document.createElement('div');
    item.className = 'upload-progress-item';
    item.dataset.name = name;
    item.innerHTML = `<span class="spinner" style="width:16px;height:16px;border-width:2px;"></span> Uploading ${name}...`;
    container.appendChild(item);
  }

  function removeUploadingItem(name) {
    const container = $('#uploadProgressArea');
    if (!container) return;
    const item = container.querySelector(`[data-name="${CSS.escape(name)}"]`);
    if (item) item.remove();
    if (container.children.length === 0) container.remove();
  }

  async function loadSources() {
    try {
      const res = await fetch('/api/sources');
      const sources = await res.json();
      state.sources = sources.map(s => ({ ...s, selected: false }));
      renderSourceList();
      updateActionCards();
    } catch (e) {
      // Silent fail
    }
  }

  function renderSourceList() {
    const list = $('#sourceList');
    const empty = $('#sourceEmpty');
    const selectAllBtn = $('#selectAllBtn');

    if (state.sources.length === 0) {
      list.innerHTML = '';
      list.appendChild(empty);
      empty.style.display = 'block';
      selectAllBtn.style.display = 'none';
      return;
    }

    empty.style.display = 'none';
    selectAllBtn.style.display = 'block';

    const allSelected = state.sources.every(s => state.selectedSourceIds.includes(s.id));
    selectAllBtn.textContent = allSelected ? '☐ Deselect All' : '☑ Select All';

    list.innerHTML = state.sources.map(s => {
      const isSelected = state.selectedSourceIds.includes(s.id);
      const icon = s.file_type === 'pdf' ? '📕' : '📄';
      const size = s.char_count > 1000 ? `${(s.char_count / 1000).toFixed(1)}k chars` : `${s.char_count} chars`;
      return `
        <div class="source-item ${isSelected ? 'selected' : ''}" data-id="${s.id}" id="source-${s.id}">
          <div class="source-checkbox">${isSelected ? '✓' : ''}</div>
          <span class="source-file-icon">${icon}</span>
          <div class="source-info">
            <div class="source-name" title="${s.filename}">${s.filename}</div>
            <div class="source-meta">${size}</div>
          </div>
          <button class="source-delete" data-delete-id="${s.id}" title="Remove">✕</button>
        </div>
      `;
    }).join('');

    // Source click → toggle selection
    list.querySelectorAll('.source-item').forEach(item => {
      item.addEventListener('click', (e) => {
        if (e.target.closest('.source-delete')) return;
        toggleSource(item.dataset.id);
      });
    });

    // Delete buttons
    list.querySelectorAll('.source-delete').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteSource(btn.dataset.deleteId);
      });
    });
  }

  function toggleSource(id) {
    const idx = state.selectedSourceIds.indexOf(id);
    if (idx >= 0) {
      state.selectedSourceIds.splice(idx, 1);
    } else {
      state.selectedSourceIds.push(id);
    }
    renderSourceList();
    updateActionCards();
  }

  function toggleSelectAll() {
    const allSelected = state.sources.every(s => state.selectedSourceIds.includes(s.id));
    if (allSelected) {
      state.selectedSourceIds = [];
    } else {
      state.selectedSourceIds = state.sources.map(s => s.id);
    }
    renderSourceList();
    updateActionCards();
  }

  async function deleteSource(id) {
    try {
      await fetch(`/api/sources/${id}`, { method: 'DELETE' });
      state.sources = state.sources.filter(s => s.id !== id);
      state.selectedSourceIds = state.selectedSourceIds.filter(sid => sid !== id);
      renderSourceList();
      updateActionCards();
      showToast('Source removed', 'info');
    } catch (e) {
      showToast('Failed to delete source', 'error');
    }
  }

  function getSelectedSourceIds() {
    return state.selectedSourceIds;
  }

  function updateActionCards() {
    const hasSources = state.selectedSourceIds.length > 0;
    $$('.action-card').forEach(card => {
      if (hasSources) {
        card.classList.remove('disabled');
      } else {
        card.classList.add('disabled');
      }
    });
  }

  // ═══════════════════════════════════════════════════════════
  //  ACTIONS & VIEW SWITCHING
  // ═══════════════════════════════════════════════════════════

  function initActions() {
    $$('.action-card').forEach(card => {
      card.addEventListener('click', () => {
        if (card.classList.contains('disabled')) {
          showToast('Please upload and select source files first', 'info');
          return;
        }
        const action = card.dataset.action;
        performAction(action);
      });
    });

    // Back buttons
    $('#summaryBackBtn').addEventListener('click', () => showView('welcome'));
    $('#quizBackBtn').addEventListener('click', () => showView('welcome'));
    $('#flashcardsBackBtn').addEventListener('click', () => showView('welcome'));
    $('#chatBackBtn').addEventListener('click', () => showView('welcome'));

    // Copy summary
    $('#copySummaryBtn').addEventListener('click', () => {
      const text = $('#summaryContent').innerText;
      navigator.clipboard.writeText(text).then(() => showToast('Copied to clipboard! 📋', 'success'));
    });
  }

  function showView(view) {
    state.currentView = view;

    // Hide all views
    $('#welcomeState').classList.remove('active');
    $$('.result-view').forEach(v => v.classList.remove('active'));

    if (view === 'welcome') {
      $('#welcomeState').classList.add('active');
    } else if (view === 'summary') {
      $('#summaryView').classList.add('active');
    } else if (view === 'quiz') {
      $('#quizView').classList.add('active');
    } else if (view === 'flashcards') {
      $('#flashcardsView').classList.add('active');
    } else if (view === 'chat') {
      $('#chatView').classList.add('active');
    }
  }

  async function performAction(action) {
    const sourceIds = getSelectedSourceIds();
    if (sourceIds.length === 0) {
      showToast('Please select at least one source', 'info');
      return;
    }

    if (action === 'summarize') {
      showView('summary');
      await generateSummary(sourceIds);
    } else if (action === 'quiz') {
      showView('quiz');
      await startQuiz(sourceIds);
    } else if (action === 'flashcards') {
      showView('flashcards');
      await startFlashcards(sourceIds);
    } else if (action === 'chat') {
      showView('chat');
      // Chat view just opens, user types questions
    }
  }

  // ═══════════════════════════════════════════════════════════
  //  SUMMARIZE
  // ═══════════════════════════════════════════════════════════

  async function generateSummary(sourceIds) {
    const loading = $('#summaryLoading');
    const content = $('#summaryContent');

    loading.style.display = 'flex';
    content.innerHTML = '';

    try {
      const res = await api('/api/summarize', { sourceIds });
      loading.style.display = 'none';

      if (res.error) {
        content.innerHTML = `<p style="color:var(--accent-danger);">❌ ${res.error}</p>`;
        return;
      }

      content.innerHTML = renderMarkdown(res.summary);
    } catch (err) {
      loading.style.display = 'none';
      content.innerHTML = '<p style="color:var(--accent-danger);">❌ Failed to generate summary. Please try again.</p>';
    }
  }

  // ═══════════════════════════════════════════════════════════
  //  QUIZ
  // ═══════════════════════════════════════════════════════════

  function initQuiz() {
    $('#quizPrevBtn').addEventListener('click', () => {
      if (state.quiz.currentIndex > 0) {
        state.quiz.currentIndex--;
        renderQuizQuestion();
      }
    });

    $('#quizNextBtn').addEventListener('click', () => {
      if (state.quiz.currentIndex < state.quiz.questions.length - 1) {
        state.quiz.currentIndex++;
        renderQuizQuestion();
      }
    });

    $('#quizSubmitBtn').addEventListener('click', submitQuiz);
  }

  async function startQuiz(sourceIds) {
    const loading = $('#quizLoading');
    const active = $('#quizActive');
    const results = $('#quizResults');

    loading.style.display = 'flex';
    active.style.display = 'none';
    results.style.display = 'none';

    try {
      const res = await api('/api/quiz/generate', { sourceIds, count: 5 });
      loading.style.display = 'none';

      if (res.error) {
        showToast(res.error, 'error');
        showView('welcome');
        return;
      }

      state.quiz.questions = res.questions;
      state.quiz.currentIndex = 0;
      state.quiz.answers = {};
      state.quiz.id = res.id || null;

      active.style.display = 'block';
      renderQuizQuestion();
    } catch (err) {
      loading.style.display = 'none';
      showToast('Failed to generate quiz. Please try again.', 'error');
      showView('welcome');
    }
  }

  function renderQuizQuestion() {
    const q = state.quiz.questions[state.quiz.currentIndex];
    const total = state.quiz.questions.length;
    const idx = state.quiz.currentIndex;

    const pct = ((idx + 1) / total) * 100;
    $('#quizProgress').style.width = pct + '%';
    $('#quizProgressText').textContent = `${idx + 1} / ${total}`;

    const area = $('#quizQuestionArea');
    area.innerHTML = `
      <div class="quiz-question-card">
        <h3>${escapeHtml(q.question)}</h3>
        <div class="quiz-options">
          ${Object.entries(q.options).map(([letter, text]) => `
            <button class="quiz-option ${state.quiz.answers[idx] === letter ? 'selected' : ''}"
                    data-option="${letter}" id="quiz-opt-${letter}">
              <span class="option-letter">${letter}</span>
              <span>${escapeHtml(text)}</span>
            </button>
          `).join('')}
        </div>
      </div>
    `;

    area.querySelectorAll('.quiz-option').forEach(opt => {
      opt.addEventListener('click', () => {
        state.quiz.answers[idx] = opt.dataset.option;
        renderQuizQuestion();
      });
    });

    $('#quizPrevBtn').disabled = idx === 0;
    $('#quizNextBtn').style.display = idx === total - 1 ? 'none' : 'inline-flex';
    $('#quizSubmitBtn').style.display = idx === total - 1 ? 'inline-flex' : 'none';
  }

  async function submitQuiz() {
    const answeredCount = Object.keys(state.quiz.answers).length;
    const total = state.quiz.questions.length;

    if (answeredCount < total) {
      showToast(`You have ${total - answeredCount} unanswered question(s).`, 'error');
      return;
    }

    try {
      const res = await api('/api/quiz/check', {
        quizId: state.quiz.id,
        questions: state.quiz.questions,
        answers: state.quiz.answers
      });

      $('#quizActive').style.display = 'none';
      const resultsDiv = $('#quizResults');
      resultsDiv.style.display = 'block';

      const pct = res.percentage;
      const grade = pct >= 80 ? 'excellent' : pct >= 50 ? 'good' : 'poor';
      const emoji = pct >= 80 ? '🏆' : pct >= 50 ? '👍' : '📖';
      const message = pct >= 80 ? 'Excellent work!' : pct >= 50 ? 'Good effort!' : 'Keep practicing!';

      resultsDiv.innerHTML = `
        <div class="results-summary">
          <div class="score-circle ${grade}">
            <span class="score-number">${pct}%</span>
            <span class="score-label">${res.score}/${res.total}</span>
          </div>
          <h2>${emoji} ${message}</h2>
          <p>${res.score} out of ${res.total} correct</p>
        </div>
        <div class="results-questions">
          ${res.results.map((r, i) => `
            <div class="result-card ${r.isCorrect ? 'correct' : 'incorrect'}">
              <div class="result-question">${i + 1}. ${escapeHtml(r.question)}</div>
              <div class="result-answer">
                Your answer: <strong>${r.userAnswer}</strong> — ${escapeHtml(r.options[r.userAnswer] || '')}
                ${!r.isCorrect ? `<br>Correct: <strong>${r.correct}</strong> — ${escapeHtml(r.options[r.correct])}` : ''}
              </div>
              <div class="result-explanation">💡 ${escapeHtml(r.explanation)}</div>
            </div>
          `).join('')}
        </div>
        <div class="results-actions">
          <button class="btn btn-primary" id="retryQuizBtn">🔄 Retry</button>
          <button class="btn btn-outline" id="newQuizBtn">← Back</button>
        </div>
      `;

      $('#retryQuizBtn').addEventListener('click', () => {
        state.quiz.currentIndex = 0;
        state.quiz.answers = {};
        resultsDiv.style.display = 'none';
        $('#quizActive').style.display = 'block';
        renderQuizQuestion();
      });

      $('#newQuizBtn').addEventListener('click', () => showView('welcome'));
    } catch (err) {
      showToast('Failed to check quiz.', 'error');
    }
  }

  // ═══════════════════════════════════════════════════════════
  //  FLASHCARDS
  // ═══════════════════════════════════════════════════════════

  function initFlashcards() {
    $('#flashcard').addEventListener('click', () => {
      $('#flashcard').classList.toggle('flipped');
    });

    $('#prevCard').addEventListener('click', () => {
      if (state.flashcards.currentIndex > 0) {
        state.flashcards.currentIndex--;
        renderFlashcard();
      }
    });

    $('#nextCard').addEventListener('click', () => {
      if (state.flashcards.currentIndex < state.flashcards.cards.length - 1) {
        state.flashcards.currentIndex++;
        renderFlashcard();
      }
    });

    // Keyboard nav
    document.addEventListener('keydown', (e) => {
      if (state.currentView !== 'flashcards') return;
      if (e.key === 'ArrowLeft' && state.flashcards.currentIndex > 0) {
        state.flashcards.currentIndex--;
        renderFlashcard();
      } else if (e.key === 'ArrowRight' && state.flashcards.currentIndex < state.flashcards.cards.length - 1) {
        state.flashcards.currentIndex++;
        renderFlashcard();
      } else if (e.key === ' ') {
        e.preventDefault();
        $('#flashcard').classList.toggle('flipped');
      }
    });
  }

  async function startFlashcards(sourceIds) {
    const loading = $('#flashcardsLoading');
    const viewer = $('#flashcardViewer');

    loading.style.display = 'flex';
    viewer.style.display = 'none';

    try {
      const res = await api('/api/flashcards/generate', { sourceIds, count: 10 });
      loading.style.display = 'none';

      if (res.error) {
        showToast(res.error, 'error');
        showView('welcome');
        return;
      }

      state.flashcards.cards = res.cards;
      state.flashcards.currentIndex = 0;
      state.flashcards.topic = res.topic;

      viewer.style.display = 'flex';
      renderFlashcard();
    } catch (err) {
      loading.style.display = 'none';
      showToast('Failed to generate flashcards. Please try again.', 'error');
      showView('welcome');
    }
  }

  function renderFlashcard() {
    const card = state.flashcards.cards[state.flashcards.currentIndex];
    const total = state.flashcards.cards.length;
    const idx = state.flashcards.currentIndex;

    $('#cardCounter').textContent = `${idx + 1} / ${total}`;
    $('#flashcardFront').textContent = card.front;
    $('#flashcardBack').textContent = card.back;
    $('#flashcard').classList.remove('flipped');

    $('#prevCard').style.opacity = idx === 0 ? '0.3' : '1';
    $('#prevCard').style.pointerEvents = idx === 0 ? 'none' : 'auto';
    $('#nextCard').style.opacity = idx === total - 1 ? '0.3' : '1';
    $('#nextCard').style.pointerEvents = idx === total - 1 ? 'none' : 'auto';
  }

  // ═══════════════════════════════════════════════════════════
  //  CHAT
  // ═══════════════════════════════════════════════════════════

  function initChat() {
    const form = $('#chatForm');
    const input = $('#chatInput');

    input.addEventListener('input', () => {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 100) + 'px';
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        form.dispatchEvent(new Event('submit'));
      }
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const question = input.value.trim();
      if (!question) return;

      // Remove welcome
      const welcome = $('.chat-welcome');
      if (welcome) welcome.remove();

      addChatBubble(question, 'user');
      input.value = '';
      input.style.height = 'auto';

      const typingId = addTypingIndicator();

      try {
        const sourceIds = getSelectedSourceIds();
        const res = await api('/api/chat', { question, sourceIds });
        removeTypingIndicator(typingId);

        if (res.error) {
          addChatBubble('Sorry, something went wrong. Please try again.', 'ai');
          return;
        }

        addChatBubble(res.answer, 'ai', true);
      } catch (err) {
        removeTypingIndicator(typingId);
        addChatBubble('Failed to connect. Please check your connection.', 'ai');
      }
    });
  }

  function addChatBubble(content, type, isMarkdown = false) {
    const messages = $('#chatMessages');
    const bubble = document.createElement('div');
    bubble.className = `chat-bubble ${type}`;
    const avatar = type === 'ai' ? '🤖' : '👤';
    const rendered = isMarkdown ? renderMarkdown(content) : escapeHtml(content);
    bubble.innerHTML = `
      <div class="chat-avatar">${avatar}</div>
      <div class="chat-bubble-content">${rendered}</div>
    `;
    messages.appendChild(bubble);
    messages.scrollTop = messages.scrollHeight;
  }

  function addTypingIndicator() {
    const messages = $('#chatMessages');
    const id = 'typing-' + Date.now();
    const div = document.createElement('div');
    div.id = id;
    div.className = 'chat-bubble ai';
    div.innerHTML = `
      <div class="chat-avatar">🤖</div>
      <div class="chat-bubble-content">
        <div class="typing-indicator"><span></span><span></span><span></span></div>
      </div>
    `;
    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
    return id;
  }

  function removeTypingIndicator(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
  }

  // ═══════════════════════════════════════════════════════════
  //  AUTH
  // ═══════════════════════════════════════════════════════════

  function initAuth() {
    $('#loginBtn').addEventListener('click', () => $('#authModal').classList.add('active'));
    $('#modalClose').addEventListener('click', () => $('#authModal').classList.remove('active'));
    $('#authModal').addEventListener('click', (e) => {
      if (e.target === $('#authModal')) $('#authModal').classList.remove('active');
    });

    $$('.modal-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        $$('.modal-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const isLogin = tab.dataset.authTab === 'login';
        $('#loginForm').style.display = isLogin ? 'block' : 'none';
        $('#registerForm').style.display = isLogin ? 'none' : 'block';
      });
    });

    $('#loginForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = $('#loginUsername').value.trim();
      const password = $('#loginPassword').value;
      $('#loginError').textContent = '';
      try {
        const res = await api('/api/auth/login', { username, password });
        if (res.error) { $('#loginError').textContent = res.error; return; }
        state.user = res;
        updateUserUI();
        $('#authModal').classList.remove('active');
        showToast(`Welcome back, ${res.username}! 🎉`, 'success');
        loadSources();
      } catch { $('#loginError').textContent = 'Login failed.'; }
    });

    $('#registerForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = $('#registerUsername').value.trim();
      const password = $('#registerPassword').value;
      $('#registerError').textContent = '';
      try {
        const res = await api('/api/auth/register', { username, password });
        if (res.error) { $('#registerError').textContent = res.error; return; }
        state.user = res;
        updateUserUI();
        $('#authModal').classList.remove('active');
        showToast(`Welcome, ${res.username}! 🎓`, 'success');
      } catch { $('#registerError').textContent = 'Registration failed.'; }
    });
  }

  async function checkAuth() {
    try {
      const res = await fetch('/api/auth/me');
      const user = await res.json();
      if (user) { state.user = user; updateUserUI(); }
    } catch (e) { /* not logged in */ }
  }

  function updateUserUI() {
    const section = $('#userSection');
    if (state.user) {
      const initial = state.user.username.charAt(0).toUpperCase();
      section.innerHTML = `
        <div class="user-info">
          <div class="user-avatar">${initial}</div>
          <span class="user-name">${state.user.username}</span>
        </div>
        <button class="btn btn-ghost btn-sm" id="logoutBtn">↩</button>
      `;
      $('#logoutBtn').addEventListener('click', async () => {
        await fetch('/api/auth/logout', { method: 'POST' });
        state.user = null;
        updateUserUI();
        showToast('Logged out', 'info');
      });
    } else {
      section.innerHTML = `<button class="btn btn-ghost btn-sm" id="loginBtn">Sign In</button>`;
      $('#loginBtn').addEventListener('click', () => $('#authModal').classList.add('active'));
    }
  }

  // ═══════════════════════════════════════════════════════════
  //  UTILITIES
  // ═══════════════════════════════════════════════════════════

  async function api(url, data) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return res.json();
  }

  function renderMarkdown(text) {
    return text
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/^### (.+)$/gm, '<h3>$1</h3>')
      .replace(/^## (.+)$/gm, '<h2>$1</h2>')
      .replace(/^# (.+)$/gm, '<h1>$1</h1>')
      .replace(/^\- (.+)$/gm, '<li>$1</li>')
      .replace(/(<li>[\s\S]*?<\/li>)/g, '<ul>$1</ul>')
      .replace(/<\/ul>\s*<ul>/g, '')
      .replace(/\n{2,}/g, '<br><br>')
      .replace(/\n/g, '<br>');
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function showToast(message, type = 'info') {
    const container = $('#toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => { if (toast.parentNode) toast.remove(); }, 4000);
  }

})();
