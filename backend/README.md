# PocketPilot Backend (FastAPI)

Minimal FastAPI backend using SQLite and SQLModel.

## Setup

Create a virtual environment and install dependencies:

```bash
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
```

Run the API server:

```bash
uvicorn backend.main:app --reload --port 8000
```

The API endpoints:
- `GET /transactions` — list transactions
- `POST /transactions` — create transaction (JSON body matches the `Transaction` model)
- `DELETE /transactions/{id}` — delete transaction
- `GET /summary` — totals (income, expenses, balance)

Next steps: add authentication, per-user storage, and CSV import/export.
