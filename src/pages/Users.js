import { useEffect, useState } from 'react';
import {
  createUserRequest,
  deleteUserRequest,
  fetchUserDetailsRequest,
  fetchUsersRequest,
  getStoredAuthToken,
  resetUserPasswordRequest,
  updateUserRequest,
} from '../services/auth';

const emptyCreateForm = {
  name: '',
  email: '',
  password: '',
  role: 'agent',
  agentId: '',
  isActive: true,
};

const emptyPasswordForm = {
  password: '',
};

function Users({ currentUserRole = 'admin', currentUserId = '' }) {
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState(emptyCreateForm);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [detailUser, setDetailUser] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [passwordForm, setPasswordForm] = useState(emptyPasswordForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [deletingId, setDeletingId] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (currentUserRole !== 'admin') {
      setLoading(false);
      return;
    }

    loadUsers();
  }, [currentUserRole]);

  const loadUsers = async () => {
    try {
      const token = getStoredAuthToken();
      const payload = await fetchUsersRequest(token);
      setUsers(Array.isArray(payload?.users) ? payload.users : []);
      setError('');
    } catch (loadError) {
      setError(loadError.message || 'Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateChange = (field) => (event) => {
    const value = field === 'isActive' ? event.target.checked : event.target.value;

    setForm((prev) => ({
      ...prev,
      [field]: value,
      ...(field === 'role' && event.target.value === 'admin' ? { agentId: '' } : {}),
    }));
  };

  const handleEditChange = (field) => (event) => {
    const value = field === 'isActive' ? event.target.checked : event.target.value;

    setEditForm((prev) => ({
      ...prev,
      [field]: value,
      ...(field === 'role' && event.target.value === 'admin' ? { agentId: '' } : {}),
    }));
  };

  const handleCreateSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');

    try {
      const token = getStoredAuthToken();
      const payload = await createUserRequest(token, {
        ...form,
        agentId: form.role === 'agent' ? form.agentId.trim() : null,
      });

      if (payload?.user) {
        setUsers((prev) => [payload.user, ...prev]);
      }

      setForm(emptyCreateForm);
      setSuccess('User created successfully');
    } catch (saveError) {
      setError(saveError.message || 'Failed to create user');
    } finally {
      setSaving(false);
    }
  };

  const openUserDetails = async (userId) => {
    if (!userId || selectedUserId === userId) {
      setSelectedUserId('');
      setDetailUser(null);
      setEditForm(null);
      setPasswordForm(emptyPasswordForm);
      return;
    }

    setDetailLoading(true);
    setError('');
    setSuccess('');

    try {
      const token = getStoredAuthToken();
      const payload = await fetchUserDetailsRequest(token, userId);
      setSelectedUserId(userId);
      setDetailUser(payload?.user || null);
      setEditForm(payload?.user ? toEditForm(payload.user) : null);
      setPasswordForm(emptyPasswordForm);
    } catch (detailError) {
      setError(detailError.message || 'Failed to load user details');
    } finally {
      setDetailLoading(false);
    }
  };

  const handleUpdateUser = async (event) => {
    event.preventDefault();
    if (!selectedUserId || !editForm) return;

    setEditing(true);
    setError('');
    setSuccess('');

    try {
      const token = getStoredAuthToken();
      const payload = await updateUserRequest(token, selectedUserId, {
        ...editForm,
        agentId: editForm.role === 'agent' ? editForm.agentId.trim() : null,
      });

      if (payload?.user) {
        setDetailUser(payload.user);
        setEditForm(toEditForm(payload.user));
        setUsers((prev) => prev.map((user) => (
          user.id === payload.user.id ? payload.user : user
        )));
      }

      setSuccess('User updated successfully');
    } catch (updateError) {
      setError(updateError.message || 'Failed to update user');
    } finally {
      setEditing(false);
    }
  };

  const handleToggleActive = async () => {
    if (!selectedUserId || !detailUser) return;

    setEditing(true);
    setError('');
    setSuccess('');

    try {
      const token = getStoredAuthToken();
      const payload = await updateUserRequest(token, selectedUserId, {
        ...detailUser,
        isActive: !detailUser.isActive,
      });

      if (payload?.user) {
        setDetailUser(payload.user);
        setEditForm(toEditForm(payload.user));
        setUsers((prev) => prev.map((user) => (
          user.id === payload.user.id ? payload.user : user
        )));
      }

      setSuccess(payload?.user?.isActive ? 'User activated' : 'User deactivated');
    } catch (toggleError) {
      setError(toggleError.message || 'Failed to update active status');
    } finally {
      setEditing(false);
    }
  };

  const handlePasswordChange = (event) => {
    setPasswordForm({ password: event.target.value });
  };

  const handleResetPassword = async (event) => {
    event.preventDefault();
    if (!selectedUserId) return;

    setPasswordSaving(true);
    setError('');
    setSuccess('');

    try {
      const token = getStoredAuthToken();
      await resetUserPasswordRequest(token, selectedUserId, passwordForm.password);
      setPasswordForm(emptyPasswordForm);
      setSuccess('Password reset successfully');
    } catch (resetError) {
      setError(resetError.message || 'Failed to reset password');
    } finally {
      setPasswordSaving(false);
    }
  };

  const handleDeleteUser = async (userId) => {
    if (!userId) return;
    if (userId === currentUserId) {
      setError('You cannot delete your own account');
      return;
    }

    const confirmed = window.confirm('Delete this user permanently?');
    if (!confirmed) return;

    setDeletingId(userId);
    setError('');
    setSuccess('');

    try {
      const token = getStoredAuthToken();
      await deleteUserRequest(token, userId);
      setUsers((prev) => prev.filter((user) => user.id !== userId));

      if (selectedUserId === userId) {
        setSelectedUserId('');
        setDetailUser(null);
        setEditForm(null);
        setPasswordForm(emptyPasswordForm);
      }

      setSuccess('User deleted successfully');
    } catch (deleteError) {
      setError(deleteError.message || 'Failed to delete user');
    } finally {
      setDeletingId('');
    }
  };

  if (currentUserRole !== 'admin') {
    return (
      <div style={{ display: 'grid', gap: '24px' }}>
        <div>
          <h1 className="page-title">Users</h1>
          <div className="page-subtitle">
            You do not have access to manage users.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gap: '24px' }}>
      <div>
        <h1 className="page-title">Users</h1>
        <div className="page-subtitle">
          Manage teammates, roles, and access across your VoIP workspace.
        </div>
      </div>

      <div className="section-card" style={{ display: 'grid', gap: '16px' }}>
        <div className="section-header">
          <h3 style={{ margin: 0 }}>Create User</h3>
          <span className="tag">Admin only</span>
        </div>

        <form onSubmit={handleCreateSubmit} style={formStyle}>
          <input className="numbers-input" placeholder="Full name" value={form.name} onChange={handleCreateChange('name')} required />
          <input className="numbers-input" type="email" placeholder="Email" value={form.email} onChange={handleCreateChange('email')} required />
          <input className="numbers-input" type="password" placeholder="Password" value={form.password} onChange={handleCreateChange('password')} required />
          <select className="numbers-input" value={form.role} onChange={handleCreateChange('role')}>
            <option value="agent">Agent</option>
            <option value="admin">Admin</option>
          </select>
          <input
            className="numbers-input"
            placeholder="Agent ID"
            value={form.agentId}
            onChange={handleCreateChange('agentId')}
            disabled={form.role !== 'agent'}
            required={form.role === 'agent'}
          />
          <label style={checkboxStyle}>
            <input type="checkbox" checked={form.isActive} onChange={handleCreateChange('isActive')} />
            <span>Active user</span>
          </label>
          <button className="numbers-primary-btn" type="submit" disabled={saving}>
            {saving ? 'Creating...' : 'Create User'}
          </button>
        </form>

        {error ? <div className="text-muted" style={errorStyle}>{error}</div> : null}
        {success ? <div className="text-muted" style={successStyle}>{success}</div> : null}
      </div>

      <div className="section-card" style={{ display: 'grid', gap: '16px' }}>
        <div className="section-header">
          <h3 style={{ margin: 0 }}>Workspace Users</h3>
          <span className="tag">{loading ? 'Loading' : `${users.length} users`}</span>
        </div>

        {loading ? (
          <div className="text-muted">Loading users...</div>
        ) : users.length === 0 ? (
          <div className="text-muted">No users found.</div>
        ) : (
          <div className="user-grid">
            {users.map((user) => (
              <div key={user.id} className="user-card" style={selectedUserId === user.id ? activeCardStyle : undefined}>
                <div className="avatar-stack">
                  <div className="avatar-circle">
                    {String(user.name || '?')
                      .split(' ')
                      .filter(Boolean)
                      .map((part) => part[0])
                      .join('')
                      .slice(0, 2)}
                  </div>
                  <div>
                    <h4>{user.name}</h4>
                    <div className="user-role">{user.role}</div>
                  </div>
                </div>
                <div className="text-muted">{user.email}</div>
                <div className="text-muted">Agent ID: {user.agentId || 'None'}</div>
                <span className="tag">{user.isActive ? 'Active' : 'Inactive'}</span>

                <div style={actionsStyle}>
                  <button type="button" style={secondaryButtonStyle} onClick={() => openUserDetails(user.id)}>
                    {selectedUserId === user.id ? 'Hide details' : 'View details'}
                  </button>
                  <button
                    type="button"
                    style={dangerButtonStyle}
                    onClick={() => handleDeleteUser(user.id)}
                    disabled={deletingId === user.id || user.id === currentUserId}
                  >
                    {deletingId === user.id ? 'Deleting...' : 'Delete'}
                  </button>
                </div>

                {selectedUserId === user.id ? (
                  <div style={detailPanelStyle}>
                    {detailLoading || !detailUser || !editForm ? (
                      <div className="text-muted">Loading details...</div>
                    ) : (
                      <>
                        <div style={detailSectionStyle}>
                          <div className="section-header">
                            <h3 style={{ margin: 0 }}>User Details</h3>
                            <span className="tag">{detailUser.isActive ? 'Active' : 'Inactive'}</span>
                          </div>
                          <div className="text-muted">Created: {formatDate(detailUser.createdAt)}</div>
                          <div className="text-muted">Updated: {formatDate(detailUser.updatedAt)}</div>
                        </div>

                        <form onSubmit={handleUpdateUser} style={detailFormStyle}>
                          <input className="numbers-input" placeholder="Full name" value={editForm.name} onChange={handleEditChange('name')} required />
                          <input className="numbers-input" type="email" placeholder="Email" value={editForm.email} onChange={handleEditChange('email')} required />
                          <select className="numbers-input" value={editForm.role} onChange={handleEditChange('role')}>
                            <option value="agent">Agent</option>
                            <option value="admin">Admin</option>
                          </select>
                          <input
                            className="numbers-input"
                            placeholder="Agent ID"
                            value={editForm.agentId}
                            onChange={handleEditChange('agentId')}
                            disabled={editForm.role !== 'agent'}
                            required={editForm.role === 'agent'}
                          />
                          <label style={checkboxStyle}>
                            <input type="checkbox" checked={editForm.isActive} onChange={handleEditChange('isActive')} />
                            <span>Active user</span>
                          </label>
                          <div style={actionsStyle}>
                            <button className="numbers-primary-btn" type="submit" disabled={editing}>
                              {editing ? 'Saving...' : 'Save changes'}
                            </button>
                            <button
                              type="button"
                              style={secondaryButtonStyle}
                              onClick={handleToggleActive}
                              disabled={editing}
                            >
                              {detailUser.isActive ? 'Deactivate' : 'Activate'}
                            </button>
                          </div>
                        </form>

                        <form onSubmit={handleResetPassword} style={detailFormStyle}>
                          <div className="section-header">
                            <h3 style={{ margin: 0 }}>Reset Password</h3>
                            <span className="tag">Set new password</span>
                          </div>
                          <input
                            className="numbers-input"
                            type="password"
                            placeholder="New password"
                            value={passwordForm.password}
                            onChange={handlePasswordChange}
                            required
                          />
                          <button className="numbers-primary-btn" type="submit" disabled={passwordSaving}>
                            {passwordSaving ? 'Resetting...' : 'Reset password'}
                          </button>
                        </form>
                      </>
                    )}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function toEditForm(user) {
  return {
    name: user.name || '',
    email: user.email || '',
    role: user.role || 'agent',
    agentId: user.agentId || '',
    isActive: user.isActive !== false,
  };
}

function formatDate(value) {
  if (!value) return 'Unknown';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  return date.toLocaleString();
}

const formStyle = {
  display: 'grid',
  gap: '12px',
  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
};

const detailFormStyle = {
  display: 'grid',
  gap: '12px',
};

const detailPanelStyle = {
  marginTop: '16px',
  paddingTop: '16px',
  borderTop: '1px solid rgba(148, 163, 184, 0.2)',
  display: 'grid',
  gap: '16px',
};

const detailSectionStyle = {
  display: 'grid',
  gap: '6px',
};

const actionsStyle = {
  display: 'flex',
  gap: '10px',
  flexWrap: 'wrap',
};

const checkboxStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  fontSize: '14px',
  color: '#475569',
};

const secondaryButtonStyle = {
  border: '1px solid rgba(15, 23, 42, 0.12)',
  background: '#fff',
  color: '#0f172a',
  borderRadius: '10px',
  padding: '10px 14px',
  cursor: 'pointer',
  fontWeight: 600,
};

const dangerButtonStyle = {
  ...secondaryButtonStyle,
  borderColor: 'rgba(185, 28, 28, 0.18)',
  color: '#b91c1c',
};

const activeCardStyle = {
  border: '1px solid rgba(37, 99, 235, 0.25)',
  boxShadow: '0 10px 24px rgba(37, 99, 235, 0.08)',
};

const errorStyle = {
  color: '#b91c1c',
};

const successStyle = {
  color: '#047857',
};

export default Users;
