from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from backend.database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, autoincrement=True)
    username = Column(String(64), unique=True, nullable=False, index=True)
    password_hash = Column(String(256), nullable=False)
    role = Column(String(32), nullable=False)  # 'admin', 'cashier', 'stall_operator', 'auditor'
    stall_id = Column(Integer, ForeignKey("stalls.id", ondelete="SET NULL"), nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    last_login_at = Column(DateTime, nullable=True)

    stall = relationship("Stall", back_populates="operators", foreign_keys=[stall_id])

    def to_dict(self):
        return {
            "id": self.id,
            "username": self.username,
            "role": self.role,
            "stall_id": self.stall_id,
            "stall_name": self.stall.name if self.stall else None,
            "stall_code": self.stall.stall_code if self.stall else None,
            "is_active": self.is_active,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "last_login_at": self.last_login_at.isoformat() if self.last_login_at else None,
        }
