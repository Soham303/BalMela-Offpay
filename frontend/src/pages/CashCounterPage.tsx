import React, { useState, useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import { Html5Qrcode } from 'html5-qrcode';
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
  Copy,
  PlusCircle,
  Search,
  User as UserIcon,
  Camera,
  CameraOff,
  Smartphone,
  QrCode,
  X
} from 'lucide-react';

interface Issuance {
  id: number;
  token_pass_id: number;
  public_pass_id: string;
  cash_received: number;
  token_value_issued: number;
  conversion_rate: number;
  cashier_username: string;
  is_topup?: boolean;
  created_at: string;
  status: 'completed' | 'voided';
}

interface IssueResult {
  issuance: Issuance;
  token_pass: {
    public_pass_id: string;
    attendee_name?: string;
    issued_value: number;
    remaining_value: number;
  };
  qr_payload: string;
  secret: string;
}

interface PassLookupResult {
  token_pass: {
    id: number;
    public_pass_id: string;
    attendee_name?: string;
    issued_value: number;
    remaining_value: number;
    status: string;
    created_at: string;
  };
  issuances: Issuance[];
  redemptions: any[];
}

interface CashierSummary {
  total_cash_collected: number;
  total_tokens_given: number;
  total_issuances_count: number;
  total_passes_count: number;
}

