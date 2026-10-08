"""un solo entrenamiento activo por usuario

Revision ID: 0003
Revises: 0002
Create Date: 2026-10-08
"""
import sqlalchemy as sa
from alembic import op

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None

_ACTIVE = sa.text("status IN ('queued', 'training')")


def upgrade() -> None:
    op.create_index(
        "uq_sign_models_user_active",
        "sign_models",
        ["user_id"],
        unique=True,
        postgresql_where=_ACTIVE,
        sqlite_where=_ACTIVE,
    )


def downgrade() -> None:
    op.drop_index("uq_sign_models_user_active", table_name="sign_models")
