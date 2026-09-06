"""add payroll_number to users and seed known values

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
Create Date: 2026-09-06

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'e5f6a7b8c9d0'
down_revision: Union[str, None] = 'd4e5f6a7b8c9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Known payroll number → full name mappings (case-insensitive match on first_name || ' ' || last_name)
KNOWN = [
    ('2',   'steve iwuoha'),
    ('4',   'uche mgbemena'),
    ('196', 'shahid rehman'),
    ('260', 'festus akinbusoye'),
    ('543', 'preston binns'),
    ('581', 'adebayo abidakun'),
    ('588', 'shahid iqbal'),
    ('596', 'samuel adetunji'),
    ('601', 'wail ahmed'),
    ('607', 'precious nwaokomah'),
    ('617', 'ali akhtar'),
    ('627', 'luke cutler'),
    ('631', 'samson ifie'),
    ('632', 'alban abazi'),
    ('633', 'chikare ezeru'),
    ('636', 'shah zaib'),
    ('638', 'alain ngassa'),
    ('640', 'hadis kakari'),
    ('641', 'amadou bah'),
    ('642', 'mohamed omer mohamed tahir'),
]


def upgrade() -> None:
    op.add_column('users', sa.Column('payroll_number', sa.String(50), nullable=True))
    for number, full_name in KNOWN:
        op.execute(
            sa.text(
                "UPDATE users SET payroll_number = :num "
                "WHERE LOWER(TRIM(CONCAT(first_name, ' ', last_name))) = :name"
            ).bindparams(num=number, name=full_name)
        )


def downgrade() -> None:
    op.drop_column('users', 'payroll_number')
