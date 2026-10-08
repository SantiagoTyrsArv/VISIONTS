"""sign_samples y sign_models

Revision ID: 0002
Revises: 0001
Create Date: 2026-10-07
"""
import sqlalchemy as sa
from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
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


def downgrade() -> None:
    op.drop_table("sign_models")
    op.drop_table("sign_samples")
