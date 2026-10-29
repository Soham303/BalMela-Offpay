import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Navbar } from './components/Navbar';
import { LoginPage } from './pages/LoginPage';
import { CashCounterPage } from './pages/CashCounterPage';
import { StallCheckoutPage } from './pages/StallCheckoutPage';
import { DashboardPage } from './pages/DashboardPage';
import { StallsStaffPage } from './pages/StallsStaffPage';

const AppContent: React.FC = () => {
  const { user, isLoading } = useAuth();
  const [currentTab, setCurrentTab] = useState<string>('dashboard');

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

  if (!user) {
    return <LoginPage />;
  }

  return (
    <div className="app-container">
      <Navbar currentTab={currentTab} setCurrentTab={setCurrentTab} />
      
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
