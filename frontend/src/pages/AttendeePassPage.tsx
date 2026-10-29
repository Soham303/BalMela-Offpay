import React, { useState, useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import { apiRequest } from '../api';
import { 
  Ticket, 
  Sparkles, 
  ShoppingBag, 
  RotateCcw, 
  AlertCircle, 
  Coins
} from 'lucide-react';

interface PassTransaction {
  id: number;
  reference: string;
  stall_name: string;
  stall_code: string;
  amount: number;
  status: string;
  created_at: string;
}

interface PassDetails {
  public_pass_id: string;
  issued_value: number;
  remaining_value: number;
  status: string;
  created_at: string;
  transactions: PassTransaction[];
}

interface AttendeePassPageProps {
  onBackToStaffLogin?: () => void;
}

export const AttendeePassPage: React.FC<AttendeePassPageProps> = ({ onBackToStaffLogin }) => {
  const [passId, setPassId] = useState<string>('');
  const [secret, setSecret] = useState<string>('');
  const [passData, setPassData] = useState<PassDetails | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [inputCode, setInputCode] = useState<string>('');
  const qrCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Extract pass credentials from URL hash / query or localStorage on mount
  useEffect(() => {
    let extractedId = '';
    let extractedSecret = '';

    // 1. Try URL Hash #id=PASS-...&secret=...
    const hash = window.location.hash.replace('#', '');
    if (hash) {
      const params = new URLSearchParams(hash);
      extractedId = params.get('id') || '';
      extractedSecret = params.get('secret') || '';
    }

    // 2. Try URL Query ?id=PASS-...&secret=...
    if (!extractedId || !extractedSecret) {
      const searchParams = new URLSearchParams(window.location.search);
      extractedId = searchParams.get('id') || '';
      extractedSecret = searchParams.get('secret') || '';
    }

    // 3. Fallback to localStorage saved pass
    if (!extractedId || !extractedSecret) {
      const saved = localStorage.getItem('festtoken_attendee_pass');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          extractedId = parsed.id;
          extractedSecret = parsed.secret;
        } catch {
          // Ignore
        }
      }
    }

    if (extractedId && extractedSecret) {
      setPassId(extractedId);
      setSecret(extractedSecret);
      localStorage.setItem('festtoken_attendee_pass', JSON.stringify({ id: extractedId, secret: extractedSecret }));
      fetchPass(extractedId, extractedSecret);
    } else {
      setIsLoading(false);
    }
  }, []);

  // Fetch pass details from backend
  const fetchPass = async (id: string, sec: string) => {
    try {
      const data = await apiRequest<PassDetails>('/pass/view', {
        method: 'POST',
        body: JSON.stringify({ public_pass_id: id, secret: sec }),
      });
      setPassData(data);
      setError(null);
    } catch (err: any) {
      setError(err.error || 'Could not load pass. Please check your credentials.');
    } finally {
      setIsLoading(false);
    }
  };

  // Live polling every 4 seconds to reflect stall charges immediately!
  useEffect(() => {
    if (!passId || !secret) return;

    const timer = setInterval(() => {
      fetchPass(passId, secret);
    }, 4000);

    return () => clearInterval(timer);
  }, [passId, secret]);

  // Render Payment QR code on canvas whenever pass data is loaded
  useEffect(() => {
    if (passData && passId && secret && qrCanvasRef.current) {
      // The QR code contains the standard payment format FEST:<pass_id>:<secret>
      const qrPayload = `FEST:${passId}:${secret}`;
      QRCode.toCanvas(qrCanvasRef.current, qrPayload, {
        width: 230,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#ffffff',
        },
      });
    }
  }, [passData, passId, secret]);

  const handleManualLookup = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputCode.trim()) return;

    let pId = '';
    let pSec = '';

    const text = inputCode.trim();
    if (text.includes('#id=') || text.includes('?id=')) {
      const parts = text.split(/[?#]/)[1];
      const params = new URLSearchParams(parts);
      pId = params.get('id') || '';
      pSec = params.get('secret') || '';
    } else if (text.startsWith('FEST:')) {
      const split = text.split(':');
      if (split.length >= 3) {
        pId = split[1];
        pSec = split[2];
      }
    } else if (text.includes(':')) {
      const split = text.split(':');
      pId = split[0];
      pSec = split[1];
    }

    if (!pId || !pSec) {
      setError('Invalid format. Please enter format PASS-XXXXXXXX:secret or full pass link.');
      return;
    }

    setPassId(pId);
    setSecret(pSec);
    setIsLoading(true);
    localStorage.setItem('festtoken_attendee_pass', JSON.stringify({ id: pId, secret: pSec }));
    fetchPass(pId, pSec);
  };

  const handleForgetPass = () => {
    localStorage.removeItem('festtoken_attendee_pass');
    setPassId('');
    setSecret('');
    setPassData(null);
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      background: 'radial-gradient(circle at 50% 10%, #1e1b4b 0%, #080b11 75%)',
      padding: '1.25rem 1rem 3rem'
    }}>
      {/* Top Header */}
      <div style={{
        maxWidth: '440px',
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '1.5rem',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <div className="brand-logo-icon" style={{ width: '32px', height: '32px' }}>
            <Ticket size={18} />
          </div>
          <span style={{ fontFamily: 'var(--font-heading)', fontSize: '1.25rem', fontWeight: 800 }}>
            FestToken Wallet
          </span>
        </div>

        {onBackToStaffLogin && (
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={onBackToStaffLogin}
            style={{ fontSize: '0.75rem' }}
          >
            Staff Portal
          </button>
        )}
      </div>

      <div style={{ maxWidth: '440px', width: '100%' }}>
        {error && (
          <div style={{
            background: 'rgba(244, 63, 94, 0.15)',
            border: '1px solid rgba(244, 63, 94, 0.35)',
            borderRadius: 'var(--radius-md)',
            padding: '0.85rem 1rem',
            marginBottom: '1.25rem',
            color: '#fda4af',
            fontSize: '0.875rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.6rem'
          }}>
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        )}

        {/* 1. PASS WALLET DISPLAY */}
        {passData ? (
          <div>
            {/* Glowing Digital Pass Card */}
            <div className="card" style={{
              background: 'linear-gradient(145deg, #131b2e 0%, #0f172a 100%)',
              border: '1px solid rgba(99, 102, 241, 0.4)',
              boxShadow: '0 12px 35px rgba(99, 102, 241, 0.25)',
              textAlign: 'center',
              padding: '1.75rem 1.25rem',
              marginBottom: '1.5rem',
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '1rem',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#a5b4fc', fontSize: '0.85rem', fontWeight: 600 }}>
                  <Sparkles size={16} />
                  <span>Attendee Digital Pass</span>
                </div>
                <span className={`badge ${passData.remaining_value > 0 ? 'badge-success' : 'badge-danger'}`}>
                  {passData.status}
                </span>
              </div>

              {/* Balance Counter */}
              <div style={{ margin: '1rem 0' }}>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Your Available Balance
                </div>
                <div style={{
                  fontFamily: 'var(--font-heading)',
                  fontSize: '3rem',
                  fontWeight: 900,
                  color: 'var(--success)',
                  lineHeight: 1.1,
                  margin: '0.25rem 0',
                }}>
                  {passData.remaining_value}
                  <span style={{ fontSize: '1.25rem', color: 'var(--text-muted)', fontWeight: 600, marginLeft: '0.35rem' }}>
                    Tokens
                  </span>
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>
                  Total Issued: {passData.issued_value} Tokens
                </div>
              </div>

              {/* Payment QR Code Box */}
              <div className="qr-display-container" style={{ margin: '1rem auto', maxWidth: '280px' }}>
                <canvas ref={qrCanvasRef} style={{ width: '220px', height: '220px' }}></canvas>
                <div style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.9rem',
                  fontWeight: 800,
                  color: '#0f172a',
                  marginTop: '0.4rem'
                }}>
                  {passData.public_pass_id}
                </div>
              </div>

              <p style={{ fontSize: '0.85rem', color: '#a5b4fc', fontWeight: 500, marginTop: '0.75rem' }}>
                Show this QR code to any stall operator to pay!
              </p>
            </div>

            {/* Recent Stall Purchases Ledger */}
            <div className="card">
              <div className="card-header">
                <h3 className="card-title" style={{ fontSize: '1.05rem' }}>
                  <ShoppingBag size={18} />
                  Your Spending History
                </h3>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() => fetchPass(passId, secret)}
                  title="Refresh Balance"
                >
                  <RotateCcw size={14} />
                </button>
              </div>

              {passData.transactions.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-dim)', fontSize: '0.875rem' }}>
                  No tokens spent yet. Visit any festival stall to make a purchase!
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {passData.transactions.map((tx) => (
                    <div
                      key={tx.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '0.75rem',
                        background: 'var(--bg-card-elevated)',
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid var(--border-subtle)',
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                          {tx.stall_name}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                          {new Date(tx.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • Ref: {tx.reference}
                        </div>
                      </div>
                      <div style={{ fontWeight: 800, color: 'var(--danger)', fontSize: '1rem' }}>
                        -{tx.amount} Tokens
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ marginTop: '1.25rem', textAlign: 'center' }}>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}
                  onClick={handleForgetPass}
                >
                  Switch Pass / Enter Another Code
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* 2. MANUAL LOOKUP IF NO PASS IN URL OR LOCAL STORAGE */
          <div className="card">
            <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
              <div style={{
                width: '50px',
                height: '50px',
                borderRadius: '50%',
                background: 'rgba(99, 102, 241, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 0.75rem',
                color: 'var(--primary)'
              }}>
                <Coins size={26} />
              </div>
              <h2 style={{ fontSize: '1.4rem', marginBottom: '0.25rem' }}>
                Check Your Token Pass
              </h2>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                If you received a pass link or code from the cash counter, paste it below to view your live balance and payment QR.
              </p>
            </div>

            <form onSubmit={handleManualLookup}>
              <div className="form-group">
                <label className="form-label">Pass Code or Link</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="e.g. PASS-XXXXXXXX:secret or full URL"
                  value={inputCode}
                  onChange={(e) => setInputCode(e.target.value)}
                  required
                />
              </div>

              <button
                type="submit"
                className="btn btn-primary"
                style={{ width: '100%' }}
                disabled={isLoading}
              >
                {isLoading ? 'Checking...' : 'Open My Pass'}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};
