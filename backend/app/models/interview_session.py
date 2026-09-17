import enum
import secrets
import uuid
from datetime import datetime
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import Enum, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.db.mixins import TimestampMixin

if TYPE_CHECKING:
    from app.models.candidate import Candidate
    from app.models.monitoring_session import MonitoringSession


class InterviewSessionStatus(str, enum.Enum):
    SCHEDULED = "scheduled"
    READY = "ready"
    ACTIVE = "active"
    PAUSED = "paused"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


def _generate_session_code() -> str:
    return secrets.token_urlsafe(8)


class InterviewSession(TimestampMixin, Base):
    __tablename__ = "interview_sessions"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    candidate_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("candidates.id", ondelete="CASCADE"), nullable=False, index=True
    )
    session_code: Mapped[str] = mapped_column(
        String(64), unique=True, index=True, nullable=False, default=_generate_session_code
    )
    status: Mapped[InterviewSessionStatus] = mapped_column(
        Enum(InterviewSessionStatus, name="interview_session_status"),
        nullable=False,
        default=InterviewSessionStatus.SCHEDULED,
    )
    scheduled_at: Mapped[Optional[datetime]] = mapped_column(nullable=True)
    started_at: Mapped[Optional[datetime]] = mapped_column(nullable=True)
    ended_at: Mapped[Optional[datetime]] = mapped_column(nullable=True)

    candidate: Mapped["Candidate"] = relationship(back_populates="interview_sessions")
    monitoring_sessions: Mapped[List["MonitoringSession"]] = relationship(
        back_populates="interview_session", cascade="all, delete-orphan"
    )