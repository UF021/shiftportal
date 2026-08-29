"""add forwarded_to to incident_reports and incident_auto_forwards table

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-08-29

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'c3d4e5f6a7b8'
down_revision: Union[str, None] = 'b2c3d4e5f6a7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('incident_reports', sa.Column(
        'forwarded_to', sa.Text(), nullable=True
    ))

    op.create_table(
        'incident_auto_forwards',
        sa.Column('id',              sa.Integer(),                primary_key=True, autoincrement=True),
        sa.Column('organisation_id', sa.Integer(),                nullable=False, index=True),
        sa.Column('site_id',         sa.Integer(),                nullable=False),
        sa.Column('site_name',       sa.String(200),              nullable=False),
        sa.Column('emails',          sa.Text(),                   nullable=False),
        sa.Column('created_by_id',   sa.Integer(),                nullable=True),
        sa.Column('created_at',      sa.DateTime(timezone=True),  nullable=False,
                  server_default=sa.text('NOW()')),
        sa.UniqueConstraint('organisation_id', 'site_id', name='uq_autoforward_org_site'),
    )


def downgrade() -> None:
    op.drop_table('incident_auto_forwards')
    op.drop_column('incident_reports', 'forwarded_to')
