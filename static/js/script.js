/* ═══════════════════════════════════════════════════════════════
   QuizAI — Main JavaScript
   ═══════════════════════════════════════════════════════════════ */

'use strict';

/* ── Globals ─────────────────────────────────────────────────── */
let quizData = {
  questions: [],
  topic: '',
  difficulty: '',
  currentIndex: 0,
  answers: {},        // { index: selectedOption }
  startTime: null,
};

/* ── DOM Ready ───────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  initNavToggle();
  initToastDismiss();
  initAnimateOnScroll();
  initQuizPage();
  initNumberInput();
  initTopicSuggestions();
});

/* ── Navbar Toggle ───────────────────────────────────────────── */
function initNavToggle() {
  const toggle = document.getElementById('navToggle');
  const menu   = document.getElementById('mobileMenu');
  if (!toggle || !menu) return;

  toggle.addEventListener('click', () => {
    const open = menu.classList.toggle('open');
    toggle.setAttribute('aria-expanded', open);
  });

  document.addEventListener('click', (e) => {
    if (!toggle.contains(e.target) && !menu.contains(e.target)) {
      menu.classList.remove('open');
    }
  });
}

/* ── Toast Dismiss ───────────────────────────────────────────── */
function initToastDismiss() {
  // Auto-dismiss toasts after 5 seconds
  document.querySelectorAll('.toast').forEach(toast => {
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(24px)';
      toast.style.transition = 'opacity 0.3s, transform 0.3s';
      setTimeout(() => toast.remove(), 300);
    }, 5000);
  });
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer') || (() => {
    const div = document.createElement('div');
    div.className = 'toast-container';
    div.id = 'toastContainer';
    document.body.appendChild(div);
    return div;
  })();

  const icons = { success: '✓', error: '✗', info: 'ℹ' };
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${icons[type] || icons.info}</span>
    <span class="toast-message">${escapeHtml(message)}</span>
    <button class="toast-close" onclick="this.parentElement.remove()">×</button>
  `;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(24px)';
    toast.style.transition = 'opacity 0.3s, transform 0.3s';
    setTimeout(() => toast.remove(), 300);
  }, 5000);
}

/* ── Scroll Animations ───────────────────────────────────────── */
function initAnimateOnScroll() {
  const items = document.querySelectorAll('[data-animate]');
  if (!items.length) return;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry, i) => {
      if (entry.isIntersecting) {
        setTimeout(() => entry.target.classList.add('visible'), i * 80);
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1 });

  items.forEach(el => observer.observe(el));
}

/* ── Number Input (±) ────────────────────────────────────────── */
function initNumberInput() {
  const numInput = document.getElementById('numQuestions');
  const minus    = document.getElementById('numMinus');
  const plus     = document.getElementById('numPlus');
  if (!numInput) return;

  minus.addEventListener('click', () => {
    const v = parseInt(numInput.value);
    if (v > 3) numInput.value = v - 1;
  });
  plus.addEventListener('click', () => {
    const v = parseInt(numInput.value);
    if (v < 15) numInput.value = v + 1;
  });
  numInput.addEventListener('change', () => {
    numInput.value = Math.max(3, Math.min(15, parseInt(numInput.value) || 5));
  });
}

/* ── Topic Suggestions ───────────────────────────────────────── */
const POPULAR_TOPICS = [
  'Python', 'JavaScript', 'Machine Learning', 'Biology', 'Chemistry',
  'Physics', 'History', 'Geography', 'Mathematics', 'Literature',
  'Astronomy', 'Economics', 'Psychology', 'Philosophy', 'Art History'
];

function initTopicSuggestions() {
  const input = document.getElementById('topicInput');
  const box   = document.getElementById('topicSuggestions');
  if (!input || !box) return;

  input.addEventListener('input', () => {
    const val = input.value.toLowerCase().trim();
    box.innerHTML = '';
    if (!val) return;

    const matches = POPULAR_TOPICS.filter(t => t.toLowerCase().includes(val)).slice(0, 5);
    matches.forEach(topic => {
      const chip = document.createElement('span');
      chip.className = 'suggestion-chip';
      chip.textContent = topic;
      chip.addEventListener('click', () => {
        input.value = topic;
        box.innerHTML = '';
      });
      box.appendChild(chip);
    });
  });
}

/* ── Password Toggle ─────────────────────────────────────────── */
function togglePassword(inputId, btn) {
  const input = document.getElementById(inputId);
  if (!input) return;
  const isText = input.type === 'text';
  input.type = isText ? 'password' : 'text';
  btn.style.opacity = isText ? '0.5' : '1';
}

/* ── Quiz Page ───────────────────────────────────────────────── */
function initQuizPage() {
  const form = document.getElementById('setupForm');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    await generateQuiz();
  });
}

async function generateQuiz() {
  const topic       = document.getElementById('topicInput').value.trim();
  const numQuestions = parseInt(document.getElementById('numQuestions').value);
  const difficulty  = document.querySelector('input[name="difficulty"]:checked')?.value || 'medium';

  if (!topic) {
    showToast('Please enter a topic for your quiz.', 'error');
    return;
  }

  const btn = document.getElementById('generateBtn');
  btn.disabled = true;
  btn.querySelector('.btn-text').textContent = 'Generating…';

  showSection('quizLoading');
  document.getElementById('loadingTopic').textContent = topic;
  animateLoadingSteps();

  try {
    const resp = await fetch('/api/generate-quiz', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic, num_questions: numQuestions, difficulty })
    });

    const data = await resp.json();

    if (!resp.ok) {
      throw new Error(data.error || 'Failed to generate quiz');
    }

    quizData = {
      questions:    data.questions,
      topic:        data.topic,
      difficulty:   data.difficulty,
      currentIndex: 0,
      answers:      {},
      startTime:    Date.now(),
    };

    startQuizInterface();

  } catch (err) {
    showSection('quizSetup');
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.querySelector('.btn-text').textContent = 'Generate Quiz';
  }
}

function animateLoadingSteps() {
  const steps = ['lstep1', 'lstep2', 'lstep3'];
  steps.forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.className = 'lstep'; }
  });

  document.getElementById('lstep1').classList.add('active');

  setTimeout(() => {
    document.getElementById('lstep1').className = 'lstep done';
    document.getElementById('lstep2').classList.add('active');
  }, 900);

  setTimeout(() => {
    document.getElementById('lstep2').className = 'lstep done';
    document.getElementById('lstep3').classList.add('active');
  }, 1800);
}

/* ── Quiz Interface ──────────────────────────────────────────── */
function startQuizInterface() {
  const { questions, topic, difficulty } = quizData;

  document.getElementById('quizTopicTag').textContent = topic;
  document.getElementById('quizDiffTag').textContent  = difficulty.charAt(0).toUpperCase() + difficulty.slice(1);

  buildDots();
  renderQuestion(0);
  updateProgress();
  showSection('quizInterface');
}

function buildDots() {
  const container = document.getElementById('qDots');
  container.innerHTML = '';
  quizData.questions.forEach((_, i) => {
    const dot = document.createElement('div');
    dot.className = 'q-dot';
    dot.title = `Question ${i + 1}`;
    dot.addEventListener('click', () => navigateToQuestion(i));
    container.appendChild(dot);
  });
}

function renderQuestion(index) {
  const { questions, answers } = quizData;
  const q = questions[index];
  const area = document.getElementById('questionArea');

  area.innerHTML = `
    <div class="question-card">
      <div class="q-number">Question ${index + 1} of ${questions.length}</div>
      <div class="q-text">${escapeHtml(q.question)}</div>
      <div class="options-list" id="optionsList">
        ${q.options.map((opt, i) => `
          <label class="option-label ${answers[index] === opt ? 'selected' : ''}" id="opt-${i}">
            <input type="radio" name="q_${index}" value="${escapeHtml(opt)}"
              ${answers[index] === opt ? 'checked' : ''}
              onchange="selectOption(${index}, '${escapeHtml(opt).replace(/'/g, "\\'")}', ${i})" />
            <span class="option-letter">${String.fromCharCode(65 + i)}</span>
            <span class="option-text">${escapeHtml(opt)}</span>
          </label>
        `).join('')}
      </div>
    </div>
  `;

  quizData.currentIndex = index;
  updateProgress();
  updateDots();
  updateNavButtons();
  updateSubmitZone();
}

function selectOption(qIndex, value, optIndex) {
  quizData.answers[qIndex] = value;

  // Update UI selection styles
  document.querySelectorAll(`#optionsList .option-label`).forEach((label, i) => {
    label.classList.toggle('selected', i === optIndex);
  });

  updateDots();
  updateSubmitZone();

  // Auto-advance after brief delay if not on last question
  if (qIndex < quizData.questions.length - 1) {
    setTimeout(() => navigateQuestion(1), 500);
  }
}

