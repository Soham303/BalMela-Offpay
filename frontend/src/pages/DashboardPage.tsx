import React, { useState, useEffect } from 'react';
import { apiRequest } from '../api';
import { useAuth } from '../context/AuthContext';
import { 
  LayoutDashboard, 
  ShoppingBag, 
  Hourglass, 
  Download, 
  Database, 
  Lock, 
  CheckCircle2, 
  AlertTriangle, 
  RefreshCw, 
  Search,
  Filter,
  PlusCircle,
  FileSpreadsheet
} from 'lucide-react';

interface SummaryData {
  total_cash_received: number;
  total_cash_voided: number;
  total_tokens_issued: number;
  total_tokens_voided: number;
  total_tokens_redeemed: number;
  total_outstanding_value: number;
  is_balanced: boolean;
  discrepancy: number;
  total_issuances_count: number;
  total_redemptions_count: number;
  active_passes_count: number;
  conversion_rate: number;
}

interface StallSummary {
  stall_id: number;
  stall_code: string;
  name: string;
  is_active: boolean;
  transaction_count: number;
  gross_tokens_collected: number;
  adjustments_deducted: number;
  net_payable_tokens: number;
  net_payable_cash: number;
}

interface TransactionItem {
  type: 'issuance' | 'redemption';
  id: number;
  reference: string;
  public_pass_id: string;
  cash_amount: number | null;
  token_amount: number;
  actor_username: string;
  stall_name: string | null;
  stall_code: string | null;
  status: string;
  created_at: string;
}

