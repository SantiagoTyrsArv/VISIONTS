"""elimina sign_samples y sign_models (el modelo de señas es global y va en la app)

Revision ID: 0004
Revises: 0003
Create Date: 2026-10-14
"""
import sqlalchemy as sa
from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None

_ACTIVE = sa.text("status IN ('queued', 'training')")


def upgrade() -> None:
    op.drop_table("sign_models")
    op.drop_table("sign_samples")


def downgrade() -> None:
    op.create_table(
        "sign_samples",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("label", sa.String(50), nullable=False),
        sa.Column("data", sa.LargeBinary(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_sign_samples_user_id", "sign_samples", ["user_id"])
    op.create_index("ix_sign_samples_user_label", "sign_samples", ["user_id", "label"])
    op.create_table(
        "sign_models",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("labels", sa.JSON(), nullable=False),
        sa.Column("weights", sa.JSON(), nullable=True),
        sa.Column("metrics", sa.JSON(), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_sign_models_user_id", "sign_models", ["user_id"])
    op.create_index("ix_sign_models_status", "sign_models", ["status"])
    op.create_index(
        "uq_sign_models_user_active",
        "sign_models",
        ["user_id"],
        unique=True,
        postgresql_where=_ACTIVE,
        sqlite_where=_ACTIVE,
    )