function navigateQuestion(delta) {
  const newIndex = quizData.currentIndex + delta;
  if (newIndex >= 0 && newIndex < quizData.questions.length) {
    renderQuestion(newIndex);
  }
}

function navigateToQuestion(index) {
  renderQuestion(index);
}

function updateProgress() {
  const { questions, answers, currentIndex } = quizData;
  const pct = ((currentIndex + 1) / questions.length) * 100;
  document.getElementById('progressFill').style.width = `${pct}%`;
  document.getElementById('progressText').textContent = `${currentIndex + 1} / ${questions.length}`;
}

function updateDots() {
  document.querySelectorAll('.q-dot').forEach((dot, i) => {
    dot.className = 'q-dot';
    if (i === quizData.currentIndex) dot.classList.add('current');
    else if (quizData.answers[i] !== undefined) dot.classList.add('answered');
  });
}

function updateNavButtons() {
  const { currentIndex, questions } = quizData;
  document.getElementById('prevBtn').disabled = currentIndex === 0;

  const nextBtn = document.getElementById('nextBtn');
  if (currentIndex === questions.length - 1) {
    nextBtn.style.display = 'none';
  } else {
    nextBtn.style.display = '';
  }
}

function updateSubmitZone() {
  const { questions, answers, currentIndex } = quizData;
  const answered = Object.keys(answers).length;
  const isLastQ  = currentIndex === questions.length - 1;

  document.getElementById('submitZone').style.display = isLastQ ? '' : 'none';
  document.getElementById('answeredCount').textContent = answered;
  document.getElementById('totalCount').textContent    = questions.length;
}

