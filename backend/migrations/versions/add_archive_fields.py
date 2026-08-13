"""add is_archived and archived_at to users

Revision ID: a1b2c3d4e5f6
Revises: 274b25183541
Create Date: 2026-08-13

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, None] = '274b25183541'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('users', sa.Column('is_archived', sa.Boolean(), nullable=True, server_default='false'))
    op.add_column('users', sa.Column('archived_at', sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column('users', 'archived_at')
    op.drop_column('users', 'is_archived')
