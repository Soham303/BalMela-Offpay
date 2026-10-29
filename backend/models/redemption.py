from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, CheckConstraint
from sqlalchemy.orm import relationship
from backend.database import Base

class Redemption(Base):
    __tablename__ = "redemptions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    token_pass_id = Column(Integer, ForeignKey("token_passes.id"), nullable=False, index=True)
    stall_id = Column(Integer, ForeignKey("stalls.id"), nullable=False, index=True)
    operator_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    amount = Column(Integer, nullable=False)
    idempotency_key = Column(String(64), unique=True, nullable=False, index=True)
    status = Column(String(32), default="completed", nullable=False)  # 'completed', 'refunded'
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)

    __table_args__ = (
        CheckConstraint("amount > 0", name="check_redemption_amount_positive"),
    )

    token_pass = relationship("TokenPass", back_populates="redemptions")
    stall = relationship("Stall", back_populates="redemptions")
    operator = relationship("User", foreign_keys=[operator_id])

    def to_dict(self):
        return {
            "id": self.id,
            "token_pass_id": self.token_pass_id,
            "public_pass_id": self.token_pass.public_pass_id if self.token_pass else None,
            "stall_id": self.stall_id,
            "stall_name": self.stall.name if self.stall else None,
            "stall_code": self.stall.stall_code if self.stall else None,
            "operator_id": self.operator_id,
            "operator_username": self.operator.username if self.operator else None,
            "amount": self.amount,
            "idempotency_key": self.idempotency_key,
            "status": self.status,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
