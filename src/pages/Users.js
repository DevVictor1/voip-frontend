import { useEffect, useState } from 'react';
import { createUserRequest, fetchUsersRequest, getStoredAuthToken } from '../services/auth';

const emptyForm = {
  name: '',
  email: '',
  password: '',
  role: 'agent',
  agentId: '',
  isActive: true,
};

function Users({ currentUserRole = 'admin' }) {
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (currentUserRole !== 'admin') {
      setLoading(false);
      return;
    }

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

    loadUsers();
  }, [currentUserRole]);

  const handleChange = (field) => (event) => {
    const value = field === 'isActive'
      ? event.target.checked
      : event.target.value;

    setForm((prev) => ({
      ...prev,
      [field]: value,
      ...(field === 'role' && event.target.value === 'admin' ? { agentId: '' } : {}),
    }));
  };

  const handleSubmit = async (event) => {
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

      setForm(emptyForm);
      setSuccess('User created successfully');
    } catch (saveError) {
      setError(saveError.message || 'Failed to create user');
    } finally {
      setSaving(false);
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

        <form onSubmit={handleSubmit} style={formStyle}>
          <input
            className="numbers-input"
            placeholder="Full name"
            value={form.name}
            onChange={handleChange('name')}
            required
          />
          <input
            className="numbers-input"
            type="email"
            placeholder="Email"
            value={form.email}
            onChange={handleChange('email')}
            required
          />
          <input
            className="numbers-input"
            type="password"
            placeholder="Password"
            value={form.password}
            onChange={handleChange('password')}
            required
          />
          <select
            className="numbers-input"
            value={form.role}
            onChange={handleChange('role')}
          >
            <option value="agent">Agent</option>
            <option value="admin">Admin</option>
          </select>
          <input
            className="numbers-input"
            placeholder="Agent ID"
            value={form.agentId}
            onChange={handleChange('agentId')}
            disabled={form.role !== 'agent'}
            required={form.role === 'agent'}
          />
          <label style={checkboxStyle}>
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={handleChange('isActive')}
            />
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
              <div key={user.id} className="user-card">
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
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const formStyle = {
  display: 'grid',
  gap: '12px',
  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
};

const checkboxStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  fontSize: '14px',
  color: '#475569',
};

const errorStyle = {
  color: '#b91c1c',
};

const successStyle = {
  color: '#047857',
};

export default Users;
