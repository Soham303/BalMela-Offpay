from datetime import datetime, timezone
from sqlalchemy import Column, Integer, Numeric, String, DateTime, ForeignKey, Boolean
from sqlalchemy.orm import relationship
from backend.database import Base

class Issuance(Base):
    __tablename__ = "issuances"

    id = Column(Integer, primary_key=True, autoincrement=True)
    token_pass_id = Column(Integer, ForeignKey("token_passes.id"), nullable=False, index=True)
    cash_received = Column(Numeric(10, 2), nullable=False)
    token_value_issued = Column(Integer, nullable=False)
    conversion_rate = Column(Numeric(10, 2), nullable=False)
    cashier_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    is_topup = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    status = Column(String(32), default="completed", nullable=False)  # 'completed', 'voided'

    token_pass = relationship("TokenPass", back_populates="issuances")
    cashier = relationship("User", foreign_keys=[cashier_id])

    def to_dict(self):
        return {
            "id": self.id,
            "token_pass_id": self.token_pass_id,
            "public_pass_id": self.token_pass.public_pass_id if self.token_pass else None,
            "cash_received": float(self.cash_received),
            "token_value_issued": self.token_value_issued,
            "conversion_rate": float(self.conversion_rate),
            "cashier_id": self.cashier_id,
            "cashier_username": self.cashier.username if self.cashier else None,
            "is_topup": bool(self.is_topup),
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "status": self.status,
        }

