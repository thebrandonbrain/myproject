from sqlmodel import SQLModel, create_engine, Session, text
from .models import Transaction, User

DATABASE_URL = "sqlite:///./transactions.db"
engine = create_engine(DATABASE_URL, echo=False)


def init_db():
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        result = session.exec(text("PRAGMA table_info('user')")).all()
        columns = {row[1] for row in result}
        if 'email' not in columns:
            session.exec(text("ALTER TABLE 'user' ADD COLUMN email VARCHAR"))
            session.commit()

        try:
            session.exec(text("CREATE UNIQUE INDEX IF NOT EXISTS idx_user_email_unique ON 'user' (email)"))
            session.commit()
        except Exception:
            session.rollback()


def get_session():
    return Session(engine)
