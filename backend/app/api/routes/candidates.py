from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.candidate import Candidate
from app.schemas.candidate import CandidateCreate, CandidateRead

router = APIRouter(prefix="/candidates", tags=["candidates"])


@router.post("", response_model=CandidateRead, status_code=status.HTTP_201_CREATED)
def create_candidate(payload: CandidateCreate, db: Session = Depends(get_db)) -> Candidate:
    candidate = Candidate(name=payload.name, email=payload.email)
    db.add(candidate)
    db.commit()
    db.refresh(candidate)
    return candidate