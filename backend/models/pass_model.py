from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, CheckConstraint
from sqlalchemy.orm import relationship
from backend.database import Base

class TokenPass(Base):
    __tablename__ = "token_passes"

    id = Column(Integer, primary_key=True, autoincrement=True)
    public_pass_id = Column(String(36), unique=True, nullable=False, index=True)
    attendee_name = Column(String(128), nullable=True, index=True)
    credential_hash = Column(String(128), unique=True, nullable=False, index=True)
    issued_value = Column(Integer, nullable=False)
    remaining_value = Column(Integer, nullable=False)
    conversion_rate_version = Column(Integer, default=1, nullable=False)
    status = Column(String(32), default="active", nullable=False)  # 'active', 'exhausted', 'revoked', 'voided'
    issued_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)

    __table_args__ = (
        CheckConstraint("remaining_value >= 0", name="check_remaining_positive"),
        CheckConstraint("remaining_value <= issued_value", name="check_remaining_lte_issued"),
        CheckConstraint("issued_value > 0", name="check_issued_positive"),
    )

    issuer = relationship("User", foreign_keys=[issued_by])
    issuances = relationship("Issuance", back_populates="token_pass", order_by="Issuance.created_at.desc()")
    redemptions = relationship("Redemption", back_populates="token_pass", order_by="Redemption.created_at.desc()")

    @property
    def issuance(self):
        return self.issuances[0] if self.issuances else None

    def to_dict(self, include_redemptions=False):
        data = {
            "id": self.id,
            "public_pass_id": self.public_pass_id,
            "attendee_name": self.attendee_name,
            "issued_value": self.issued_value,
            "remaining_value": self.remaining_value,
            "conversion_rate_version": self.conversion_rate_version,
            "status": self.status,
            "issued_by": self.issued_by,
            "cashier_username": self.issuer.username if self.issuer else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
        if include_redemptions:
            data["redemptions"] = [r.to_dict() for r in self.redemptions]
        return data
