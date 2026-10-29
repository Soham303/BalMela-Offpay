from decimal import Decimal
from sqlalchemy import func
from backend.database import get_db
from backend.models import TokenPass, Issuance, Redemption, Adjustment, Stall, SystemConfig

def get_financial_reconciliation():
    session = get_db()
    config = session.query(SystemConfig).filter_by(id=1).first()
    conversion_rate = float(config.cash_to_token_rate) if config else 1.0

    # 1. Total Cash Collected at Counter
    total_cash_result = (
        session.query(func.coalesce(func.sum(Issuance.cash_received), 0))
        .filter(Issuance.status == "completed")
        .scalar()
    )
    total_cash_received = float(total_cash_result or 0.0)

    # 2. Total Tokens Issued (Active + Completed)
    total_tokens_issued = (
        session.query(func.coalesce(func.sum(Issuance.token_value_issued), 0))
        .filter(Issuance.status == "completed")
        .scalar()
    ) or 0

    # 3. Total Tokens Voided
    total_tokens_voided = (
        session.query(func.coalesce(func.sum(Issuance.token_value_issued), 0))
        .filter(Issuance.status == "voided")
        .scalar()
    ) or 0

    total_cash_voided = float((
        session.query(func.coalesce(func.sum(Issuance.cash_received), 0))
        .filter(Issuance.status == "voided")
        .scalar()
    ) or 0.0)

    # 4. Total Valid Tokens Redeemed Across All Stalls
    total_tokens_redeemed = (
        session.query(func.coalesce(func.sum(Redemption.amount), 0))
        .filter(Redemption.status == "completed")
        .scalar()
    ) or 0

    # 5. Total Unspent Tokens Outstanding
    total_outstanding_value = (
        session.query(func.coalesce(func.sum(TokenPass.remaining_value), 0))
        .filter(TokenPass.status.in_(["active", "exhausted"]))
        .scalar()
    ) or 0

    # 6. Invariant Check:
    # Issued Tokens = Redeemed Tokens + Outstanding Tokens (for completed issuances)
    expected_sum = total_tokens_redeemed + total_outstanding_value
    discrepancy = total_tokens_issued - expected_sum
    is_balanced = (discrepancy == 0)

    # 7. Total Counts
    total_issuances_count = session.query(func.count(Issuance.id)).filter(Issuance.status == "completed").scalar() or 0
    total_redemptions_count = session.query(func.count(Redemption.id)).filter(Redemption.status == "completed").scalar() or 0
    active_passes_count = session.query(func.count(TokenPass.id)).filter(TokenPass.status == "active").scalar() or 0

    # 8. Per-Stall Breakdown
    stalls = session.query(Stall).order_by(Stall.stall_code.asc()).all()
    stall_summaries = []

    for stall in stalls:
        # Gross tokens redeemed
        gross_tokens = (
            session.query(func.coalesce(func.sum(Redemption.amount), 0))
            .filter(Redemption.stall_id == stall.id, Redemption.status == "completed")
            .scalar()
        ) or 0

        txn_count = (
            session.query(func.count(Redemption.id))
            .filter(Redemption.stall_id == stall.id, Redemption.status == "completed")
            .scalar()
        ) or 0

        # Adjustments / Deductions / Refunds
        stall_adjustments = (
            session.query(func.coalesce(func.sum(Adjustment.amount), 0))
            .filter(Adjustment.stall_id == stall.id)
            .scalar()
        ) or 0

        net_payable_tokens = max(0, gross_tokens - stall_adjustments)
        net_payable_cash = float(net_payable_tokens * conversion_rate)

        stall_summaries.append({
            "stall_id": stall.id,
            "stall_code": stall.stall_code,
            "name": stall.name,
            "is_active": stall.is_active,
            "transaction_count": txn_count,
            "gross_tokens_collected": gross_tokens,
            "adjustments_deducted": stall_adjustments,
            "net_payable_tokens": net_payable_tokens,
            "net_payable_cash": round(net_payable_cash, 2),
        })

    return {
        "summary": {
            "total_cash_received": total_cash_received,
            "total_cash_voided": total_cash_voided,
            "total_tokens_issued": total_tokens_issued,
            "total_tokens_voided": total_tokens_voided,
            "total_tokens_redeemed": total_tokens_redeemed,
            "total_outstanding_value": total_outstanding_value,
            "is_balanced": is_balanced,
            "discrepancy": discrepancy,
            "total_issuances_count": total_issuances_count,
            "total_redemptions_count": total_redemptions_count,
            "active_passes_count": active_passes_count,
            "conversion_rate": conversion_rate,
        },
        "stall_summaries": stall_summaries,
    }
