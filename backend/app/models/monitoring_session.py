import enum
import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Optional

from sqlalchemy import Enum, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.db.mixins import TimestampMixin

if TYPE_CHECKING:
    from app.models.interview_session import InterviewSession


class MonitoringSessionStatus(str, enum.Enum):
    PENDING = "pending"
    ACTIVE = "active"
    PAUSED = "paused"
    COMPLETED = "completed"
    STOPPED = "stopped"


class MonitoringSession(TimestampMixin, Base):
    __tablename__ = "monitoring_sessions"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    interview_session_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("interview_sessions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    status: Mapped[MonitoringSessionStatus] = mapped_column(
        Enum(MonitoringSessionStatus, name="monitoring_session_status"),
        nullable=False,
        default=MonitoringSessionStatus.PENDING,
    )
    started_at: Mapped[Optional[datetime]] = mapped_column(nullable=True)
    ended_at: Mapped[Optional[datetime]] = mapped_column(nullable=True)

    interview_session: Mapped["InterviewSession"] = relationship(
        back_populates="monitoring_sessions"
    )