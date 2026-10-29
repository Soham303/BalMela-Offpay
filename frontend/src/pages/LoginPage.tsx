import React, { useState } from 'react';
import { useAuth, type User } from '../context/AuthContext';
import { apiRequest } from '../api';
import { Ticket, Lock, User as UserIcon, AlertCircle, ArrowRight, Sparkles } from 'lucide-react';

interface LoginPageProps {
  onOpenAttendeeWallet?: () => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onOpenAttendeeWallet }) => {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError('Please enter both username and password.');
      return;
    }

    setError(null);
    setIsLoading(true);

    try {
      const data = await apiRequest<{ token: string; user: User }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username: username.trim(), password }),
      });
      login(data.token, data.user);
    } catch (err: any) {
      setError(err.error || 'Failed to authenticate. Please verify your credentials.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickFill = (u: string, p: string) => {
    setUsername(u);
    setPassword(p);
    setError(null);
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '1.5rem',
      background: 'radial-gradient(ellipse at top, #1e1b4b 0%, #080b11 70%)'
    }}>
      <div className="card" style={{ maxWidth: '440px', width: '100%', padding: '2.25rem' }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '56px',
            height: '56px',
            borderRadius: '16px',
            background: 'var(--primary-gradient)',
            boxShadow: '0 0 25px var(--primary-glow)',
            color: 'white',
            marginBottom: '1rem'
          }}>
            <Ticket size={30} />
          </div>
          <h1 style={{ fontSize: '1.75rem', marginBottom: '0.4rem' }}>FestToken</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            Local-Hosted QR Token & Stall Settlement Portal
          </p>
        </div>

        {error && (
          <div style={{
            background: 'rgba(244, 63, 94, 0.15)',
            border: '1px solid rgba(244, 63, 94, 0.35)',
            borderRadius: 'var(--radius-md)',
            padding: '0.85rem 1rem',
            marginBottom: '1.5rem',
            color: '#fda4af',
            fontSize: '0.875rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.6rem'
          }}>
            <AlertCircle size={18} style={{ flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="login-username">Staff Username</label>
            <div style={{ position: 'relative' }}>
              <UserIcon size={18} style={{
                position: 'absolute',
                left: '1rem',
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-dim)'
              }} />
              <input
                id="login-username"
                type="text"
                className="input-field"
                placeholder="e.g. admin, cashier1, op_stall_01"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                style={{ paddingLeft: '2.75rem' }}
                autoComplete="username"
                required
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="login-password">Password</label>
            <div style={{ position: 'relative' }}>
              <Lock size={18} style={{
                position: 'absolute',
                left: '1rem',
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-dim)'
              }} />
              <input
                id="login-password"
                type="password"
                className="input-field"
                placeholder="Enter password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{ paddingLeft: '2.75rem' }}
                autoComplete="current-password"
                required
              />
            </div>
          </div>

          <button
            id="login-submit-btn"
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%', marginTop: '0.75rem' }}
            disabled={isLoading}
          >
            {isLoading ? 'Verifying...' : 'Sign In to Portal'}
            {!isLoading && <ArrowRight size={18} />}
          </button>
        </form>

        {onOpenAttendeeWallet && (
          <div style={{
            marginTop: '1.5rem',
            padding: '1rem',
            background: 'rgba(99, 102, 241, 0.08)',
            border: '1px solid rgba(99, 102, 241, 0.25)',
            borderRadius: 'var(--radius-md)',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '0.825rem', color: '#c7d2fe', marginBottom: '0.5rem', fontWeight: 500 }}>
              Visiting the Festival?
            </div>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              style={{ width: '100%', borderColor: '#6366f1', color: '#e0e7ff', display: 'flex', justifyContent: 'center', gap: '0.5rem' }}
              onClick={onOpenAttendeeWallet}
            >
              <Sparkles size={16} />
              Open My Token Pass / Wallet
            </button>
          </div>
        )}

        <div style={{ marginTop: '2rem', paddingTop: '1.5rem', borderTop: '1px solid var(--border-subtle)' }}>
          <div style={{
            fontSize: '0.75rem',
            color: 'var(--text-dim)',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            marginBottom: '0.75rem',
            textAlign: 'center'
          }}>
            Quick Staff Sign-In (Event Demo)
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
            <button
              type="button"
              className="chip-btn"
              onClick={() => handleQuickFill('admin', 'admin123')}
              style={{ textAlign: 'center', fontSize: '0.8rem' }}
            >
              Admin
            </button>
            <button
              type="button"
              className="chip-btn"
              onClick={() => handleQuickFill('cashier1', 'cashier123')}
              style={{ textAlign: 'center', fontSize: '0.8rem' }}
            >
              Cashier
            </button>
            <button
              type="button"
              className="chip-btn"
              onClick={() => handleQuickFill('op_stall_01', 'operator123')}
              style={{ textAlign: 'center', fontSize: '0.8rem' }}
            >
              Stall 01
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
