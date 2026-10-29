import React, { useState, useEffect } from 'react';
import { apiRequest } from '../api';
import { useAuth } from '../context/AuthContext';
import { 
  Users, 
  Store, 
  PlusCircle, 
  Key, 
  RefreshCw,
  AlertCircle
} from 'lucide-react';

interface Stall {
  id: number;
  stall_code: string;
  name: string;
  is_active: boolean;
  operators?: string[];
}

interface StaffUser {
  id: number;
  username: string;
  role: string;
  stall_id: number | null;
  stall_name: string | null;
  stall_code: string | null;
  is_active: boolean;
  last_login_at: string | null;
}

export const StallsStaffPage: React.FC = () => {
  const { user: currentUser } = useAuth();
  const [stalls, setStalls] = useState<Stall[]>([]);
  const [users, setUsers] = useState<StaffUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // New Stall Modal
  const [showStallModal, setShowStallModal] = useState(false);
  const [newStallCode, setNewStallCode] = useState('');
  const [newStallName, setNewStallName] = useState('');

  // New User Modal
  const [showUserModal, setShowUserModal] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState('stall_operator');
  const [newUserStallId, setNewUserStallId] = useState<number | ''>('');

  // Reset Password Modal
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetTargetUser, setResetTargetUser] = useState<StaffUser | null>(null);
  const [resetPasswordVal, setResetPasswordVal] = useState('');

  const fetchData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const stallData = await apiRequest<{ stalls: Stall[] }>('/admin/stalls');
      setStalls(stallData.stalls);

      const userData = await apiRequest<{ users: StaffUser[] }>('/admin/users');
      setUsers(userData.users);
    } catch (err: any) {
      setError(err.error || 'Failed to fetch stalls and staff.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleCreateStall = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStallCode.trim() || !newStallName.trim()) return;

    try {
      await apiRequest('/admin/stalls', {
        method: 'POST',
        body: JSON.stringify({
          stall_code: newStallCode.trim().toUpperCase(),
          name: newStallName.trim(),
        }),
      });
      setShowStallModal(false);
      setNewStallCode('');
      setNewStallName('');
      fetchData();
      alert('Stall created successfully.');
    } catch (err: any) {
      alert(`Error: ${err.error}`);
    }
  };

  const handleToggleStall = async (stall: Stall) => {
    try {
      await apiRequest(`/admin/stalls/${stall.id}`, {
        method: 'PUT',
        body: JSON.stringify({ is_active: !stall.is_active }),
      });
      fetchData();
    } catch (err: any) {
      alert(`Error updating stall: ${err.error}`);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername.trim() || !newPassword) return;

    try {
      await apiRequest('/admin/users', {
        method: 'POST',
        body: JSON.stringify({
          username: newUsername.trim(),
          password: newPassword,
          role: newRole,
          stall_id: newRole === 'stall_operator' && newUserStallId ? newUserStallId : null,
        }),
      });
      setShowUserModal(false);
      setNewUsername('');
      setNewPassword('');
      fetchData();
      alert('Staff user created successfully.');
    } catch (err: any) {
      alert(`Error creating user: ${err.error}`);
    }
  };

  const handleToggleUser = async (u: StaffUser) => {
    if (u.id === currentUser?.id) {
      alert('You cannot deactivate your own account.');
      return;
    }
    try {
      await apiRequest(`/admin/users/${u.id}`, {
        method: 'PUT',
        body: JSON.stringify({ is_active: !u.is_active }),
      });
      fetchData();
    } catch (err: any) {
      alert(`Error: ${err.error}`);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetTargetUser || resetPasswordVal.length < 6) {
      alert('Password must be at least 6 characters.');
      return;
    }

    try {
      await apiRequest(`/admin/users/${resetTargetUser.id}`, {
        method: 'PUT',
        body: JSON.stringify({ password: resetPasswordVal }),
      });
      setShowResetModal(false);
      setResetTargetUser(null);
      setResetPasswordVal('');
      alert('Password reset successfully.');
    } catch (err: any) {
      alert(`Error resetting password: ${err.error}`);
    }
  };

  return (
    <div className="page-container">
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '1rem',
        marginBottom: '1.75rem',
      }}>
        <div>
          <h1 style={{ fontSize: '1.85rem', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <Users className="text-primary" size={28} />
            Stalls & Staff Operations
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem' }}>
            Configure participating stalls, create staff accounts, and manage operator assignments.
          </p>
        </div>

        <button
          type="button"
          className="btn btn-outline btn-sm"
          onClick={fetchData}
          disabled={isLoading}
        >
          <RefreshCw size={16} />
          Refresh
        </button>
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
          marginBottom: '1.25rem',
        }}>
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      {/* Grid: Stalls List on Left, Users List on Right */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '1.5rem' }}>

        {/* 1. Stalls Section */}
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">
              <Store size={20} />
              Participating Stalls ({stalls.length})
            </h2>
            {currentUser?.role === 'admin' && (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => setShowStallModal(true)}
              >
                <PlusCircle size={16} />
                Add Stall
              </button>
            )}
          </div>

          <div className="table-responsive" style={{ maxHeight: '480px', overflowY: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Stall Name</th>
                  <th>Operators</th>
                  <th>Status</th>
                  {currentUser?.role === 'admin' && <th>Action</th>}
                </tr>
              </thead>
              <tbody>
                {stalls.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-dim)' }}>
                      No stalls created yet.
                    </td>
                  </tr>
                ) : (
                  stalls.map((s) => (
                    <tr key={s.id}>
                      <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                        {s.stall_code}
                      </td>
                      <td style={{ fontWeight: 600 }}>
                        {s.name}
                      </td>
                      <td style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                        {s.operators && s.operators.length > 0 ? s.operators.join(', ') : 'None'}
                      </td>
                      <td>
                        <span className={`badge ${s.is_active ? 'badge-success' : 'badge-neutral'}`}>
                          {s.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      {currentUser?.role === 'admin' && (
                        <td>
                          <button
                            className="btn btn-outline btn-sm"
                            style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                            onClick={() => handleToggleStall(s)}
                          >
                            {s.is_active ? 'Deactivate' : 'Activate'}
                          </button>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* 2. Staff Accounts Section */}
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">
              <Users size={20} />
              Staff Accounts ({users.length})
            </h2>
            {currentUser?.role === 'admin' && (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => setShowUserModal(true)}
              >
                <PlusCircle size={16} />
                Add Staff
              </button>
            )}
          </div>

          <div className="table-responsive" style={{ maxHeight: '480px', overflowY: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>User</th>
                  <th>Role</th>
                  <th>Assigned Stall</th>
                  <th>Status</th>
                  {currentUser?.role === 'admin' && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {users.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-dim)' }}>
                      No staff users found.
                    </td>
                  </tr>
                ) : (
                  users.map((u) => (
                    <tr key={u.id}>
                      <td style={{ fontWeight: 600 }}>
                        {u.username}
                      </td>
                      <td>
                        <span className={`role-pill ${u.role}`}>
                          {u.role.replace('_', ' ')}
                        </span>
                      </td>
                      <td style={{ fontSize: '0.85rem' }}>
                        {u.stall_name ? `${u.stall_name} (${u.stall_code})` : '—'}
                      </td>
                      <td>
                        <span className={`badge ${u.is_active ? 'badge-success' : 'badge-danger'}`}>
                          {u.is_active ? 'Active' : 'Deactivated'}
                        </span>
                      </td>
                      {currentUser?.role === 'admin' && (
                        <td style={{ whiteSpace: 'nowrap' }}>
                          <button
                            className="btn btn-outline btn-sm"
                            title="Reset Password"
                            style={{ padding: '0.25rem 0.45rem', marginRight: '0.35rem' }}
                            onClick={() => {
                              setResetTargetUser(u);
                              setShowResetModal(true);
                            }}
                          >
                            <Key size={14} />
                          </button>
                          {u.id !== currentUser?.id && (
                            <button
                              className="btn btn-outline btn-sm"
                              style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                              onClick={() => handleToggleUser(u)}
                            >
                              {u.is_active ? 'Deactivate' : 'Activate'}
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>

      {/* Modal: Create Stall */}
      {showStallModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3 style={{ fontSize: '1.25rem', marginBottom: '1rem' }}>Create New Stall</h3>
            <form onSubmit={handleCreateStall}>
              <div className="form-group">
                <label className="form-label">Stall Code (Unique ID)</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="e.g. STALL-06 or FOOD-A"
                  value={newStallCode}
                  onChange={(e) => setNewStallCode(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Stall Name</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="e.g. Samosa & Mocktails Hub"
                  value={newStallName}
                  onChange={(e) => setNewStallName(e.target.value)}
                  required
                />
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem' }}>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setShowStallModal(false)}
                  style={{ flex: 1 }}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>
                  Create Stall
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Create User */}
      {showUserModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3 style={{ fontSize: '1.25rem', marginBottom: '1rem' }}>Create Staff User</h3>
            <form onSubmit={handleCreateUser}>
              <div className="form-group">
                <label className="form-label">Username</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="e.g. cashier2 or op_stall_06"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Password</label>
                <input
                  type="password"
                  className="input-field"
                  placeholder="Minimum 6 characters"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Role</label>
                <select
                  className="input-field"
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value)}
                >
                  <option value="stall_operator">Stall Operator</option>
                  <option value="cashier">Cashier</option>
                  <option value="auditor">Auditor (Read-Only)</option>
                  <option value="admin">Administrator</option>
                </select>
              </div>

              {newRole === 'stall_operator' && (
                <div className="form-group">
                  <label className="form-label">Assigned Stall</label>
                  <select
                    className="input-field"
                    value={newUserStallId}
                    onChange={(e) => setNewUserStallId(e.target.value ? Number(e.target.value) : '')}
                    required
                  >
                    <option value="">Select assigned stall...</option>
                    {stalls.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.stall_code} — {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem' }}>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setShowUserModal(false)}
                  style={{ flex: 1 }}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>
                  Create Account
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Reset Password */}
      {showResetModal && resetTargetUser && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3 style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>
              Reset Password for {resetTargetUser.username}
            </h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1.25rem' }}>
              Assign a new temporary password for this staff member.
            </p>

            <form onSubmit={handleResetPassword}>
              <div className="form-group">
                <label className="form-label">New Password</label>
                <input
                  type="password"
                  className="input-field"
                  placeholder="Minimum 6 characters"
                  value={resetPasswordVal}
                  onChange={(e) => setResetPasswordVal(e.target.value)}
                  required
                />
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem' }}>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => {
                    setShowResetModal(false);
                    setResetTargetUser(null);
                  }}
                  style={{ flex: 1 }}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>
                  Save Password
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