export const CashCounterPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'issue' | 'topup'>('issue');

  // Issue Pass Form State
  const [attendeeName, setAttendeeName] = useState<string>('');
  const [cashAmount, setCashAmount] = useState<string>('100');
  const [rate, setRate] = useState<number>(1.0);
  const [denominations, setDenominations] = useState<number[]>([20, 50, 100, 200, 500]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successResult, setSuccessResult] = useState<IssueResult | null>(null);

  // Top-Up Form State
  const [lookupQuery, setLookupQuery] = useState<string>('');
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [lookedUpPass, setLookedUpPass] = useState<PassLookupResult | null>(null);
  const [topupAmount, setTopupAmount] = useState<string>('100');
  const [isToppingUp, setIsToppingUp] = useState(false);
  const [topupSuccessMsg, setTopupSuccessMsg] = useState<string | null>(null);

  // Search suggestions
  const [searchResults, setSearchResults] = useState<any[]>([]);

  // Summary Metrics State
  const [summary, setSummary] = useState<CashierSummary>({
    total_cash_collected: 0,
    total_tokens_given: 0,
    total_issuances_count: 0,
    total_passes_count: 0,
  });

  // Recent History
  const [recentIssuances, setRecentIssuances] = useState<Issuance[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // Scanner state for cashier top-up
  const [isScanning, setIsScanning] = useState(false);
  const cashierQrRegionId = 'cashier-qr-scanner-region';
  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Card Scanner state for Issue New Pass tab
  const [scannedCardPayload, setScannedCardPayload] = useState<string | null>(null);
  const [isIssueScanning, setIsIssueScanning] = useState(false);
  const issueQrRegionId = 'issue-card-qr-region';
  const issueHtml5QrCodeRef = useRef<Html5Qrcode | null>(null);
  const issueFileInputRef = useRef<HTMLInputElement | null>(null);

  const qrCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Stop scanners on unmount
  useEffect(() => {
    return () => {
      if (html5QrCodeRef.current && html5QrCodeRef.current.isScanning) {
        html5QrCodeRef.current.stop().catch(console.error);
      }
      if (issueHtml5QrCodeRef.current && issueHtml5QrCodeRef.current.isScanning) {
        issueHtml5QrCodeRef.current.stop().catch(console.error);
      }
    };
  }, []);

  const startScanner = async () => {
    setError(null);
    try {
      if (!html5QrCodeRef.current) {
        html5QrCodeRef.current = new Html5Qrcode(cashierQrRegionId);
      }
      setIsScanning(true);
      await html5QrCodeRef.current.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText) => {
          handleQrScanned(decodedText);
        },
        () => {}
      );
    } catch (err: any) {
      setIsScanning(false);
      setError('Camera video failed or blocked. Use "Snap QR Photo" below or type/paste code.');
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

  const handleFileScan = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    try {
      if (!html5QrCodeRef.current) {
        html5QrCodeRef.current = new Html5Qrcode(cashierQrRegionId);
      }
      const decodedText = await html5QrCodeRef.current.scanFile(file, false);
      handleQrScanned(decodedText);
    } catch {
      setError('Could not detect QR in image. Please ensure photo is clear and well-lit.');
    } finally {
      e.target.value = '';
    }
  };

  const handleQrScanned = (qrText: string) => {
    stopScanner();
    setLookupQuery(qrText);
    handleLookupPass(qrText);
  };

  // Issue Tab Card Scanner Handlers
  const startIssueScanner = async () => {
    setError(null);
    try {
      if (!issueHtml5QrCodeRef.current) {
        issueHtml5QrCodeRef.current = new Html5Qrcode(issueQrRegionId);
      }
      setIsIssueScanning(true);
      await issueHtml5QrCodeRef.current.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText) => {
          handleIssueCardScanned(decodedText);
        },
        () => {}
      );
    } catch (err: any) {
      setIsIssueScanning(false);
      setError('Camera video failed or blocked. Use "Snap Card Photo" or paste code.');
    }
  };

  const stopIssueScanner = async () => {
    if (issueHtml5QrCodeRef.current && issueHtml5QrCodeRef.current.isScanning) {
      try {
        await issueHtml5QrCodeRef.current.stop();
      } catch (err) {
        console.error(err);
      }
    }
    setIsIssueScanning(false);
  };

  const handleIssueFileScan = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    try {
      if (!issueHtml5QrCodeRef.current) {
        issueHtml5QrCodeRef.current = new Html5Qrcode(issueQrRegionId);
      }
      const decodedText = await issueHtml5QrCodeRef.current.scanFile(file, false);
      handleIssueCardScanned(decodedText);
    } catch {
      setError('Could not detect QR in image. Please ensure photo is clear and well-lit.');
    } finally {
      e.target.value = '';
    }
  };

  const parseDisplayPassId = (raw: string): string => {
    if (!raw) return '';
    if (raw.includes('#id=')) {
      const parts = raw.split('#id=');
      if (parts[1]) return parts[1].split('&')[0];
    }
    if (raw.includes('?id=')) {
      const parts = raw.split('?id=');
      if (parts[1]) return parts[1].split('&')[0];
    }
    const colonParts = raw.split(':');
    if (colonParts.length === 3 && colonParts[0] === 'FEST') {
      return colonParts[1];
    }
    if (colonParts.length === 2 && colonParts[0].toUpperCase().startsWith('PASS-')) {
      return colonParts[0];
    }
    return raw;
  };

  const handleIssueCardScanned = async (qrText: string) => {
    await stopIssueScanner();
    const trimmed = qrText.trim();
    if (!trimmed) return;
    setError(null);

    // Check if this pass already exists and is active
    try {
      const existing = await apiRequest<PassLookupResult>('/counter/lookup', {
        method: 'POST',
        body: JSON.stringify({ pass_identifier: trimmed }),
      });
      if (existing && existing.token_pass) {
        alert(`Notice: Card '${existing.token_pass.public_pass_id}' is already initialized with ${existing.token_pass.remaining_value} Tokens. Switching to Top-Up tab to add more credits.`);
        setActiveTab('topup');
        setLookupQuery(trimmed);
        setLookedUpPass(existing);
        return;
      }
    } catch {
      // 404 means it's uninitialized -> ready to bind!
    }

    setScannedCardPayload(trimmed);
  };

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

  // Fetch Summary Counters
  const fetchSummary = async () => {
    try {
      const data = await apiRequest<CashierSummary>('/counter/summary');
      setSummary(data);
    } catch (err) {
      console.error('Failed to fetch cashier summary', err);
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
    fetchSummary();
    fetchHistory();

    const interval = setInterval(() => {
      fetchSummary();
    }, 5000);
    return () => clearInterval(interval);
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
  const calculatedTopupTokens = Math.max(0, Math.floor((parseFloat(topupAmount) || 0) / rate));

  // Issue New Pass
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
        body: JSON.stringify({ 
          cash_received: amountVal,
          attendee_name: attendeeName.trim() || undefined,
          scanned_qr_payload: scannedCardPayload || undefined,
        }),
      });
      setSuccessResult(result);
      setScannedCardPayload(null);
      fetchSummary();
      fetchHistory();
    } catch (err: any) {
      setError(err.error || 'Failed to issue token pass.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Lookup Pass for Top-up
  const handleLookupPass = async (passIdOrQr?: string) => {
    const query = passIdOrQr || lookupQuery;
    if (!query.trim()) {
      setError('Please enter a Pass ID, Name, or scan the QR code.');
      return;
    }

    setError(null);
    setTopupSuccessMsg(null);
    setIsLookingUp(true);

    try {
      const data = await apiRequest<PassLookupResult>('/counter/lookup', {
        method: 'POST',
        body: JSON.stringify({ pass_identifier: query.trim() }),
      });
      setLookedUpPass(data);
      setSearchResults([]);
    } catch (err: any) {
      // If direct lookup fails, try searching by name
      try {
        const searchData = await apiRequest<{ passes: any[] }>(`/counter/search?q=${encodeURIComponent(query.trim())}`);
        if (searchData.passes.length === 1) {
          // Direct hit
          handleLookupPass(searchData.passes[0].public_pass_id);
          return;
        } else if (searchData.passes.length > 1) {
          setSearchResults(searchData.passes);
          setError(`Found ${searchData.passes.length} matching passes. Select one below:`);
          return;
        }
      } catch {}

      setError(err.error || `Could not find pass matching '${query}'.`);
      setLookedUpPass(null);
    } finally {
      setIsLookingUp(false);
    }
  };

  // Top-Up Credits on Existing Pass
  const handleTopupPass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lookedUpPass) return;

    const amountVal = parseFloat(topupAmount);
    if (!amountVal || amountVal <= 0) {
      setError('Please enter a valid top-up cash amount.');
      return;
    }

    setError(null);
    setIsToppingUp(true);

    try {
      const result = await apiRequest<{ new_balance: number; tokens_added: number; message: string }>('/counter/topup', {
        method: 'POST',
        body: JSON.stringify({
          pass_identifier: lookedUpPass.token_pass.public_pass_id,
          cash_received: amountVal,
        }),
      });

      setTopupSuccessMsg(`+${result.tokens_added} Tokens added! New Available Balance: ${result.new_balance} Tokens.`);
      // Refresh lookup card
      handleLookupPass(lookedUpPass.token_pass.public_pass_id);
      fetchSummary();
      fetchHistory();
    } catch (err: any) {
      setError(err.error || 'Failed to top up pass.');
    } finally {
      setIsToppingUp(false);
    }
  };

  // Void Pass
  const handleVoidPass = async (issuanceId: number) => {
    const reason = window.prompt('Please enter a reason for voiding this issuance:');
    if (!reason || !reason.trim()) return;

    try {
      await apiRequest(`/counter/void/${issuanceId}`, {
        method: 'POST',
        body: JSON.stringify({ reason: reason.trim() }),
      });
      alert('Issuance successfully voided.');
      fetchSummary();
      fetchHistory();
    } catch (err: any) {
      alert(`Error: ${err.error || 'Failed to void pass'}`);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const switchTab = (tab: 'issue' | 'topup') => {
    stopScanner();
    stopIssueScanner();
    setActiveTab(tab);
    setError(null);
  };

  return (
    <div className="page-container">
      {/* Page Title */}
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.85rem', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <Coins className="text-primary" size={28} />
          Cash Counter & Token Desk
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem' }}>
          Issue new QR passes, top up attendee credits on demand, and track cash reconciliation in real time.
        </p>
      </div>

      {/* Real-Time Cashier Summary Counters */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '1rem',
        marginBottom: '1.75rem'
      }}>
        <div className="card" style={{
          background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.15) 0%, rgba(79, 70, 229, 0.08) 100%)',
          border: '1px solid rgba(99, 102, 241, 0.3)',
          padding: '1.25rem',
        }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Credits Given Away
          </div>
          <div style={{ fontFamily: 'var(--font-heading)', fontSize: '2rem', fontWeight: 800, color: 'var(--success)', marginTop: '0.2rem' }}>
            {summary.total_tokens_given}
            <span style={{ fontSize: '1rem', color: 'var(--text-muted)', fontWeight: 600, marginLeft: '0.4rem' }}>Tokens</span>
          </div>
        </div>

        <div className="card" style={{
          background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.15) 0%, rgba(5, 150, 105, 0.08) 100%)',
          border: '1px solid rgba(16, 185, 129, 0.3)',
          padding: '1.25rem',
        }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Total Cash Collected
          </div>
          <div style={{ fontFamily: 'var(--font-heading)', fontSize: '2rem', fontWeight: 800, color: '#ffffff', marginTop: '0.2rem' }}>
            ₹{summary.total_cash_collected}
          </div>
        </div>

        <div className="card" style={{
          background: 'linear-gradient(135deg, rgba(14, 165, 233, 0.15) 0%, rgba(2, 132, 199, 0.08) 100%)',
          border: '1px solid rgba(14, 165, 233, 0.3)',
          padding: '1.25rem',
        }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Total Operations
          </div>
          <div style={{ fontFamily: 'var(--font-heading)', fontSize: '2rem', fontWeight: 800, color: '#e0e7ff', marginTop: '0.2rem' }}>
            {summary.total_issuances_count}
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 500, marginLeft: '0.4rem' }}>
              ({summary.total_passes_count} passes)
            </span>
          </div>
        </div>
      </div>

      {/* Mode Switcher Tabs: Issue New Pass vs Top-Up Pass */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem' }}>
        <button
          type="button"
          className={`btn ${activeTab === 'issue' ? 'btn-primary' : 'btn-outline'}`}
          onClick={() => switchTab('issue')}
        >
          <Sparkles size={18} />
          Issue New Pass
        </button>
        <button
          type="button"
          className={`btn ${activeTab === 'topup' ? 'btn-primary' : 'btn-outline'}`}
          onClick={() => switchTab('topup')}
        >
          <PlusCircle size={18} />
          Top-Up Existing Pass
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '1.5rem' }}>
        
        {/* TAB 1: ISSUE NEW PASS */}
        {activeTab === 'issue' && (
          <div className="card">
            <div className="card-header">
              <h2 className="card-title">
                <Sparkles size={20} color="var(--primary)" />
                {successResult ? 'Digital Pass Ready' : 'Issue New Token Pass'}
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
                  
                  {successResult.token_pass.attendee_name && (
                    <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '1.05rem', marginTop: '0.25rem' }}>
                      {successResult.token_pass.attendee_name}
                    </div>
                  )}

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
                    Scan with phone camera to load pass
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
                    Print Slip
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => {
                      setSuccessResult(null);
                      setAttendeeName('');
                      setCashAmount('100');
                      setScannedCardPayload(null);
                    }}
                    style={{ flex: 1 }}
                  >
                    <RotateCcw size={18} />
                    Next Attendee
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleIssuePass}>
                {/* Pre-Printed Card / QR Badge Option */}
                <div style={{
                  background: scannedCardPayload ? 'rgba(99, 102, 241, 0.08)' : 'var(--bg-card-elevated)',
                  border: scannedCardPayload ? '1.5px solid var(--primary)' : '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-md)',
                  padding: '1rem',
                  marginBottom: '1.25rem'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <QrCode size={18} color="var(--primary)" />
                      <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                        Physical Card / QR Badge
                      </span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>(Optional)</span>
                    </div>
                    {scannedCardPayload && (
                      <button
                        type="button"
                        onClick={() => setScannedCardPayload(null)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#f43f5e',
                          fontSize: '0.8rem',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.25rem',
                        }}
                      >
                        <X size={14} /> Clear
                      </button>
                    )}
                  </div>

                  {scannedCardPayload ? (
                    <div style={{
                      background: 'rgba(16, 185, 129, 0.12)',
                      border: '1px solid rgba(16, 185, 129, 0.3)',
                      borderRadius: 'var(--radius-sm)',
                      padding: '0.65rem 0.85rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}>
                      <div>
                        <div style={{ fontSize: '0.7rem', color: '#6ee7b7', fontWeight: 600, textTransform: 'uppercase' }}>
                          ✓ Linked Card To New Wallet
                        </div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.95rem', fontWeight: 700, color: '#f8fafc', marginTop: '0.15rem' }}>
                          {parseDisplayPassId(scannedCardPayload)}
                        </div>
                      </div>
                      <CheckCircle size={20} color="#10b981" />
                    </div>
                  ) : (
                    <div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.65rem' }}>
                        Scan pre-printed QR card or wristband to link it, or leave blank to auto-generate a digital pass.
                      </div>

                      {/* Hidden file input for card photo scan */}
                      <input
                        ref={issueFileInputRef}
                        type="file"
                        accept="image/*"
                        capture="environment"
                        style={{ display: 'none' }}
                        onChange={handleIssueFileScan}
                      />

                      <div id={issueQrRegionId} style={{ width: '100%', minHeight: isIssueScanning ? '220px' : '0', overflow: 'hidden', borderRadius: 'var(--radius-sm)', marginBottom: isIssueScanning ? '0.75rem' : '0' }}></div>

                      {!isIssueScanning ? (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                          <button
                            type="button"
                            className="btn btn-outline btn-sm"
                            onClick={() => issueFileInputRef.current?.click()}
                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}
                          >
                            <Smartphone size={15} />
                            Snap Card Photo
                          </button>
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            onClick={startIssueScanner}
                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}
                          >
                            <Camera size={15} />
                            Scan Card Camera
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          onClick={stopIssueScanner}
                          style={{ width: '100%' }}
                        >
                          <CameraOff size={15} />
                          Stop Card Scanner
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Optional Attendee Name */}
                <div className="form-group">
                  <label className="form-label" htmlFor="attendee-name">
                    Attendee Name <span style={{ color: 'var(--text-dim)', fontWeight: 400 }}>(Optional - for fast lookup)</span>
                  </label>
                  <div style={{ position: 'relative' }}>
                    <UserIcon size={18} style={{
                      position: 'absolute',
                      left: '1rem',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      color: 'var(--text-dim)'
                    }} />
                    <input
                      id="attendee-name"
                      type="text"
                      className="input-field"
                      placeholder="e.g. Rahul Sharma, Priya (Class 10)"
                      value={attendeeName}
                      onChange={(e) => setAttendeeName(e.target.value)}
                      style={{ paddingLeft: '2.75rem' }}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="cash-amount">Cash Received (₹)</label>
                  <input
                    id="cash-amount"
                    type="number"
                    min="1"
                    step="any"
                    className="input-field"
                    value={cashAmount}
                    onChange={(e) => setCashAmount(e.target.value)}
                    required
                  />
                </div>

                {/* Quick Denomination Chips */}
                <div style={{ marginBottom: '1.25rem' }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)', marginBottom: '0.5rem', display: 'block' }}>
                    Quick Amount Presets:
                  </span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                    {denominations.map((denom) => (
                      <button
                        key={denom}
                        type="button"
                        className={`chip-btn ${parseFloat(cashAmount) === denom ? 'active' : ''}`}
                        onClick={() => setCashAmount(denom.toString())}
                      >
                        ₹{denom}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Tokens Conversion Output Card */}
                <div style={{
                  background: 'var(--bg-card-elevated)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-md)',
                  padding: '1rem',
                  marginBottom: '1.5rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}>
                  <div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Tokens to Allocate:</div>
                    <div style={{ fontFamily: 'var(--font-heading)', fontSize: '1.75rem', fontWeight: 800, color: 'var(--success)' }}>
                      {calculatedTokens} <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>Tokens</span>
                    </div>
                  </div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-dim)', textAlign: 'right' }}>
                    ₹{cashAmount || '0'} at rate ₹{rate}
                  </div>
                </div>

                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ width: '100%' }}
                  disabled={isSubmitting || calculatedTokens <= 0}
                >
                  {isSubmitting ? 'Issuing Pass...' : `Issue Pass (${calculatedTokens} Tokens)`}
                  {!isSubmitting && <ArrowRight size={18} />}
                </button>
              </form>
            )}
          </div>
        )}

        {/* TAB 2: TOP-UP EXISTING PASS */}
        {activeTab === 'topup' && (
          <div className="card">
            <div className="card-header">
              <h2 className="card-title">
                <PlusCircle size={20} color="var(--primary)" />
                Top-Up Attendee Credits
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

            {topupSuccessMsg && (
              <div style={{
                background: 'rgba(16, 185, 129, 0.15)',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                borderRadius: 'var(--radius-md)',
                padding: '0.85rem',
                color: '#6ee7b7',
                fontSize: '0.875rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                marginBottom: '1rem',
              }}>
                <CheckCircle size={18} />
                <span>{topupSuccessMsg}</span>
              </div>
            )}

            {/* Step 1: Scan Attendee Code or Search */}
            <div style={{ marginBottom: '1.25rem' }}>
              <label className="form-label">Scan Attendee QR or Search by Name / Pass ID</label>

              {/* Hidden file input for photo QR scan */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                style={{ display: 'none' }}
                onChange={handleFileScan}
              />

              {/* Camera Scanner View Area */}
              <div style={{
                background: 'var(--bg-card-elevated)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-md)',
                overflow: 'hidden',
                marginBottom: '0.75rem',
              }}>
                <div id={cashierQrRegionId} style={{ width: '100%', minHeight: isScanning ? '240px' : '0' }}></div>
                
                {!isScanning ? (
                  <div style={{ padding: '1rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      onClick={() => fileInputRef.current?.click()}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}
                    >
                      <Smartphone size={16} />
                      Snap QR Photo
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={startScanner}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}
                    >
                      <Camera size={16} />
                      Open Camera
                    </button>
                  </div>
                ) : (
                  <div style={{ padding: '0.5rem' }}>
                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      onClick={stopScanner}
                      style={{ width: '100%' }}
                    >
                      <CameraOff size={16} />
                      Stop Scanner
                    </button>
                  </div>
                )}
              </div>

              {/* Fallback Text Search Input */}
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <div style={{ position: 'relative', flex: 1 }}>
                  <Search size={18} style={{
                    position: 'absolute',
                    left: '1rem',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: 'var(--text-dim)'
                  }} />
                  <input
                    type="text"
                    className="input-field"
                    placeholder="Search Attendee Name or PASS-XXXXXXXX"
                    value={lookupQuery}
                    onChange={(e) => setLookupQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleLookupPass();
                      }
                    }}
                    style={{ paddingLeft: '2.75rem' }}
                  />
                </div>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => handleLookupPass()}
                  disabled={isLookingUp || !lookupQuery.trim()}
                >
                  {isLookingUp ? 'Searching...' : 'Find Pass'}
                </button>
              </div>
            </div>

            {/* Multiple Search Results Picker */}
            {searchResults.length > 0 && (
              <div style={{ marginBottom: '1.25rem', background: 'var(--bg-card-elevated)', borderRadius: 'var(--radius-md)', padding: '0.75rem' }}>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)', marginBottom: '0.5rem' }}>
                  Select the intended attendee:
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {searchResults.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className="btn btn-outline btn-sm"
                      style={{ display: 'flex', justifyContent: 'space-between', textAlign: 'left' }}
                      onClick={() => handleLookupPass(p.public_pass_id)}
                    >
                      <span><strong>{p.attendee_name || 'Anonymous'}</strong> ({p.public_pass_id})</span>
                      <span className="badge badge-success">{p.remaining_value} Tokens</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Step 2: Found Attendee Card & Top-Up Action */}
            {lookedUpPass && (
              <div style={{
                background: 'var(--bg-card-elevated)',
                border: '1px solid rgba(99, 102, 241, 0.4)',
                borderRadius: 'var(--radius-lg)',
                padding: '1.25rem',
                marginBottom: '1.5rem',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                  <div>
                    <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#ffffff' }}>
                      {lookedUpPass.token_pass.attendee_name || 'Attendee Pass'}
                    </div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: '#a5b4fc' }}>
                      {lookedUpPass.token_pass.public_pass_id}
                    </div>
                  </div>
                  <span className={`badge ${lookedUpPass.token_pass.status === 'active' ? 'badge-success' : 'badge-danger'}`}>
                    {lookedUpPass.token_pass.status}
                  </span>
                </div>

                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '0.75rem',
                  padding: '0.75rem',
                  background: 'rgba(0, 0, 0, 0.25)',
                  borderRadius: 'var(--radius-md)',
                  marginBottom: '1rem',
                  textAlign: 'center',
                }}>
                  <div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>Current Balance</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--success)' }}>
                      {lookedUpPass.token_pass.remaining_value}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>Total Issued So Far</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-muted)' }}>
                      {lookedUpPass.token_pass.issued_value}
                    </div>
                  </div>
                </div>

                <form onSubmit={handleTopupPass}>
                  <div className="form-group">
                    <label className="form-label">Top-Up Cash Amount (₹)</label>
                    <input
                      type="number"
                      min="1"
                      step="any"
                      className="input-field"
                      value={topupAmount}
                      onChange={(e) => setTopupAmount(e.target.value)}
                      required
                    />
                  </div>

                  {/* Preset chips for top-up */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
                    {denominations.map((denom) => (
                      <button
                        key={denom}
                        type="button"
                        className={`chip-btn ${parseFloat(topupAmount) === denom ? 'active' : ''}`}
                        onClick={() => setTopupAmount(denom.toString())}
                      >
                        +₹{denom}
                      </button>
                    ))}
                  </div>

                  <button
                    type="submit"
                    className="btn btn-primary"
                    style={{ width: '100%' }}
                    disabled={isToppingUp || calculatedTopupTokens <= 0}
                  >
                    {isToppingUp ? 'Adding Credits...' : `Add +${calculatedTopupTokens} Tokens (New Balance: ${lookedUpPass.token_pass.remaining_value + calculatedTopupTokens})`}
                  </button>
                </form>
              </div>
            )}
          </div>
        )}

        {/* RECENT COUNTER ISSUANCES & AUDIT LIST */}
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">
              <Receipt size={20} color="var(--primary)" />
              Recent Counter Transactions
            </h2>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() => { fetchHistory(); fetchSummary(); }}
              title="Refresh transaction history"
            >
              <RotateCcw size={14} />
            </button>
          </div>

          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Ref</th>
                  <th>Pass ID</th>
                  <th>Type</th>
                  <th>Cash</th>
                  <th>Tokens</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {recentIssuances.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-dim)', padding: '2rem' }}>
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
                      <td>
                        {iss.is_topup ? (
                          <span className="badge badge-info" style={{ fontSize: '0.7rem' }}>Top-Up</span>
                        ) : (
                          <span className="badge badge-neutral" style={{ fontSize: '0.7rem' }}>New</span>
                        )}
                      </td>
                      <td>₹{iss.cash_received}</td>
                      <td style={{ fontWeight: 700, color: 'var(--success)' }}>
                        +{iss.token_value_issued}
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
