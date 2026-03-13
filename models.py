from flask_sqlalchemy import SQLAlchemy
from flask_login import UserMixin
from werkzeug.security import generate_password_hash, check_password_hash
from datetime import datetime

db = SQLAlchemy()

class User(UserMixin, db.Model):
    __tablename__ = 'users'

    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(256), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    quizzes = db.relationship('QuizHistory', backref='user', lazy=True, cascade='all, delete-orphan')

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

    def get_stats(self):
        if not self.quizzes:
            return {'total': 0, 'average': 0, 'best': 0}
        scores = [q.score for q in self.quizzes]
        totals = [q.total_questions for q in self.quizzes]
        percentages = [
            (s / t * 100) if t > 0 else 0
            for s, t in zip(scores, totals)
        ]
        return {
            'total': len(self.quizzes),
            'average': round(sum(percentages) / len(percentages), 1),
            'best': round(max(percentages), 1)
        }

    def __repr__(self):
        return f'<User {self.username}>'


class QuizHistory(db.Model):
    __tablename__ = 'quiz_history'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    topic = db.Column(db.String(200), nullable=False)
    difficulty = db.Column(db.String(20), nullable=False, default='medium')
    score = db.Column(db.Integer, nullable=False)
    total_questions = db.Column(db.Integer, nullable=False)
    date = db.Column(db.DateTime, default=datetime.utcnow)

    @property
    def percentage(self):
        if self.total_questions == 0:
            return 0
        return round(self.score / self.total_questions * 100, 1)

    @property
    def grade(self):
        p = self.percentage
        if p >= 90: return 'A+'
        if p >= 80: return 'A'
        if p >= 70: return 'B'
        if p >= 60: return 'C'
        return 'D'

    def to_dict(self):
        return {
            'id': self.id,
            'topic': self.topic,
            'difficulty': self.difficulty,
            'score': self.score,
            'total_questions': self.total_questions,
            'percentage': self.percentage,
            'grade': self.grade,
            'date': self.date.strftime('%b %d, %Y')
        }

    def __repr__(self):
        return f'<QuizHistory {self.topic} {self.score}/{self.total_questions}>'