/* ── Submit Quiz ─────────────────────────────────────────────── */
async function submitQuiz() {
  const { questions, answers, topic, difficulty } = quizData;

  let correct = 0;
  let wrong   = 0;
  let skipped = 0;

  questions.forEach((q, i) => {
    if (answers[i] === undefined) {
      skipped++;
    } else if (answers[i] === q.answer) {
      correct++;
    } else {
      wrong++;
    }
  });

  const total      = questions.length;
  const percentage = Math.round((correct / total) * 100);

  // Save to server
  try {
    await fetch('/api/save-quiz', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topic, difficulty,
        score: correct,
        total_questions: total
      })
    });
  } catch (e) {
    console.warn('Could not save quiz result:', e);
  }

  showResults(correct, wrong, skipped, percentage);
}

/* ── Show Results ─────────────────────────────────────────────── */
function showResults(correct, wrong, skipped, percentage) {
  showSection('quizResult');

  // Emoji & message based on score
  const emoji    = percentage >= 90 ? '🏆' : percentage >= 70 ? '🎉' : percentage >= 50 ? '📚' : '💪';
  const subtitle = percentage >= 90 ? 'Outstanding performance!'
    : percentage >= 70 ? 'Great job! Keep it up.'
    : percentage >= 50 ? 'Good effort. Keep practicing!'
    : 'Don\'t give up — review and try again!';

  document.getElementById('resultEmoji').textContent = emoji;
  document.getElementById('resultSubtitle').textContent = subtitle;
  document.getElementById('correctCount').textContent = correct;
  document.getElementById('wrongCount').textContent   = wrong;
  document.getElementById('skippedCount').textContent = skipped;

  // Animate score ring
  animateScore(percentage);

  // Build review list
  buildReview();
}

function animateScore(percentage) {
  const ring = document.getElementById('scoreRing');
  const numEl = document.getElementById('scoreNum');
  const circumference = 314;

  // Color ring based on score
  const color = percentage >= 70 ? '#059669' : percentage >= 50 ? '#D97706' : '#DC2626';
  ring.style.stroke = color;

  // Animate fill
  let start = null;
  const animate = (ts) => {
    if (!start) start = ts;
    const progress = Math.min((ts - start) / 1200, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const offset = circumference - (eased * percentage / 100) * circumference;
    ring.style.strokeDashoffset = offset;
    numEl.textContent = Math.round(eased * percentage);
    if (progress < 1) requestAnimationFrame(animate);
  };
  requestAnimationFrame(animate);
}

function buildReview() {
  const { questions, answers } = quizData;
  const list = document.getElementById('reviewList');
  list.innerHTML = '';

  questions.forEach((q, i) => {
    const userAns    = answers[i];
    const isCorrect  = userAns === q.answer;
    const isSkipped  = userAns === undefined;
    const statusClass = isSkipped ? 'skipped' : isCorrect ? 'correct' : 'wrong';

    list.innerHTML += `
      <div class="review-item ${statusClass}">
        <div class="rv-q-num">Question ${i + 1}</div>
        <div class="rv-question">${escapeHtml(q.question)}</div>
        <div class="rv-answers">
          ${isSkipped ? `
            <div class="rv-answer"><span class="label">Your answer:</span> <em>Skipped</em></div>
          ` : `
            <div class="rv-answer ${isCorrect ? 'user-correct' : 'user-wrong'}">
              <span class="label">Your answer:</span> ${escapeHtml(userAns)}
              ${isCorrect ? ' ✓' : ' ✗'}
            </div>
          `}
          ${!isCorrect ? `
            <div class="rv-answer correct-ans">
              <span class="label">Correct answer:</span> ${escapeHtml(q.answer)}
            </div>
          ` : ''}
        </div>
      </div>
    `;
  });
}

function toggleReview() {
  const section = document.getElementById('reviewSection');
  section.classList.toggle('hidden');
  if (!section.classList.contains('hidden')) {
    section.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function retakeQuiz() {
  // Reset answers but keep the same questions
  quizData.answers = {};
  quizData.startTime = Date.now();
  startQuizInterface();
  showSection('quizInterface');
}

/* ── Section Manager ─────────────────────────────────────────── */
function showSection(sectionId) {
  const sections = ['quizSetup', 'quizLoading', 'quizInterface', 'quizResult'];
  sections.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('hidden', id !== sectionId);
  });
}

/* ── Utilities ───────────────────────────────────────────────── */
function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}