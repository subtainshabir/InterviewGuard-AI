import uuid
from datetime import datetime
from typing import Dict, Optional, Set

from sqlalchemy.orm import Session

from app.models.candidate import Candidate
from app.models.interview_session import InterviewSession, InterviewSessionStatus
from app.models.monitoring_session import MonitoringSession, MonitoringSessionStatus
from app.services.exceptions import (
    CandidateNotFoundError,
    InterviewSessionNotFoundError,
    InvalidStateTransitionError,
)

_ALLOWED_TRANSITIONS: Dict[InterviewSessionStatus, Set[InterviewSessionStatus]] = {
    InterviewSessionStatus.SCHEDULED: {
        InterviewSessionStatus.READY,
        InterviewSessionStatus.ACTIVE,
        InterviewSessionStatus.CANCELLED,
    },
    InterviewSessionStatus.READY: {
        InterviewSessionStatus.ACTIVE,
        InterviewSessionStatus.CANCELLED,
    },
    InterviewSessionStatus.ACTIVE: {
        InterviewSessionStatus.PAUSED,
        InterviewSessionStatus.COMPLETED,
    },
    InterviewSessionStatus.PAUSED: {
        InterviewSessionStatus.ACTIVE,
        InterviewSessionStatus.COMPLETED,
    },
    InterviewSessionStatus.COMPLETED: set(),
    InterviewSessionStatus.CANCELLED: set(),
}


def _ensure_transition(current: InterviewSessionStatus, target: InterviewSessionStatus) -> None:
    if target not in _ALLOWED_TRANSITIONS.get(current, set()):
        raise InvalidStateTransitionError(
            f"Cannot transition interview session from '{current.value}' to '{target.value}'"
        )


def _latest_monitoring_session(session: InterviewSession) -> Optional[MonitoringSession]:
    if not session.monitoring_sessions:
        return None
    return max(session.monitoring_sessions, key=lambda m: m.created_at)


def create_interview_session(
    db: Session, candidate_id: uuid.UUID, scheduled_at: Optional[datetime] = None
) -> InterviewSession:
    candidate = db.get(Candidate, candidate_id)
    if candidate is None:
        raise CandidateNotFoundError(f"Candidate '{candidate_id}' not found")

    session = InterviewSession(candidate_id=candidate_id, scheduled_at=scheduled_at)
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


def get_interview_session(db: Session, session_id: uuid.UUID) -> InterviewSession:
    session = db.get(InterviewSession, session_id)
    if session is None:
        raise InterviewSessionNotFoundError(f"Interview session '{session_id}' not found")
    return session


def start_interview(db: Session, session_id: uuid.UUID) -> InterviewSession:
    session = get_interview_session(db, session_id)
    _ensure_transition(session.status, InterviewSessionStatus.ACTIVE)

    now = datetime.utcnow()
    session.status = InterviewSessionStatus.ACTIVE
    session.started_at = now

    monitoring = MonitoringSession(
        interview_session_id=session.id,
        status=MonitoringSessionStatus.ACTIVE,
        started_at=now,
    )
    db.add(monitoring)
    db.commit()
    db.refresh(session)
    return session


def pause_interview(db: Session, session_id: uuid.UUID) -> InterviewSession:
    session = get_interview_session(db, session_id)
    _ensure_transition(session.status, InterviewSessionStatus.PAUSED)

    session.status = InterviewSessionStatus.PAUSED
    monitoring = _latest_monitoring_session(session)
    if monitoring is not None:
        monitoring.status = MonitoringSessionStatus.PAUSED

    db.commit()
    db.refresh(session)
    return session


def resume_interview(db: Session, session_id: uuid.UUID) -> InterviewSession:
    session = get_interview_session(db, session_id)
    _ensure_transition(session.status, InterviewSessionStatus.ACTIVE)

    session.status = InterviewSessionStatus.ACTIVE
    monitoring = _latest_monitoring_session(session)
    if monitoring is not None:
        monitoring.status = MonitoringSessionStatus.ACTIVE

    db.commit()
    db.refresh(session)
    return session


def end_interview(db: Session, session_id: uuid.UUID) -> InterviewSession:
    session = get_interview_session(db, session_id)
    _ensure_transition(session.status, InterviewSessionStatus.COMPLETED)

    now = datetime.utcnow()
    session.status = InterviewSessionStatus.COMPLETED
    session.ended_at = now

    monitoring = _latest_monitoring_session(session)
    if monitoring is not None:
        monitoring.status = MonitoringSessionStatus.COMPLETED
        monitoring.ended_at = now

    db.commit()
    db.refresh(session)
    return session


def cancel_interview(db: Session, session_id: uuid.UUID) -> InterviewSession:
    session = get_interview_session(db, session_id)
    _ensure_transition(session.status, InterviewSessionStatus.CANCELLED)

    session.status = InterviewSessionStatus.CANCELLED
    db.commit()
    db.refresh(session)
    return session