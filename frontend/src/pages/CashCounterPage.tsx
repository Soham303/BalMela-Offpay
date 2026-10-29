import React, { useState, useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import { apiRequest } from '../api';
import { 
  Coins, 
  Printer, 
  RotateCcw, 
  CheckCircle, 
  AlertCircle, 
  Receipt, 
  Trash2, 
  Sparkles,
  ArrowRight,
  ExternalLink,
  Copy
} from 'lucide-react';

interface Issuance {
  id: number;
  token_pass_id: number;
  public_pass_id: string;
  cash_received: number;
  token_value_issued: number;
  conversion_rate: number;
  cashier_username: string;
  created_at: string;
  status: 'completed' | 'voided';
}

interface IssueResult {
  issuance: Issuance;
  token_pass: {
    public_pass_id: string;
    issued_value: number;
    remaining_value: number;
  };
  qr_payload: string;
  secret: string;
}

export const CashCounterPage: React.FC = () => {
  const [cashAmount, setCashAmount] = useState<string>('100');
  const [rate, setRate] = useState<number>(1.0);
  const [denominations, setDenominations] = useState<number[]>([20, 50, 100, 200, 500]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successResult, setSuccessResult] = useState<IssueResult | null>(null);

  const [recentIssuances, setRecentIssuances] = useState<Issuance[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  const qrCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Fetch Config (Rate and Denominations)
  const fetchConfig = async () => {
    try {
      const data = await apiRequest<{ cash_to_token_rate: number; allowed_denominations: number[] }>('/config');
      setRate(data.cash_to_token_rate || 1.0);
      if (data.allowed_denominations?.length) {
        setDenominations(data.allowed_denominations);
      }
    } catch {
      // Fallback default
    }
  };

  // Fetch recent issuances
  const fetchHistory = async () => {
    setIsLoadingHistory(true);
    try {
      const data = await apiRequest<{ issuances: Issuance[] }>('/counter/issuances?limit=25');
      setRecentIssuances(data.issuances);
    } catch (err: any) {
      console.error(err);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  useEffect(() => {
    fetchConfig();
    fetchHistory();
  }, []);

  // Render QR code to canvas whenever a pass is issued
  useEffect(() => {
    if (successResult && qrCanvasRef.current) {
      const attendeeUrl = `${window.location.origin}/pass#id=${successResult.token_pass.public_pass_id}&secret=${successResult.secret}`;
      QRCode.toCanvas(qrCanvasRef.current, attendeeUrl, {
        width: 240,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#ffffff',
        },
      });
    }
  }, [successResult]);

  const calculatedTokens = Math.max(0, Math.floor((parseFloat(cashAmount) || 0) / rate));

  const handleIssuePass = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountVal = parseFloat(cashAmount);
    if (!amountVal || amountVal <= 0) {
      setError('Please enter a valid cash amount greater than zero.');
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      const result = await apiRequest<IssueResult>('/counter/issue', {
        method: 'POST',
        body: JSON.stringify({ cash_received: amountVal }),
      });
      setSuccessResult(result);
      fetchHistory();
    } catch (err: any) {
      setError(err.error || 'Failed to issue token pass.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVoidPass = async (issuanceId: number) => {
    const reason = window.prompt('Please enter a reason for voiding this issuance:');
    if (!reason || !reason.trim()) return;

    try {
      await apiRequest(`/counter/void/${issuanceId}`, {
        method: 'POST',
        body: JSON.stringify({ reason: reason.trim() }),
      });
      alert('Issuance successfully voided.');
      fetchHistory();
    } catch (err: any) {
      alert(`Error: ${err.error || 'Failed to void pass'}`);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="page-container">
      <div style={{ marginBottom: '1.75rem' }}>
        <h1 style={{ fontSize: '1.85rem', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <Coins className="text-primary" size={28} />
          Cash Counter & Token Issuance
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem' }}>
          Record collected cash, issue secure QR token passes, and display them to attendees.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '1.5rem' }}>
        
        {/* Issuance Form & QR Presentation Card */}
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">
              <Sparkles size={20} color="var(--primary)" />
              {successResult ? 'Digital Pass Issued' : 'New Token Issuance'}
            </h2>
            <span className="badge badge-neutral">Rate: ₹{rate} = 1 Token</span>
          </div>

          {error && (
            <div style={{
              background: 'rgba(244, 63, 94, 0.15)',
              border: '1px solid rgba(244, 63, 94, 0.3)',
              borderRadius: 'var(--radius-md)',
              padding: '0.85rem',
              color: '#fda4af',
              fontSize: '0.875rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              marginBottom: '1rem',
            }}>
              <AlertCircle size={18} />
              <span>{error}</span>
            </div>
          )}

          {successResult ? (
            <div style={{ textAlign: 'center' }}>
              <div style={{
                background: 'rgba(16, 185, 129, 0.12)',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                borderRadius: 'var(--radius-md)',
                padding: '0.65rem 1rem',
                color: '#6ee7b7',
                fontSize: '0.875rem',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
                marginBottom: '1rem',
              }}>
                <CheckCircle size={18} />
                <span>Pass activated! Present this QR code to the attendee.</span>
              </div>

              {/* Printable QR Ticket Container */}
              <div className="qr-display-container">
                <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  FestToken Pass
                </div>
                <canvas ref={qrCanvasRef} className="qr-code-canvas"></canvas>
                <div className="qr-pass-label">
                  {successResult.token_pass.public_pass_id}
                </div>
                <div className="qr-token-pill">
                  {successResult.token_pass.issued_value} TOKENS
                </div>
                <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.35rem' }}>
                  Cash Received: ₹{successResult.issuance.cash_received}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#6366f1', marginTop: '0.35rem', fontWeight: 600 }}>
                  Scan with phone camera to load your pass
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginTop: '1rem' }}>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() => {
                    const url = `${window.location.origin}/pass#id=${successResult.token_pass.public_pass_id}&secret=${successResult.secret}`;
                    window.open(url, '_blank');
                  }}
                  title="Open Attendee Pass in New Tab"
                >
                  <ExternalLink size={16} />
                  Open Pass (Demo)
                </button>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() => {
                    const url = `${window.location.origin}/pass#id=${successResult.token_pass.public_pass_id}&secret=${successResult.secret}`;
                    navigator.clipboard.writeText(url);
                    alert('Attendee pass link copied to clipboard!');
                  }}
                  title="Copy pass link"
                >
                  <Copy size={16} />
                  Copy Pass Link
                </button>
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.75rem' }}>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={handlePrint}
                  style={{ flex: 1 }}
                >
                  <Printer size={18} />
                  Print Receipt
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => {
                    setSuccessResult(null);
                    setCashAmount('100');
                  }}
                  style={{ flex: 1 }}
                >
                  <RotateCcw size={18} />
                  Issue Next Pass
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleIssuePass}>
              <div className="form-group">
                <label className="form-label" htmlFor="cash-input">Cash Collected (₹ INR)</label>
                <input
                  id="cash-input"
                  type="number"
                  step="any"
                  className="input-field input-number-lg"
                  placeholder="0.00"
                  value={cashAmount}
                  onChange={(e) => setCashAmount(e.target.value)}
                  autoFocus
                  required
                />
                
                <div className="chips-container">
                  {denominations.map((denom) => (
                    <button
                      key={denom}
                      type="button"
                      className={`chip-btn ${parseFloat(cashAmount) === denom ? 'active' : ''}`}
                      onClick={() => setCashAmount(denom.toString())}
                    >
                      +₹{denom}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{
                background: 'var(--bg-card-elevated)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-md)',
                padding: '1rem',
                margin: '1.25rem 0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}>
                <div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                    Calculated Token Value
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>
                    Based on rate: ₹{rate} / Token
                  </div>
                </div>
                <div style={{
                  fontFamily: 'var(--font-heading)',
                  fontSize: '2rem',
                  fontWeight: 800,
                  color: 'var(--success)'
                }}>
                  {calculatedTokens} <span style={{ fontSize: '1rem', color: 'var(--text-muted)' }}>Tokens</span>
                </div>
              </div>

              <button
                id="issue-pass-submit-btn"
                type="submit"
                className="btn btn-success btn-lg"
                style={{ width: '100%' }}
                disabled={isSubmitting || calculatedTokens <= 0}
              >
                {isSubmitting ? 'Generating Digital Pass...' : `Issue ${calculatedTokens} Tokens`}
                {!isSubmitting && <ArrowRight size={20} />}
              </button>
            </form>
          )}
        </div>

        {/* Recent Cashier Issuances List */}
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">
              <Receipt size={20} />
              Recent Issuances
            </h2>
            <button
              className="btn btn-outline btn-sm"
              onClick={fetchHistory}
              disabled={isLoadingHistory}
            >
              Refresh
            </button>
          </div>

          <div className="table-responsive" style={{ maxHeight: '420px', overflowY: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Ref</th>
                  <th>Pass ID</th>
                  <th>Cash</th>
                  <th>Tokens</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {recentIssuances.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-dim)', padding: '2rem' }}>
                      {isLoadingHistory ? 'Loading history...' : 'No issuances recorded yet.'}
                    </td>
                  </tr>
                ) : (
                  recentIssuances.map((iss) => (
                    <tr key={iss.id}>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>
                        ISS-{iss.id}
                      </td>
                      <td style={{ fontWeight: 600 }}>
                        {iss.public_pass_id}
                      </td>
                      <td>₹{iss.cash_received}</td>
                      <td style={{ fontWeight: 700, color: 'var(--success)' }}>
                        {iss.token_value_issued}
                      </td>
                      <td>
                        <span className={`badge ${iss.status === 'completed' ? 'badge-success' : 'badge-danger'}`}>
                          {iss.status}
                        </span>
                      </td>
                      <td>
                        {iss.status === 'completed' && (
                          <button
                            className="btn btn-outline btn-sm"
                            title="Void Issuance"
                            onClick={() => handleVoidPass(iss.id)}
                            style={{ padding: '0.25rem 0.5rem', color: '#fda4af' }}
                          >
                            <Trash2 size={14} />
                            Void
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
};
