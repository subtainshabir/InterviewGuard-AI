import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict

from app.models.monitoring_session import MonitoringSessionStatus


class MonitoringSessionRead(BaseModel):
    id: uuid.UUID
    interview_session_id: uuid.UUID
    status: MonitoringSessionStatus
    started_at: Optional[datetime]
    ended_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)