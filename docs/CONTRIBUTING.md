# Contributing to ArogyaSetu

Thank you for your interest in contributing to **ArogyaSetu**! This project was developed for the **Build with AI: Code for Communities (Second Edition)** hackathon organized by **Hack2Skill** in partnership with **Google**.

---

## 🛠️ Local Development Setup

### Prerequisites
- **Python:** Version 3.10, 3.11, or 3.12.
- **Node.js:** Version 18, 20, or 22.
- **Git**

### Setup Steps
```bash
# 1. Clone the repository
git clone https://github.com/GitPhantom700/arogyasetu.git
cd arogyasetu

# 2. Set up Python virtual environment
python -m venv .venv
# On Windows:
.venv\Scripts\activate
# On Linux/macOS:
source .venv/bin/activate

# 3. Install backend dependencies
pip install --upgrade pip
pip install -r requirements.txt

# 4. Install frontend dependencies
cd frontend
npm install
cd ..

# 5. Launch the application
# Windows 1-click runner:
start.bat
# Or manual start:
python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
```

---

## 🧪 Testing & Quality Assurance

Before submitting any code changes, verify that all test suites pass with zero regressions:

```bash
# Run backend test suite (all 107 tests must pass)
pytest backend/ -v

# Verify frontend production build
npm run build --prefix frontend
```

---

## 📝 Commit Message Guidelines

We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:
- `feat:` A new feature or capability.
- `fix:` A bug fix or patch.
- `docs:` Documentation updates.
- `test:` Adding or updating test cases.
- `refactor:` Code refactoring with no functional change.
- `chore:` Maintenance, dependency updates, or build configs.

---

## 🔒 Security Vulnerabilities

If you discover a security vulnerability, please do not file a public issue. Instead, submit a security advisory or email the maintainers directly.
