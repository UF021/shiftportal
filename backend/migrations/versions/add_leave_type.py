"""add leave_type to holidays

Revision ID: f6a7b8c9d0e1
Revises: e5f6a7b8c9d0
Create Date: 2026-10-04

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'f6a7b8c9d0e1'
down_revision: Union[str, None] = 'e5f6a7b8c9d0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        DO $$ BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'leavetype') THEN
                CREATE TYPE leavetype AS ENUM ('holiday', 'maternity', 'paternity', 'sick', 'other');
            END IF;
        END $$;
    """)
    # skip if column already exists (idempotent re-run)
    op.execute("""
        DO $$ BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name='holidays' AND column_name='leave_type'
            ) THEN
                ALTER TABLE holidays
                    ADD COLUMN leave_type leavetype NOT NULL DEFAULT 'holiday';
            END IF;
        END $$;
    """)


def downgrade() -> None:
    op.execute("""
        DO $$ BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name='holidays' AND column_name='leave_type'
            ) THEN
                ALTER TABLE holidays DROP COLUMN leave_type;
            END IF;
        END $$;
    """)
    op.execute("DROP TYPE IF EXISTS leavetype")
