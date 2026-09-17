import uuid
from typing import Callable

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.interview_session import InterviewSession
from app.schemas.interview_session import InterviewSessionCreate, InterviewSessionRead
from app.services import interview_service
from app.services.exceptions import (
    CandidateNotFoundError,
    InterviewSessionNotFoundError,
    InvalidStateTransitionError,
)

router = APIRouter(prefix="/interviews", tags=["interviews"])


def _run_transition(
    service_fn: Callable[[Session, uuid.UUID], InterviewSession],
    db: Session,
    session_id: uuid.UUID,
) -> InterviewSession:
    try:
        return service_fn(db, session_id)
    except InterviewSessionNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except InvalidStateTransitionError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.post("", response_model=InterviewSessionRead, status_code=status.HTTP_201_CREATED)
def create_interview(payload: InterviewSessionCreate, db: Session = Depends(get_db)):
    try:
        return interview_service.create_interview_session(
            db, candidate_id=payload.candidate_id, scheduled_at=payload.scheduled_at
        )
    except CandidateNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/{session_id}", response_model=InterviewSessionRead)
def get_interview(session_id: uuid.UUID, db: Session = Depends(get_db)):
    try:
        return interview_service.get_interview_session(db, session_id)
    except InterviewSessionNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/{session_id}/start", response_model=InterviewSessionRead)
def start_interview(session_id: uuid.UUID, db: Session = Depends(get_db)):
    return _run_transition(interview_service.start_interview, db, session_id)


@router.post("/{session_id}/pause", response_model=InterviewSessionRead)
def pause_interview(session_id: uuid.UUID, db: Session = Depends(get_db)):
    return _run_transition(interview_service.pause_interview, db, session_id)


@router.post("/{session_id}/resume", response_model=InterviewSessionRead)
def resume_interview(session_id: uuid.UUID, db: Session = Depends(get_db)):
    return _run_transition(interview_service.resume_interview, db, session_id)


@router.post("/{session_id}/end", response_model=InterviewSessionRead)
def end_interview(session_id: uuid.UUID, db: Session = Depends(get_db)):
    return _run_transition(interview_service.end_interview, db, session_id)


@router.post("/{session_id}/cancel", response_model=InterviewSessionRead)
def cancel_interview(session_id: uuid.UUID, db: Session = Depends(get_db)):
    return _run_transition(interview_service.cancel_interview, db, session_id)