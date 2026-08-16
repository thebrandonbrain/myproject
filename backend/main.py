from fastapi import FastAPI, HTTPException, Depends, Header
from fastapi.middleware.cors import CORSMiddleware
from sqlmodel import select
from .models import Transaction, User
from .database import init_db, get_session
from .auth import get_current_user, get_password_hash, authenticate_user, create_access_token
from pydantic import BaseModel
from datetime import timedelta
import os

# Admin API key for account management (load from env or use default for demo)
ADMIN_API_KEY = os.getenv("POCKETPILOT_ADMIN_KEY", "admin-secret-key")

init_db()
app = FastAPI(title="PocketPilot API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class UserCreate(BaseModel):
    username: str
    password: str
    email: str | None = None


class ForgotPasswordRequest(BaseModel):
    email: str
    new_password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


def verify_admin_key(x_admin_key: str = Header(None)):
    """Verify admin API key from header."""
    if x_admin_key != ADMIN_API_KEY:
        raise HTTPException(status_code=403, detail='Invalid or missing admin key')
    return True


@app.post('/auth/register', response_model=TokenResponse)
def register(u: UserCreate):
    with get_session() as session:
        existing = session.exec(select(User).where(User.username == u.username)).first()
        if existing:
            raise HTTPException(status_code=400, detail='Username is Taken')
        if not u.email:
            raise HTTPException(status_code=400, detail='Email is required')
        existing_email = session.exec(select(User).where(User.email == u.email.lower().strip())).first()
        if existing_email:
            raise HTTPException(status_code=400, detail='Email is already in use')
        user = User(
            username=u.username,
            email=u.email.lower().strip(),
            hashed_password=get_password_hash(u.password),
        )
        session.add(user)
        session.commit()
        session.refresh(user)
        access_token = create_access_token({"sub": user.username})
        return {"access_token": access_token}


@app.post('/auth/token', response_model=TokenResponse)
def login_for_token(u: UserCreate):
    user = authenticate_user(u.username, u.password)
    if not user:
        raise HTTPException(status_code=400, detail='Wrong username/password')
    access_token = create_access_token({"sub": user.username})
    return {"access_token": access_token}


@app.post('/auth/forgot-password')
def forgot_password(payload: ForgotPasswordRequest):
    with get_session() as session:
        user = session.exec(select(User).where(User.email == payload.email.lower().strip())).first()
        if not user:
            raise HTTPException(status_code=404, detail='Email not found')
        user.hashed_password = get_password_hash(payload.new_password)
        session.add(user)
        session.commit()
        return {"message": "Password updated successfully"}


@app.get('/transactions')
def list_transactions(current_user: User = Depends(get_current_user)):
    with get_session() as session:
        statement = select(Transaction).where(Transaction.owner_id == current_user.id).order_by(Transaction.created_at.desc())
        results = session.exec(statement).all()
        return results


@app.post('/transactions', status_code=201)
def create_transaction(tx: Transaction, current_user: User = Depends(get_current_user)):
    with get_session() as session:
        tx.owner_id = current_user.id
        session.add(tx)
        session.commit()
        session.refresh(tx)
        return tx


@app.delete('/transactions/{tx_id}', status_code=204)
def delete_transaction(tx_id: int, current_user: User = Depends(get_current_user)):
    with get_session() as session:
        tx = session.get(Transaction, tx_id)
        if not tx or tx.owner_id != current_user.id:
            raise HTTPException(status_code=404, detail='Not found')
        session.delete(tx)
        session.commit()
        return


@app.get('/summary')
def summary(current_user: User = Depends(get_current_user)):
    with get_session() as session:
        statement = select(Transaction).where(Transaction.owner_id == current_user.id)
        txs = session.exec(statement).all()
        incomes = sum(t.amount for t in txs if t.type == 'income')
        expenses = sum(t.amount for t in txs if t.type == 'expense')
        balance = incomes - expenses
        return { 'income': incomes, 'expenses': expenses, 'balance': balance }


# ===== ADMIN ENDPOINTS (Protected by API key) =====

@app.get('/admin/accounts')
def admin_list_accounts(admin: bool = Depends(verify_admin_key)):
    """Admin-only endpoint: List all user accounts (no passwords revealed)."""
    with get_session() as session:
        users = session.exec(select(User)).all()
        # Return user info without sensitive data
        return [{"id": u.id, "username": u.username} for u in users]


@app.delete('/admin/accounts/{user_id}', status_code=204)
def admin_delete_account(user_id: int, admin: bool = Depends(verify_admin_key)):
    """Admin-only endpoint: Delete a user account and their transactions."""
    with get_session() as session:
        user = session.get(User, user_id)
        if not user:
            raise HTTPException(status_code=404, detail='User not found')
        
        # Delete all transactions for this user
        txs = session.exec(select(Transaction).where(Transaction.owner_id == user_id)).all()
        for tx in txs:
            session.delete(tx)
        
        # Delete the user
        session.delete(user)
        session.commit()
        return
