import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr


class CandidateBase(BaseModel):
    name: str
    email: EmailStr


class CandidateCreate(CandidateBase):
    pass


class CandidateRead(CandidateBase):
    id: uuid.UUID
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)