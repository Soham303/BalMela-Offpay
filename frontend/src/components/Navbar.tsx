import React from 'react';
import { useAuth } from '../context/AuthContext';
import { 
  Coins, 
  Store, 
  LayoutDashboard, 
  Users, 
  LogOut, 
  WifiOff, 
  ShieldCheck, 
  Ticket 
} from 'lucide-react';

interface NavbarProps {
  currentTab: string;
  setCurrentTab: (tab: string) => void;
}

export const Navbar: React.FC<NavbarProps> = ({ currentTab, setCurrentTab }) => {
  const { user, logout, isOffline } = useAuth();

  if (!user) return null;

  return (
    <>
      {isOffline && (
        <div className="network-banner" id="network-offline-banner">
          <WifiOff size={18} />
          <span>
            Server connection lost! Transactions cannot be confirmed. Please check WiFi or tunnel connection.
          </span>
        </div>
      )}

      <header className="main-header">
        <div className="brand-section">
          <div className="brand-logo-icon">
            <Ticket size={22} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span className="brand-name">FestToken</span>
              <span className="brand-tag">Offpay</span>
            </div>
          </div>
        </div>

        <nav className="nav-links">
          {user.role === 'admin' && (
            <>
              <button
                className={`nav-btn ${currentTab === 'dashboard' ? 'active' : ''}`}
                onClick={() => setCurrentTab('dashboard')}
              >
                <LayoutDashboard size={18} />
                <span>Dashboard</span>
              </button>
              <button
                className={`nav-btn ${currentTab === 'counter' ? 'active' : ''}`}
                onClick={() => setCurrentTab('counter')}
              >
                <Coins size={18} />
                <span>Cash Counter</span>
              </button>
              <button
                className={`nav-btn ${currentTab === 'stall' ? 'active' : ''}`}
                onClick={() => setCurrentTab('stall')}
              >
                <Store size={18} />
                <span>Stall Checkout</span>
              </button>
              <button
                className={`nav-btn ${currentTab === 'stalls-staff' ? 'active' : ''}`}
                onClick={() => setCurrentTab('stalls-staff')}
              >
                <Users size={18} />
                <span>Stalls & Staff</span>
              </button>
            </>
          )}

          {user.role === 'auditor' && (
            <>
              <button
                className={`nav-btn ${currentTab === 'dashboard' ? 'active' : ''}`}
                onClick={() => setCurrentTab('dashboard')}
              >
                <LayoutDashboard size={18} />
                <span>Dashboard</span>
              </button>
              <button
                className={`nav-btn ${currentTab === 'stalls-staff' ? 'active' : ''}`}
                onClick={() => setCurrentTab('stalls-staff')}
              >
                <Users size={18} />
                <span>Stalls & Staff</span>
              </button>
            </>
          )}

          {user.role === 'cashier' && (
            <button
              className={`nav-btn ${currentTab === 'counter' ? 'active' : ''}`}
              onClick={() => setCurrentTab('counter')}
            >
              <Coins size={18} />
              <span>Cash Counter</span>
            </button>
          )}

          {user.role === 'stall_operator' && (
            <button
              className={`nav-btn ${currentTab === 'stall' ? 'active' : ''}`}
              onClick={() => setCurrentTab('stall')}
            >
              <Store size={18} />
              <span>Stall Checkout</span>
            </button>
          )}
        </nav>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div className="user-profile-badge">
            <span className={`role-pill ${user.role}`}>
              {user.role.replace('_', ' ')}
            </span>
            <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>
              {user.username}
            </span>
            {user.stall_name && (
              <span className="badge badge-neutral" style={{ fontSize: '0.7rem' }}>
                {user.stall_name} ({user.stall_code})
              </span>
            )}
          </div>

          <button
            className="nav-btn"
            onClick={logout}
            title="Log out"
            style={{ padding: '0.45rem' }}
          >
            <LogOut size={18} />
          </button>
        </div>
      </header>
    </>
  );
};
