from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Boolean, DateTime
from sqlalchemy.orm import relationship
from backend.database import Base

class Stall(Base):
    __tablename__ = "stalls"

    id = Column(Integer, primary_key=True, autoincrement=True)
    stall_code = Column(String(32), unique=True, nullable=False, index=True)
    name = Column(String(128), nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)

    operators = relationship("User", back_populates="stall", foreign_keys="User.stall_id")
    redemptions = relationship("Redemption", back_populates="stall")
    adjustments = relationship("Adjustment", back_populates="stall")

    def to_dict(self):
        return {
            "id": self.id,
            "stall_code": self.stall_code,
            "name": self.name,
            "is_active": self.is_active,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
