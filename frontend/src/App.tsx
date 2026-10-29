import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Navbar } from './components/Navbar';
import { LoginPage } from './pages/LoginPage';
import { CashCounterPage } from './pages/CashCounterPage';
import { StallCheckoutPage } from './pages/StallCheckoutPage';
import { DashboardPage } from './pages/DashboardPage';
import { StallsStaffPage } from './pages/StallsStaffPage';
import { AttendeePassPage } from './pages/AttendeePassPage';

const AppContent: React.FC = () => {
  const { user, isLoading } = useAuth();
  const [currentTab, setCurrentTab] = useState<string>('dashboard');
  const [viewAttendeePass, setViewAttendeePass] = useState<boolean>(() => {
    // Check if the current URL points to /pass or contains pass credentials in hash/search
    return (
      window.location.pathname.startsWith('/pass') ||
      window.location.hash.includes('id=') ||
      window.location.search.includes('id=')
    );
  });

  // Listen to popstate or hash changes
  useEffect(() => {
    const handleLocationCheck = () => {
      if (
        window.location.pathname.startsWith('/pass') ||
        window.location.hash.includes('id=') ||
        window.location.search.includes('id=')
      ) {
        setViewAttendeePass(true);
      }
    };

    window.addEventListener('popstate', handleLocationCheck);
    window.addEventListener('hashchange', handleLocationCheck);
    return () => {
      window.removeEventListener('popstate', handleLocationCheck);
      window.removeEventListener('hashchange', handleLocationCheck);
    };
  }, []);

  // Set default tab based on user's role when logging in
  useEffect(() => {
    if (user) {
      if (user.role === 'cashier') {
        setCurrentTab('counter');
      } else if (user.role === 'stall_operator') {
        setCurrentTab('stall');
      } else {
        setCurrentTab('dashboard');
      }
    }
  }, [user]);

  if (isLoading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--text-muted)',
      }}>
        Loading FestToken...
      </div>
    );
  }

  // If viewing attendee pass wallet (either via URL or button)
  if (viewAttendeePass || currentTab === 'attendee-wallet') {
    return (
      <AttendeePassPage
        onBackToStaffLogin={() => {
          setViewAttendeePass(false);
          setCurrentTab(user ? (user.role === 'cashier' ? 'counter' : user.role === 'stall_operator' ? 'stall' : 'dashboard') : 'dashboard');
          if (window.location.pathname.startsWith('/pass')) {
            window.history.pushState({}, '', '/');
          }
        }}
      />
    );
  }

  if (!user) {
    return <LoginPage onOpenAttendeeWallet={() => setViewAttendeePass(true)} />;
  }

  return (
    <div className="app-container">
      <Navbar
        currentTab={currentTab}
        setCurrentTab={setCurrentTab}
        onOpenAttendeeWallet={() => setCurrentTab('attendee-wallet')}
      />
      
      <main>
        {currentTab === 'dashboard' && <DashboardPage />}
        {currentTab === 'counter' && <CashCounterPage />}
        {currentTab === 'stall' && <StallCheckoutPage />}
        {currentTab === 'stalls-staff' && <StallsStaffPage />}
      </main>
    </div>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

