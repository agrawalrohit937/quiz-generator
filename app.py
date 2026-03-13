from flask import Flask, render_template, request, redirect, url_for, flash, jsonify, session
from flask_login import LoginManager, login_user, logout_user, login_required, current_user
from models import db, User, QuizHistory
from config import Config
import requests
import json
import re

app = Flask(__name__)
app.config.from_object(Config)

db.init_app(app)

login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = 'login'
login_manager.login_message = 'Please log in to access this page.'
login_manager.login_message_category = 'info'

@login_manager.user_loader
def load_user(user_id):
    return User.query.get(int(user_id))

with app.app_context():
    db.create_all()

@app.context_processor
def inject_now():
    from datetime import datetime
    return {'now': datetime.utcnow()}


# ── Auth Routes ─────────────────────────────────────────────────────────────

@app.route('/')
def index():
    if current_user.is_authenticated:
        return redirect(url_for('dashboard'))
    return redirect(url_for('login'))


@app.route('/signup', methods=['GET', 'POST'])
def signup():
    if current_user.is_authenticated:
        return redirect(url_for('dashboard'))

    if request.method == 'POST':
        username = request.form.get('username', '').strip()
        email = request.form.get('email', '').strip().lower()
        password = request.form.get('password', '')
        confirm = request.form.get('confirm_password', '')

        # Validation
        if not all([username, email, password, confirm]):
            flash('All fields are required.', 'error')
            return render_template('signup.html')

        if len(username) < 3 or len(username) > 30:
            flash('Username must be between 3 and 30 characters.', 'error')
            return render_template('signup.html')

        if len(password) < 6:
            flash('Password must be at least 6 characters.', 'error')
            return render_template('signup.html')

        if password != confirm:
            flash('Passwords do not match.', 'error')
            return render_template('signup.html')

        if User.query.filter_by(username=username).first():
            flash('Username already taken. Please choose another.', 'error')
            return render_template('signup.html')

        if User.query.filter_by(email=email).first():
            flash('An account with this email already exists.', 'error')
            return render_template('signup.html')

        user = User(username=username, email=email)
        user.set_password(password)
        db.session.add(user)
        db.session.commit()

        login_user(user)
        flash(f'Welcome to QuizAI, {username}! Your account has been created.', 'success')
        return redirect(url_for('dashboard'))

    return render_template('signup.html')


@app.route('/login', methods=['GET', 'POST'])
def login():
    if current_user.is_authenticated:
        return redirect(url_for('dashboard'))

    if request.method == 'POST':
        identifier = request.form.get('identifier', '').strip()
        password = request.form.get('password', '')
        remember = request.form.get('remember') == 'on'

        if not identifier or not password:
            flash('Please fill in all fields.', 'error')
            return render_template('login.html')

        user = User.query.filter(
            (User.username == identifier) | (User.email == identifier.lower())
        ).first()

        if user and user.check_password(password):
            login_user(user, remember=remember)
            next_page = request.args.get('next')
            flash(f'Welcome back, {user.username}!', 'success')
            return redirect(next_page or url_for('dashboard'))

        flash('Invalid credentials. Please check your username/email and password.', 'error')

    return render_template('login.html')


@app.route('/logout')
@login_required
def logout():
    logout_user()
    flash('You have been logged out successfully.', 'info')
    return redirect(url_for('login'))


# ── Dashboard ────────────────────────────────────────────────────────────────

@app.route('/dashboard')
@login_required
def dashboard():
    stats = current_user.get_stats()
    recent = QuizHistory.query.filter_by(user_id=current_user.id)\
        .order_by(QuizHistory.date.desc()).limit(5).all()
    return render_template('dashboard.html', stats=stats, recent=recent)


# ── Quiz ─────────────────────────────────────────────────────────────────────

@app.route('/quiz')
@login_required
def quiz():
    return render_template('quiz.html')


