from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from backend.database import Base

class Adjustment(Base):
    __tablename__ = "adjustments"

    id = Column(Integer, primary_key=True, autoincrement=True)
    reference_transaction_id = Column(Integer, nullable=True)  # Links to redemptions.id or issuances.id if applicable
    stall_id = Column(Integer, ForeignKey("stalls.id", ondelete="SET NULL"), nullable=True)
    adjustment_type = Column(String(32), nullable=False)  # 'refund', 'deduction', 'manual_adjustment'
    amount = Column(Integer, nullable=False)  # In tokens (or smallest unit)
    reason = Column(Text, nullable=False)
    approved_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)

    stall = relationship("Stall", back_populates="adjustments")
    approver = relationship("User", foreign_keys=[approved_by])

    def to_dict(self):
        return {
            "id": self.id,
            "reference_transaction_id": self.reference_transaction_id,
            "stall_id": self.stall_id,
            "stall_name": self.stall.name if self.stall else None,
            "stall_code": self.stall.stall_code if self.stall else None,
            "adjustment_type": self.adjustment_type,
            "amount": self.amount,
            "reason": self.reason,
            "approved_by": self.approved_by,
            "approver_username": self.approver.username if self.approver else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
