"""add is_rejected, user_change_log table, and audit trigger

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-08-29

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'b2c3d4e5f6a7'
down_revision: Union[str, None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── is_rejected on users ──────────────────────────────────────────────────
    op.add_column('users', sa.Column(
        'is_rejected', sa.Boolean(), nullable=True, server_default='false'
    ))

    # ── user_change_log table ─────────────────────────────────────────────────
    op.create_table(
        'user_change_log',
        sa.Column('id',             sa.Integer(),                  primary_key=True, autoincrement=True),
        sa.Column('user_id',        sa.Integer(),                  nullable=False, index=True),
        sa.Column('organisation_id',sa.Integer(),                  nullable=True,  index=True),
        sa.Column('changed_by_id',  sa.Integer(),                  nullable=True),
        sa.Column('changed_by_name',sa.String(200),                nullable=True),
        sa.Column('changed_at',     sa.DateTime(timezone=True),    nullable=False,
                  server_default=sa.text('NOW()')),
        sa.Column('field_name',     sa.String(100),                nullable=False),
        sa.Column('old_value',      sa.Text(),                     nullable=True),
        sa.Column('new_value',      sa.Text(),                     nullable=True),
        # 'app' = change came through app code (changed_by_id is set)
        # 'trigger' = no app entry, likely a direct DB edit
        sa.Column('source',         sa.String(100),                nullable=True),
    )

    # ── PostgreSQL trigger to catch direct-DB changes to critical fields ──────
    # This fires on ANY UPDATE to the users table, regardless of whether the
    # change came through the app. App-level entries also have changed_by_id
    # set; trigger-only entries (changed_by_id IS NULL) indicate direct DB edits.
    op.execute("""
        CREATE OR REPLACE FUNCTION fn_log_critical_user_changes()
        RETURNS TRIGGER AS $$
        BEGIN
            IF NEW.is_active IS DISTINCT FROM OLD.is_active THEN
                INSERT INTO user_change_log
                    (user_id, organisation_id, field_name, old_value, new_value, source)
                VALUES
                    (NEW.id, NEW.organisation_id, 'is_active',
                     OLD.is_active::TEXT, NEW.is_active::TEXT, 'trigger');
            END IF;
            IF NEW.is_archived IS DISTINCT FROM OLD.is_archived THEN
                INSERT INTO user_change_log
                    (user_id, organisation_id, field_name, old_value, new_value, source)
                VALUES
                    (NEW.id, NEW.organisation_id, 'is_archived',
                     OLD.is_archived::TEXT, NEW.is_archived::TEXT, 'trigger');
            END IF;
            IF NEW.is_blocked IS DISTINCT FROM OLD.is_blocked THEN
                INSERT INTO user_change_log
                    (user_id, organisation_id, field_name, old_value, new_value, source)
                VALUES
                    (NEW.id, NEW.organisation_id, 'is_blocked',
                     OLD.is_blocked::TEXT, NEW.is_blocked::TEXT, 'trigger');
            END IF;
            IF NEW.is_rejected IS DISTINCT FROM OLD.is_rejected THEN
                INSERT INTO user_change_log
                    (user_id, organisation_id, field_name, old_value, new_value, source)
                VALUES
                    (NEW.id, NEW.organisation_id, 'is_rejected',
                     COALESCE(OLD.is_rejected, false)::TEXT,
                     COALESCE(NEW.is_rejected, false)::TEXT, 'trigger');
            END IF;
            IF NEW.role IS DISTINCT FROM OLD.role THEN
                INSERT INTO user_change_log
                    (user_id, organisation_id, field_name, old_value, new_value, source)
                VALUES
                    (NEW.id, NEW.organisation_id, 'role',
                     OLD.role::TEXT, NEW.role::TEXT, 'trigger');
            END IF;
            IF NEW.staff_id IS DISTINCT FROM OLD.staff_id THEN
                INSERT INTO user_change_log
                    (user_id, organisation_id, field_name, old_value, new_value, source)
                VALUES
                    (NEW.id, NEW.organisation_id, 'staff_id',
                     OLD.staff_id, NEW.staff_id, 'trigger');
            END IF;
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
    """)

    op.execute("""
        CREATE TRIGGER trg_users_critical_field_changes
        AFTER UPDATE ON users
        FOR EACH ROW
        EXECUTE FUNCTION fn_log_critical_user_changes();
    """)


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS trg_users_critical_field_changes ON users;")
    op.execute("DROP FUNCTION IF EXISTS fn_log_critical_user_changes();")
    op.drop_table('user_change_log')
    op.drop_column('users', 'is_rejected')
