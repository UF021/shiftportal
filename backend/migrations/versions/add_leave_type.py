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
    op.execute("CREATE TYPE leavetype AS ENUM ('holiday', 'maternity', 'paternity', 'sick', 'other')")
    op.add_column(
        'holidays',
        sa.Column(
            'leave_type',
            sa.Enum('holiday', 'maternity', 'paternity', 'sick', 'other', name='leavetype'),
            nullable=False,
            server_default='holiday',
        )
    )


def downgrade() -> None:
    op.drop_column('holidays', 'leave_type')
    op.execute("DROP TYPE leavetype")
