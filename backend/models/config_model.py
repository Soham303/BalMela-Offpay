from datetime import datetime, timezone
from sqlalchemy import Column, Integer, Numeric, String, Boolean, DateTime
from backend.database import Base

class SystemConfig(Base):
    __tablename__ = "system_configs"

    id = Column(Integer, primary_key=True, default=1)
    event_name = Column(String(128), default="FestToken Annual Fest", nullable=False)
    cash_to_token_rate = Column(Numeric(10, 2), default=1.0, nullable=False)  # 1 cash = 1 token unit
    rate_version = Column(Integer, default=1, nullable=False)
    allowed_denominations = Column(String(256), default="10,20,50,100,200,500", nullable=False)
    issuance_started = Column(Boolean, default=False, nullable=False)
    event_status = Column(String(32), default="active", nullable=False)  # 'setup', 'active', 'closed'
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), nullable=False)

    def to_dict(self):
        denoms = []
        if self.allowed_denominations:
            try:
                denoms = [int(x.strip()) for x in self.allowed_denominations.split(",") if x.strip()]
            except Exception:
                denoms = [10, 20, 50, 100, 200, 500]
        return {
            "id": self.id,
            "event_name": self.event_name,
            "cash_to_token_rate": float(self.cash_to_token_rate),
            "rate_version": self.rate_version,
            "allowed_denominations": denoms,
            "issuance_started": self.issuance_started,
            "event_status": self.event_status,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