@app.route('/api/generate-quiz', methods=['POST'])
@login_required
def generate_quiz():
    data = request.get_json()
    topic = data.get('topic', '').strip()
    num_questions = int(data.get('num_questions', 5))
    difficulty = data.get('difficulty', 'medium')

    if not topic:
        return jsonify({'error': 'Topic is required'}), 400

    num_questions = max(3, min(15, num_questions))
    api_key = app.config['GROQ_API_KEY']
    print(api_key)
    if not api_key:
        return jsonify({'error': 'AI service not configured. Please add your GROQ_API_KEY.'}), 503

    prompt = f"""Generate exactly {num_questions} multiple-choice quiz questions about "{topic}" at {difficulty} difficulty level.

Return ONLY a valid JSON array with this exact structure (no markdown, no explanation):
[
  {{
    "question": "The question text here?",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "answer": "Option A"
  }}
]

Rules:
- Each question has exactly 4 options
- The "answer" field must exactly match one of the options
- Questions should be clear, educational, and appropriate for {difficulty} level
- Vary the question types (factual, conceptual, application)
- Make wrong options plausible but clearly incorrect to knowledgeable students"""

    try:
        response = requests.post(
            app.config['GROQ_API_URL'],
            headers={
                'Authorization': f'Bearer {api_key}',
                'Content-Type': 'application/json'
            },
            json={
                'model': app.config['GROQ_MODEL'],
                'messages': [{'role': 'user', 'content': prompt}],
                'temperature': 0.7,
                'max_tokens': 3000
            },
            timeout=30
        )
        response.raise_for_status()

        content = response.json()['choices'][0]['message']['content'].strip()

        # Extract JSON from response (handle potential markdown wrapping)
        json_match = re.search(r'\[[\s\S]*\]', content)
        if not json_match:
            return jsonify({'error': 'Failed to parse AI response. Please try again.'}), 500

        questions = json.loads(json_match.group())

        # Validate structure
        validated = []
        for q in questions:
            if all(k in q for k in ['question', 'options', 'answer']):
                if len(q['options']) == 4 and q['answer'] in q['options']:
                    validated.append(q)

        if not validated:
            return jsonify({'error': 'AI returned invalid questions. Please try again.'}), 500

        return jsonify({
            'questions': validated,
            'topic': topic,
            'difficulty': difficulty
        })

    except requests.exceptions.Timeout:
        return jsonify({'error': 'Request timed out. Please try again.'}), 504
    except requests.exceptions.HTTPError as e:
        return jsonify({'error': f'API error: {str(e)}'}), 502
    except json.JSONDecodeError:
        return jsonify({'error': 'Failed to parse quiz data. Please try again.'}), 500
    except Exception as e:
        app.logger.error(f'Quiz generation error: {e}')
        return jsonify({'error': 'An unexpected error occurred. Please try again.'}), 500


@app.route('/api/save-quiz', methods=['POST'])
@login_required
def save_quiz():
    data = request.get_json()
    topic = data.get('topic', '').strip()
    difficulty = data.get('difficulty', 'medium')
    score = int(data.get('score', 0))
    total_questions = int(data.get('total_questions', 0))

    if not topic or total_questions <= 0:
        return jsonify({'error': 'Invalid quiz data'}), 400

    quiz = QuizHistory(
        user_id=current_user.id,
        topic=topic,
        difficulty=difficulty,
        score=score,
        total_questions=total_questions
    )
    db.session.add(quiz)
    db.session.commit()

    return jsonify({'message': 'Quiz saved successfully', 'quiz_id': quiz.id})


# ── History ──────────────────────────────────────────────────────────────────

@app.route('/history')
@login_required
def history():
    page = request.args.get('page', 1, type=int)
    per_page = 10
    pagination = QuizHistory.query.filter_by(user_id=current_user.id)\
        .order_by(QuizHistory.date.desc())\
        .paginate(page=page, per_page=per_page, error_out=False)
    return render_template('history.html', pagination=pagination)


@app.route('/api/history')
@login_required
def api_history():
    quizzes = QuizHistory.query.filter_by(user_id=current_user.id)\
        .order_by(QuizHistory.date.desc()).all()
    return jsonify([q.to_dict() for q in quizzes])


# ── Error Handlers ───────────────────────────────────────────────────────────

@app.errorhandler(404)
def not_found(e):
    return render_template('404.html'), 404

@app.errorhandler(500)
def server_error(e):
    return render_template('500.html'), 500


if __name__ == '__main__':
    app.run(debug=False)