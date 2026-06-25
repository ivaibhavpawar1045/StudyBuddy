const { GoogleGenerativeAI } = require('@google/generative-ai');

let genAI;
let model;

function initAI() {
  if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'your_gemini_api_key_here') {
    console.warn('⚠️  GEMINI_API_KEY not set. AI features will return mock responses.');
    return false;
  }
  genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-lite' });
  return true;
}

// ── Prompt Templates (source-based) ──────────────────────────

const PROMPTS = {
  explain: (question, sourceContext) => {
    const ctx = sourceContext
      ? `\n\nUse the following source material to answer:\n\n${sourceContext}`
      : '';
    return `You are a friendly, expert tutor helping a student understand a concept.
Explain the following question/topic in simple, easy-to-understand terms.
Use analogies, examples, and break it down step by step.
Format your response in Markdown with headings, bullet points, and code blocks where appropriate.${ctx}

Student's question: ${question}`;
  },

  summarize: (text) => `You are a study assistant. Summarize the following study material into clear, concise bullet points.
Group related ideas together under headings. Highlight key terms in **bold**.
Keep the summary to the essential points a student needs to remember for an exam.
Format in Markdown.

Study Material:
${text}`,

  quiz: (sourceText, topic, count = 5) => {
    const topicLine = topic ? ` about "${topic}"` : '';
    return `Generate exactly ${count} multiple-choice quiz questions${topicLine} based on the following study material.
Each question should have 4 options (A, B, C, D) with exactly one correct answer.
Include a brief explanation for why the correct answer is right.
Questions should test understanding of the material, not just memorization.

Study Material:
${sourceText}

You MUST respond with ONLY valid JSON in this exact format, no markdown code fences:
{
  "topic": "${topic || 'Study Material'}",
  "questions": [
    {
      "id": 1,
      "question": "Question text here?",
      "options": {
        "A": "Option A text",
        "B": "Option B text",
        "C": "Option C text",
        "D": "Option D text"
      },
      "correct": "A",
      "explanation": "Explanation of why A is correct"
    }
  ]
}`;
  },

  flashcards: (sourceText, topic, count = 10) => {
    const topicLine = topic ? ` about "${topic}"` : '';
    return `Generate exactly ${count} flashcards${topicLine} based on the following study material.
Each flashcard should have a front (key term, concept, or question) and back (definition, explanation, or answer).
Focus on the most important concepts from the material.
Keep answers concise but complete.

Study Material:
${sourceText}

You MUST respond with ONLY valid JSON in this exact format, no markdown code fences:
{
  "topic": "${topic || 'Study Material'}",
  "cards": [
    {
      "id": 1,
      "front": "Term or question",
      "back": "Definition or answer"
    }
  ]
}`;
  }
};

// ── AI Functions ──────────────────────────────────────────────

async function explainTopic(question, sourceContext) {
  if (!model) throw new Error('AI not initialized. Set GEMINI_API_KEY in .env');

  const result = await model.generateContent(PROMPTS.explain(question, sourceContext));
  return result.response.text();
}

async function summarizeNotes(text) {
  if (!model) throw new Error('AI not initialized. Set GEMINI_API_KEY in .env');

  const result = await model.generateContent(PROMPTS.summarize(text));
  return result.response.text();
}

async function generateQuiz(sourceText, topic, count = 5) {
  if (!model) throw new Error('AI not initialized. Set GEMINI_API_KEY in .env');

  const result = await model.generateContent(PROMPTS.quiz(sourceText, topic, count));
  let text = result.response.text().trim();

  // Strip markdown code fences if present
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');

  try {
    return JSON.parse(text);
  } catch (e) {
    console.error('Failed to parse quiz JSON:', e.message);
    console.error('Raw response:', text.substring(0, 500));
    throw new Error('AI returned invalid quiz format. Please try again.');
  }
}

async function generateFlashcards(sourceText, topic, count = 10) {
  if (!model) throw new Error('AI not initialized. Set GEMINI_API_KEY in .env');

  const result = await model.generateContent(PROMPTS.flashcards(sourceText, topic, count));
  let text = result.response.text().trim();

  // Strip markdown code fences if present
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');

  try {
    return JSON.parse(text);
  } catch (e) {
    console.error('Failed to parse flashcards JSON:', e.message);
    console.error('Raw response:', text.substring(0, 500));
    throw new Error('AI returned invalid flashcard format. Please try again.');
  }
}

module.exports = { initAI, explainTopic, summarizeNotes, generateQuiz, generateFlashcards };
