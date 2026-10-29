import React, { useState, useEffect, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { apiRequest } from '../api';
import { useAuth } from '../context/AuthContext';
import { 
  Store, 
  Camera, 
  CameraOff, 
  CheckCircle, 
  AlertCircle, 
  KeyRound, 
  History, 
  RotateCcw,
  Sparkles,
  ArrowRight
} from 'lucide-react';

interface PassInspection {
  valid: boolean;
  public_pass_id: string;
  status: string;
  remaining_value: number;
  issued_value: number;
  message?: string;
}

interface RedemptionResult {
  message: string;
  transaction: {
    id: number;
    amount: number;
    public_pass_id: string;
    idempotency_key: string;
    created_at: string;
  };
  remaining_value: number;
  is_duplicate_retry: boolean;
}

interface StallTxn {
  id: number;
  amount: number;
  public_pass_id: string;
  created_at: string;
  status: string;
}

export const StallCheckoutPage: React.FC = () => {
  const { user } = useAuth();
  const [selectedStallId, setSelectedStallId] = useState<number | null>(user?.stall_id || null);
  const [availableStalls, setAvailableStalls] = useState<{ id: number; name: string; stall_code: string }[]>([]);

  // Scanner state
  const [isScanning, setIsScanning] = useState(false);
  const [scannedQr, setScannedQr] = useState<string>('');
  const [manualCode, setManualCode] = useState<string>('');
  const [showManualInput, setShowManualInput] = useState(false);

  // Pass Inspection State
  const [passData, setPassData] = useState<PassInspection | null>(null);
  const [isInspecting, setIsInspecting] = useState(false);
  const [chargeAmount, setChargeAmount] = useState<string>('50');

  // Transaction result
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmedResult, setConfirmedResult] = useState<RedemptionResult | null>(null);

  // Stall Stats & History
  const [totalCollected, setTotalCollected] = useState<number>(0);
  const [stallHistory, setStallHistory] = useState<StallTxn[]>([]);
  const [isLoadingStats, setIsLoadingStats] = useState(false);

  const qrRegionId = 'html5qr-code-full-region';
  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);

  // If admin, load stalls list
  useEffect(() => {
    if (user?.role === 'admin' || user?.role === 'auditor') {
      apiRequest<{ stalls: { id: number; name: string; stall_code: string }[] }>('/admin/stalls')
        .then((res) => {
          setAvailableStalls(res.stalls);
          if (!selectedStallId && res.stalls.length > 0) {
            setSelectedStallId(res.stalls[0].id);
          }
        })
        .catch(console.error);
    }
  }, [user]);

  // Fetch stall summary & history
  const fetchStallData = async () => {
    const stallIdParam = selectedStallId ? `?stall_id=${selectedStallId}` : '';
    setIsLoadingStats(true);
    try {
      const summary = await apiRequest<{ total_tokens_collected: number }>(`/stall/summary${stallIdParam}`);
      setTotalCollected(summary.total_tokens_collected || 0);

      const history = await apiRequest<{ transactions: StallTxn[] }>(`/stall/transactions${stallIdParam}&limit=15`);
      setStallHistory(history.transactions || []);
    } catch {
      // Ignore or show error
    } finally {
      setIsLoadingStats(false);
    }
  };

  useEffect(() => {
    if (selectedStallId || user?.stall_id) {
      fetchStallData();
    }
  }, [selectedStallId]);

  // Stop scanner on unmount
  useEffect(() => {
    return () => {
      if (html5QrCodeRef.current && html5QrCodeRef.current.isScanning) {
        html5QrCodeRef.current.stop().catch(console.error);
      }
    };
  }, []);

  const startScanner = async () => {
    setError(null);
    try {
      if (!html5QrCodeRef.current) {
        html5QrCodeRef.current = new Html5Qrcode(qrRegionId);
      }

      setIsScanning(true);
      await html5QrCodeRef.current.start(
        { facingMode: 'environment' },
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
        },
        (decodedText) => {
          handleQrDetected(decodedText);
        },
        () => {
          // Frame error ignored
        }
      );
    } catch (err: any) {
      setIsScanning(false);
      setError('Camera access denied or not available. Use manual code entry below.');
    }
  };

  const stopScanner = async () => {
    if (html5QrCodeRef.current && html5QrCodeRef.current.isScanning) {
      try {
        await html5QrCodeRef.current.stop();
      } catch (err) {
        console.error(err);
      }
    }
    setIsScanning(false);
  };

  const handleQrDetected = (qrString: string) => {
    setScannedQr(qrString);
    stopScanner();
    inspectPass(qrString);
  };

  const inspectPass = async (qrString: string) => {
    setIsInspecting(true);
    setError(null);
    try {
      const data = await apiRequest<PassInspection>('/stall/inspect', {
        method: 'POST',
        body: JSON.stringify({ qr_data: qrString.trim() }),
      });
      setPassData(data);
    } catch (err: any) {
      setPassData(null);
      setError(err.error || 'Invalid or unverified token pass.');
    } finally {
      setIsInspecting(false);
    }
  };

  const handleManualInspect = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualCode.trim()) return;
    setScannedQr(manualCode.trim());
    inspectPass(manualCode.trim());
  };

  const handleConfirmRedemption = async () => {
    if (!scannedQr) {
      setError('No pass detected. Please scan or enter a pass.');
      return;
    }

    const amt = parseInt(chargeAmount, 10);
    if (!amt || amt <= 0) {
      setError('Charge amount must be at least 1 token.');
      return;
    }

    if (passData && amt > passData.remaining_value) {
      setError(`Cannot charge ${amt} tokens. Pass only has ${passData.remaining_value} tokens remaining.`);
      return;
    }

    setError(null);
    setIsSubmitting(true);

    // Generate unique idempotency key for this purchase
    const idempotencyKey = `stall-${selectedStallId || user?.stall_id}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    try {
      const result = await apiRequest<RedemptionResult>('/stall/redeem', {
        method: 'POST',
        body: JSON.stringify({
          qr_data: scannedQr,
          amount: amt,
          idempotency_key: idempotencyKey,
          stall_id: selectedStallId,
        }),
      });

      setConfirmedResult(result);
      fetchStallData();
    } catch (err: any) {
      setError(err.error || 'Redemption failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetForNextCustomer = () => {
    setPassData(null);
    setConfirmedResult(null);
    setScannedQr('');
    setManualCode('');
    setError(null);
    setChargeAmount('50');
  };

  return (
    <div className="page-container">
      {/* Header with Stall Info & Live Collection Total */}
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
            <Store className="text-primary" size={28} />
            Stall Checkout & Redemption
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem' }}>
            {user?.role === 'admin'
              ? 'Administrator Stall Checkout Terminal'
              : `Operating as: ${user?.stall_name || 'Assigned Stall'} (${user?.stall_code || ''})`}
          </p>
        </div>

        {/* Live Stall Earnings Badge */}
        <div style={{
          background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.2) 0%, rgba(6, 182, 212, 0.2) 100%)',
          border: '1px solid rgba(99, 102, 241, 0.4)',
          borderRadius: 'var(--radius-lg)',
          padding: '0.75rem 1.25rem',
          display: 'flex',
          alignItems: 'center',
          gap: '1rem',
        }}>
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Stall Gross Total
            </div>
            <div style={{ fontFamily: 'var(--font-heading)', fontSize: '1.6rem', fontWeight: 800, color: '#ffffff' }}>
              {totalCollected} <span style={{ fontSize: '0.9rem', color: '#a5b4fc' }}>Tokens</span>
            </div>
          </div>
        </div>
      </div>

      {/* Admin Stall Switcher Dropdown */}
      {user?.role === 'admin' && availableStalls.length > 0 && (
        <div className="card" style={{ marginBottom: '1.5rem', padding: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-muted)' }}>
              Operating Stall:
            </span>
            <select
              className="input-field"
              style={{ maxWidth: '300px', padding: '0.5rem 0.85rem' }}
              value={selectedStallId || ''}
              onChange={(e) => setSelectedStallId(Number(e.target.value))}
            >
              {availableStalls.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.stall_code} — {s.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Main Grid: Scanner & Checkout on Left, History on Right */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '1.5rem' }}>

        {/* Left Column: QR Scanner & Charge Terminal */}
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">
              <Camera size={20} color="var(--primary)" />
              {confirmedResult ? 'Payment Confirmed' : 'Scan Attendee Token Pass'}
            </h2>
            {!confirmedResult && (
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => setShowManualInput(!showManualInput)}
              >
                <KeyRound size={14} />
                {showManualInput ? 'Camera' : 'Manual Code'}
              </button>
            )}
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

          {/* 1. CONFIRMATION RECEIPT SCREEN */}
          {confirmedResult ? (
            <div style={{ textAlign: 'center', padding: '1rem 0' }}>
              <div style={{
                width: '72px',
                height: '72px',
                borderRadius: '50%',
                background: 'rgba(16, 185, 129, 0.2)',
                border: '2px solid var(--success)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 1.25rem',
                color: 'var(--success)'
              }}>
                <CheckCircle size={42} />
              </div>

              <h3 style={{ fontSize: '1.5rem', marginBottom: '0.35rem' }}>
                Payment Successful!
              </h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
                Transaction Ref: RED-{confirmedResult.transaction.id}
              </p>

              <div style={{
                background: 'var(--bg-card-elevated)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-lg)',
                padding: '1.25rem',
                margin: '0 auto 1.5rem',
                maxWidth: '320px',
                textAlign: 'left'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Charged Amount:</span>
                  <span style={{ fontWeight: 800, color: 'var(--success)', fontSize: '1.1rem' }}>
                    {confirmedResult.transaction.amount} Tokens
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Pass Remaining:</span>
                  <span style={{ fontWeight: 700, color: '#ffffff' }}>
                    {confirmedResult.remaining_value} Tokens
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Pass ID:</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>
                    {confirmedResult.transaction.public_pass_id}
                  </span>
                </div>
              </div>

              <button
                type="button"
                className="btn btn-primary btn-lg"
                style={{ width: '100%' }}
                onClick={handleResetForNextCustomer}
              >
                <RotateCcw size={20} />
                Next Customer
              </button>
            </div>
          ) : (
            /* 2. SCAN & CHARGE WORKFLOW */
            <div>
              {/* QR Scanner Camera Area */}
              {!showManualInput ? (
                <div style={{ marginBottom: '1.25rem' }}>
                  <div className="scanner-box">
                    <div id={qrRegionId} style={{ width: '100%', minHeight: isScanning ? '260px' : '0' }}></div>
                    {!isScanning && (
                      <div style={{ padding: '2.5rem 1rem', textAlign: 'center', background: 'var(--bg-card-elevated)' }}>
                        <Camera size={44} style={{ color: 'var(--text-dim)', marginBottom: '0.75rem' }} />
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1rem' }}>
                          Position the attendee's QR pass in front of camera
                        </p>
                        <button
                          type="button"
                          className="btn btn-primary"
                          onClick={startScanner}
                        >
                          <Camera size={18} />
                          Activate Scanner
                        </button>
                      </div>
                    )}
                  </div>

                  {isScanning && (
                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      onClick={stopScanner}
                      style={{ width: '100%', marginTop: '0.75rem' }}
                    >
                      <CameraOff size={16} />
                      Stop Camera
                    </button>
                  )}
                </div>
              ) : (
                /* Manual Input Fallback */
                <form onSubmit={handleManualInspect} style={{ marginBottom: '1.25rem' }}>
                  <div className="form-group">
                    <label className="form-label">Paste / Enter Pass Credential</label>
                    <input
                      type="text"
                      className="input-field"
                      placeholder="e.g. FEST:PASS-XXXXXXXX:secret or PASS-XXXXXXXX:secret"
                      value={manualCode}
                      onChange={(e) => setManualCode(e.target.value)}
                    />
                  </div>
                  <button
                    type="submit"
                    className="btn btn-outline"
                    style={{ width: '100%' }}
                    disabled={isInspecting || !manualCode.trim()}
                  >
                    Verify Pass
                  </button>
                </form>
              )}

              {/* Pass Inspection Details Card */}
              {passData && (
                <div style={{
                  background: 'var(--bg-card-elevated)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-md)',
                  padding: '1.25rem',
                  marginBottom: '1.25rem',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <Sparkles size={18} color="var(--primary)" />
                      <span style={{ fontWeight: 700, fontSize: '1rem' }}>
                        {passData.public_pass_id}
                      </span>
                    </div>
                    <span className={`badge ${passData.valid ? 'badge-success' : 'badge-danger'}`}>
                      {passData.status}
                    </span>
                  </div>

                  <div style={{
                    display: 'flex',
                    alignItems: 'baseline',
                    justifyContent: 'space-between',
                    padding: '0.65rem 0.85rem',
                    background: 'rgba(99, 102, 241, 0.1)',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid rgba(99, 102, 241, 0.25)',
                  }}>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Available Balance:</span>
                    <span style={{ fontFamily: 'var(--font-heading)', fontSize: '1.5rem', fontWeight: 800, color: 'var(--success)' }}>
                      {passData.remaining_value} <span style={{ fontSize: '0.85rem' }}>Tokens</span>
                    </span>
                  </div>
                </div>
              )}

              {/* Charge Input & Quick Buttons */}
              <div className="form-group">
                <label className="form-label" htmlFor="stall-charge-amount">Charge Amount (Tokens)</label>
                <input
                  id="stall-charge-amount"
                  type="number"
                  min="1"
                  className="input-field input-number-lg"
                  value={chargeAmount}
                  onChange={(e) => setChargeAmount(e.target.value)}
                />
                
                <div className="chips-container">
                  {[20, 30, 50, 80, 100, 150].map((amt) => (
                    <button
                      key={amt}
                      type="button"
                      className={`chip-btn ${parseInt(chargeAmount, 10) === amt ? 'active' : ''}`}
                      onClick={() => setChargeAmount(amt.toString())}
                    >
                      {amt} Tokens
                    </button>
                  ))}
                </div>
              </div>

              {/* Confirm Redemption Action */}
              <button
                id="stall-confirm-redemption-btn"
                type="button"
                className="btn btn-primary btn-lg"
                style={{ width: '100%', marginTop: '0.75rem' }}
                disabled={isSubmitting || !scannedQr || !passData?.valid || parseInt(chargeAmount, 10) <= 0}
                onClick={handleConfirmRedemption}
              >
                {isSubmitting ? 'Confirming with Server...' : `Charge ${chargeAmount || 0} Tokens`}
                {!isSubmitting && <ArrowRight size={20} />}
              </button>
            </div>
          )}
        </div>

        {/* Right Column: Stall Collections & Recent Sales History */}
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">
              <History size={20} />
              Recent Stall Collections
            </h2>
            <button
              className="btn btn-outline btn-sm"
              onClick={fetchStallData}
              disabled={isLoadingStats}
            >
              Refresh
            </button>
          </div>

          <div className="table-responsive" style={{ maxHeight: '480px', overflowY: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Ref</th>
                  <th>Pass ID</th>
                  <th>Tokens</th>
                  <th>Status</th>
                  <th>Time</th>
                </tr>
              </thead>
              <tbody>
                {stallHistory.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-dim)', padding: '2rem' }}>
                      {isLoadingStats ? 'Loading history...' : 'No redemptions recorded for this stall yet.'}
                    </td>
                  </tr>
                ) : (
                  stallHistory.map((txn) => (
                    <tr key={txn.id}>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>
                        RED-{txn.id}
                      </td>
                      <td style={{ fontWeight: 600 }}>
                        {txn.public_pass_id}
                      </td>
                      <td style={{ fontWeight: 700, color: 'var(--success)' }}>
                        +{txn.amount}
                      </td>
                      <td>
                        <span className="badge badge-success">
                          {txn.status}
                        </span>
                      </td>
                      <td style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>
                        {new Date(txn.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
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
