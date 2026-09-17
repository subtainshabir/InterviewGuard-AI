import uuid
from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field, computed_field

from app.models.interview_session import InterviewSessionStatus
from app.schemas.candidate import CandidateRead
from app.schemas.monitoring_session import MonitoringSessionRead


class InterviewSessionBase(BaseModel):
    candidate_id: uuid.UUID
    scheduled_at: Optional[datetime] = None


class InterviewSessionCreate(InterviewSessionBase):
    pass


class InterviewSessionRead(InterviewSessionBase):
    id: uuid.UUID
    session_code: str
    status: InterviewSessionStatus
    started_at: Optional[datetime]
    ended_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime
    candidate: CandidateRead
    monitoring_sessions: List[MonitoringSessionRead] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)

    @computed_field
    @property
    def duration_seconds(self) -> Optional[int]:
        if self.started_at is None:
            return None
        end = self.ended_at or datetime.utcnow()
        return max(int((end - self.started_at).total_seconds()), 0)