export const DashboardPage: React.FC = () => {
  const { user } = useAuth();
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [stalls, setStalls] = useState<StallSummary[]>([]);
  const [transactions, setTransactions] = useState<TransactionItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');

  // Adjustment Modal State
  const [showAdjModal, setShowAdjModal] = useState(false);
  const [adjStallId, setAdjStallId] = useState<number | ''>('');
  const [adjType, setAdjType] = useState('deduction');
  const [adjAmount, setAdjAmount] = useState('0');
  const [adjReason, setAdjReason] = useState('');
  const [isSubmittingAdj, setIsSubmittingAdj] = useState(false);

  // Backup state
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [backupMessage, setBackupMessage] = useState<string | null>(null);

  const fetchDashboardData = async () => {
    setIsLoading(true);
    try {
      const data = await apiRequest<{
        reconciliation: SummaryData;
        stall_summaries: StallSummary[];
      }>('/admin/dashboard');
      setSummary(data.reconciliation);
      setStalls(data.stall_summaries);

      const txnData = await apiRequest<{ transactions: TransactionItem[] }>(
        `/admin/transactions?type=${filterType}&search=${searchTerm}&limit=50`
      );
      setTransactions(txnData.transactions);
    } catch (err: any) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, [filterType, searchTerm]);

  const handleBackupNow = async () => {
    setIsBackingUp(true);
    setBackupMessage(null);
    try {
      const res = await apiRequest<{ filename: string }>('/admin/backup', {
        method: 'POST',
        body: JSON.stringify({ note: 'Manual admin backup via dashboard' }),
      });
      setBackupMessage(`Backup saved: ${res.filename}`);
    } catch (err: any) {
      alert(`Backup failed: ${err.error || 'Server error'}`);
    } finally {
      setIsBackingUp(false);
    }
  };

  const handleCloseEvent = async () => {
    if (!window.confirm('Are you sure you want to CLOSE the event financial ledger? This will permanently disable new token issuances and stall redemptions.')) {
      return;
    }
    try {
      await apiRequest('/admin/close-event', { method: 'POST' });
      alert('Event has been closed successfully.');
      fetchDashboardData();
    } catch (err: any) {
      alert(`Failed to close event: ${err.error}`);
    }
  };

  const handleCreateAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjReason.trim() || !adjAmount) return;

    setIsSubmittingAdj(true);
    try {
      await apiRequest('/admin/adjustments', {
        method: 'POST',
        body: JSON.stringify({
          stall_id: adjStallId || null,
          adjustment_type: adjType,
          amount: parseInt(adjAmount, 10),
          reason: adjReason.trim(),
        }),
      });
      setShowAdjModal(false);
      setAdjReason('');
      setAdjAmount('0');
      fetchDashboardData();
      alert('Adjustment recorded successfully.');
    } catch (err: any) {
      alert(`Error recording adjustment: ${err.error}`);
    } finally {
      setIsSubmittingAdj(false);
    }
  };

  const handleDownloadCsv = (type: 'transactions' | 'settlement') => {
    const token = localStorage.getItem('festtoken_auth_token');
    window.open(`/api/admin/export/${type}?token=${token}`, '_blank');
  };

  return (
    <div className="page-container">
      {/* Top Header */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '1rem',
        marginBottom: '1.75rem',
      }}>
        <div>
          <h1 style={{ fontSize: '1.85rem', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <LayoutDashboard className="text-primary" size={28} />
            Organizer Settlement & Reconciliation
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem' }}>
            Real-time financial position, stall collections, ledger verification, and exports.
          </p>
        </div>

        {/* Global Action Buttons */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={handleBackupNow}
            disabled={isBackingUp}
          >
            <Database size={16} />
            {isBackingUp ? 'Backing up...' : 'Backup Database'}
          </button>
          
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={() => handleDownloadCsv('transactions')}
          >
            <Download size={16} />
            Transactions CSV
          </button>

          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={() => handleDownloadCsv('settlement')}
          >
            <FileSpreadsheet size={16} />
            Settlement Summary CSV
          </button>

          {user?.role === 'admin' && (
            <button
              type="button"
              className="btn btn-danger btn-sm"
              onClick={handleCloseEvent}
            >
              <Lock size={16} />
              Close Event
            </button>
          )}

          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={fetchDashboardData}
            title="Refresh metrics"
          >
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      {backupMessage && (
        <div style={{
          background: 'rgba(16, 185, 129, 0.15)',
          border: '1px solid rgba(16, 185, 129, 0.35)',
          borderRadius: 'var(--radius-md)',
          padding: '0.75rem 1rem',
          color: '#6ee7b7',
          fontSize: '0.875rem',
          marginBottom: '1.25rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
        }}>
          <CheckCircle2 size={18} />
          <span>{backupMessage}</span>
        </div>
      )}

      {/* Financial Summary Metric Cards */}
      {summary && (
        <div className="stats-grid">
          <div className="stat-card success">
            <div className="stat-label">Total Cash Collected</div>
            <div className="stat-value">
              ₹{summary.total_cash_received.toLocaleString()}
            </div>
            <div className="stat-sub">
              {summary.total_issuances_count} Cash Counter Issuances
            </div>
          </div>

          <div className="stat-card primary">
            <div className="stat-label">Tokens Issued</div>
            <div className="stat-value">
              {summary.total_tokens_issued.toLocaleString()}
            </div>
            <div className="stat-sub">
              Rate: ₹{summary.conversion_rate} / Token
            </div>
          </div>

          <div className="stat-card cyan">
            <div className="stat-label">Tokens Redeemed (Stalls)</div>
            <div className="stat-value">
              {summary.total_tokens_redeemed.toLocaleString()}
            </div>
            <div className="stat-sub">
              {summary.total_redemptions_count} Completed Redemptions
            </div>
          </div>

          <div className="stat-card warning">
            <div className="stat-label">Outstanding Liability</div>
            <div className="stat-value">
              {summary.total_outstanding_value.toLocaleString()}
            </div>
            <div className="stat-sub">
              {summary.active_passes_count} Passes in Circulation
            </div>
          </div>
        </div>
      )}

      {/* Accounting Invariant Verification Banner */}
      {summary && (
        <div style={{
          background: summary.is_balanced ? 'rgba(16, 185, 129, 0.1)' : 'rgba(244, 63, 94, 0.15)',
          border: `1px solid ${summary.is_balanced ? 'rgba(16, 185, 129, 0.3)' : 'rgba(244, 63, 94, 0.4)'}`,
          borderRadius: 'var(--radius-lg)',
          padding: '1rem 1.25rem',
          marginBottom: '1.75rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '1rem',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            {summary.is_balanced ? (
              <CheckCircle2 size={24} style={{ color: 'var(--success)' }} />
            ) : (
              <AlertTriangle size={24} style={{ color: 'var(--danger)' }} />
            )}
            <div>
              <div style={{ fontWeight: 700, fontSize: '1rem' }}>
                {summary.is_balanced
                  ? 'Ledger Verified & Balanced'
                  : 'Ledger Discrepancy Detected!'}
              </div>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                Formula: Issued ({summary.total_tokens_issued}) = Redeemed ({summary.total_tokens_redeemed}) + Outstanding ({summary.total_outstanding_value})
              </div>
            </div>
          </div>

          <span className={`badge ${summary.is_balanced ? 'badge-success' : 'badge-danger'}`}>
            {summary.is_balanced ? 'Invariant Passed (0 Difference)' : `Discrepancy: ${summary.discrepancy} Tokens`}
          </span>
        </div>
      )}

      {/* Stall-by-Stall Collections & Payout Summary */}
      <div className="card" style={{ marginBottom: '1.75rem' }}>
        <div className="card-header">
          <h2 className="card-title">
            <ShoppingBag size={20} />
            Stall Collection Ledgers & Net Payouts
          </h2>
          {user?.role === 'admin' && (
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() => setShowAdjModal(true)}
            >
              <PlusCircle size={16} />
              Record Adjustment
            </button>
          )}
        </div>

        <div className="table-responsive">
          <table>
            <thead>
              <tr>
                <th>Code</th>
                <th>Stall Name</th>
                <th>Transactions</th>
                <th>Gross Tokens</th>
                <th>Deductions / Adjustments</th>
                <th>Net Payable (Tokens)</th>
                <th>Net Payable (₹ Cash)</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {stalls.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-dim)' }}>
                    No stalls registered yet.
                  </td>
                </tr>
              ) : (
                stalls.map((s) => (
                  <tr key={s.stall_id}>
                    <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                      {s.stall_code}
                    </td>
                    <td style={{ fontWeight: 600 }}>
                      {s.name}
                    </td>
                    <td>{s.transaction_count}</td>
                    <td style={{ fontWeight: 700, color: 'var(--success)' }}>
                      {s.gross_tokens_collected}
                    </td>
                    <td style={{ color: s.adjustments_deducted > 0 ? 'var(--danger)' : 'var(--text-dim)' }}>
                      {s.adjustments_deducted > 0 ? `-${s.adjustments_deducted}` : '0'}
                    </td>
                    <td style={{ fontWeight: 800, color: '#ffffff', fontSize: '1rem' }}>
                      {s.net_payable_tokens}
                    </td>
                    <td style={{ fontWeight: 800, color: 'var(--primary)' }}>
                      ₹{s.net_payable_cash.toLocaleString()}
                    </td>
                    <td>
                      <span className={`badge ${s.is_active ? 'badge-success' : 'badge-neutral'}`}>
                        {s.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Live Transaction Explorer & Search */}
      <div className="card">
        <div className="card-header" style={{ flexWrap: 'wrap', gap: '1rem' }}>
          <h2 className="card-title">
            <Hourglass size={20} />
            Live Transaction Explorer
          </h2>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <div style={{ position: 'relative' }}>
              <Search size={16} style={{
                position: 'absolute',
                left: '0.75rem',
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-dim)',
              }} />
              <input
                type="text"
                className="input-field"
                placeholder="Search pass ID or Ref..."
                style={{ paddingLeft: '2.25rem', width: '220px', fontSize: '0.85rem' }}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <Filter size={16} color="var(--text-dim)" />
              <select
                className="input-field"
                style={{ fontSize: '0.85rem', padding: '0.5rem 0.75rem' }}
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
              >
                <option value="all">All Types</option>
                <option value="issuance">Issuances</option>
                <option value="redemption">Redemptions</option>
              </select>
            </div>
          </div>
        </div>

        <div className="table-responsive" style={{ maxHeight: '420px', overflowY: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Type</th>
                <th>Ref</th>
                <th>Pass ID</th>
                <th>Amount</th>
                <th>Stall / Counter</th>
                <th>Staff</th>
                <th>Status</th>
                <th>Time (UTC)</th>
              </tr>
            </thead>
            <tbody>
              {transactions.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-dim)' }}>
                    {isLoading ? 'Loading records...' : 'No matching transactions found.'}
                  </td>
                </tr>
              ) : (
                transactions.map((t) => (
                  <tr key={`${t.type}-${t.id}`}>
                    <td>
                      <span className={`badge ${t.type === 'issuance' ? 'badge-primary' : 'badge-neutral'}`}>
                        {t.type}
                      </span>
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>
                      {t.reference}
                    </td>
                    <td style={{ fontWeight: 600 }}>
                      {t.public_pass_id}
                    </td>
                    <td style={{ fontWeight: 700 }}>
                      {t.type === 'issuance' ? (
                        <span>₹{t.cash_amount} ({t.token_amount} Tok)</span>
                      ) : (
                        <span style={{ color: 'var(--success)' }}>{t.token_amount} Tokens</span>
                      )}
                    </td>
                    <td>
                      {t.stall_name ? `${t.stall_name} (${t.stall_code})` : 'Cash Counter'}
                    </td>
                    <td style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                      {t.actor_username}
                    </td>
                    <td>
                      <span className={`badge ${t.status === 'completed' ? 'badge-success' : 'badge-danger'}`}>
                        {t.status}
                      </span>
                    </td>
                    <td style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>
                      {new Date(t.created_at).toLocaleString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Record Adjustment Modal */}
      {showAdjModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3 style={{ fontSize: '1.25rem', marginBottom: '1rem' }}>
              Record Stall Adjustment / Fee
            </h3>
            <form onSubmit={handleCreateAdjustment}>
              <div className="form-group">
                <label className="form-label">Target Stall</label>
                <select
                  className="input-field"
                  value={adjStallId}
                  onChange={(e) => setAdjStallId(e.target.value ? Number(e.target.value) : '')}
                  required
                >
                  <option value="">Select a stall...</option>
                  {stalls.map((s) => (
                    <option key={s.stall_id} value={s.stall_id}>
                      {s.stall_code} - {s.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Adjustment Type</label>
                <select
                  className="input-field"
                  value={adjType}
                  onChange={(e) => setAdjType(e.target.value)}
                >
                  <option value="deduction">Deduction (Fee / Penalty)</option>
                  <option value="refund">Refund Reversal</option>
                  <option value="manual_adjustment">Manual Credit / Correction</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Amount (Tokens)</label>
                <input
                  type="number"
                  min="1"
                  className="input-field"
                  value={adjAmount}
                  onChange={(e) => setAdjAmount(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Reason / Justification</label>
                <textarea
                  className="input-field"
                  rows={3}
                  placeholder="Explain the rationale for this financial adjustment..."
                  value={adjReason}
                  onChange={(e) => setAdjReason(e.target.value)}
                  required
                />
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem' }}>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setShowAdjModal(false)}
                  style={{ flex: 1 }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={isSubmittingAdj}
                  style={{ flex: 1 }}
                >
                  {isSubmittingAdj ? 'Recording...' : 'Record Adjustment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
