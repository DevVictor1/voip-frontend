import { useEffect, useMemo, useState } from 'react';
import {
  DEPARTMENT_OPTIONS,
  getDepartmentLabel,
} from '../config/agents';
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
  department: '',
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
  const toastType = error ? 'error' : success ? 'success' : '';
  const toastMessage = error || success;
  const generatedCreateAgentId = buildAgentIdPreview(form);
  const isEditingExistingAgentId = Boolean(detailUser?.agentId);
  const directoryStats = useMemo(() => buildDirectoryStats(users), [users]);
  const departmentGroups = useMemo(() => buildDepartmentGroups(users), [users]);

  useEffect(() => {
    if (currentUserRole !== 'admin') {
      setLoading(false);
      return;
    }

    loadUsers();
  }, [currentUserRole]);

  useEffect(() => {
    if (!toastMessage) return undefined;

    const timeoutId = window.setTimeout(() => {
      setError('');
      setSuccess('');
    }, 3000);

    return () => window.clearTimeout(timeoutId);
  }, [toastMessage]);

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
    }));
  };

  const handleEditChange = (field) => (event) => {
    const value = field === 'isActive' ? event.target.checked : event.target.value;

    setEditForm((prev) => ({
      ...prev,
      [field]: value,
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
        agentId: null,
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
        agentId: editForm.agentId ? editForm.agentId.trim() : null,
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
      <div className="directory-page" style={{ display: 'grid', gap: '24px' }}>
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
    <div className="directory-page" style={{ display: 'grid', gap: '24px' }}>
      {toastMessage ? (
        <div className={`numbers-toast numbers-toast-${toastType}`}>
          {toastMessage}
        </div>
      ) : null}

      <div className="directory-hero">
        <h1 className="page-title">Directory</h1>
        <div className="page-subtitle">
          Review every teammate by department, role, status, and communication identity while keeping user management in place.
        </div>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Total Users</div>
          <div className="stat-value">{directoryStats.totalUsers}</div>
          <div className="text-muted">All workspace users</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Active Users</div>
          <div className="stat-value">{directoryStats.activeUsers}</div>
          <div className="text-muted">Currently enabled accounts</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Admins</div>
          <div className="stat-value">{directoryStats.adminUsers}</div>
          <div className="text-muted">Administrative access</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Departments</div>
          <div className="stat-value">{directoryStats.departmentCount}</div>
          <div className="text-muted">Operational team groups</div>
        </div>
      </div>

      <div className="section-card directory-shell" style={{ display: 'grid', gap: '20px' }}>
        <div className="section-header users-directory-header">
          <div>
            <h3 style={{ margin: 0 }}>Team Directory</h3>
            <div className="text-muted" style={helperTextStyle}>
              Users are grouped by department so admins can quickly review team structure before opening full account details.
            </div>
          </div>
          <span className="tag">{loading ? 'Loading' : `${users.length} users`}</span>
        </div>

        {loading ? (
          <div className="text-muted">Loading users...</div>
        ) : users.length === 0 ? (
          <div className="text-muted">No users found.</div>
        ) : (
          <div style={{ display: 'grid', gap: '20px' }}>
            {departmentGroups.map((group) => (
              <section key={group.key} className="directory-group">
                <div className="directory-group-header">
                  <div>
                    <h4 className="directory-group-title">{group.label}</h4>
                    <div className="directory-group-subtitle">
                      {group.activeCount} active of {group.users.length} users
                    </div>
                  </div>
                  <span className="tag">{group.users.length}</span>
                </div>

                <div className="user-grid directory-user-grid">
                  {group.users.map((user) => (
                    <div key={user.id} className="user-card directory-user-card" style={selectedUserId === user.id ? activeCardStyle : undefined}>
                      <div className="avatar-stack directory-user-identity">
                        <div className="avatar-circle directory-avatar-circle">
                          {String(user.name || '?')
                            .split(' ')
                            .filter(Boolean)
                            .map((part) => part[0])
                            .join('')
                            .slice(0, 2)}
                        </div>
                        <div className="directory-identity-copy">
                          <h4>{user.name}</h4>
                          <div className="user-role">{formatRole(user.role)}</div>
                        </div>
                      </div>

                      <div className="directory-user-tags">
                        <span className="tag">{user.isActive ? 'Active' : 'Inactive'}</span>
                        <span className="tag">{getDepartmentLabel(user.department) || group.label}</span>
                      </div>

                      <div className="text-muted directory-user-email">{user.email}</div>

                      <div className="directory-user-meta">
                        <div className="directory-meta-item">
                          <span className="directory-meta-label">Role</span>
                          <strong>{formatRole(user.role)}</strong>
                        </div>
                        <div className="directory-meta-item">
                          <span className="directory-meta-label">Department</span>
                          <strong>{getDepartmentLabel(user.department) || 'Unassigned / Global'}</strong>
                        </div>
                        <div className="directory-meta-item">
                          <span className="directory-meta-label">Agent ID</span>
                          <strong>{user.agentId || 'Not assigned'}</strong>
                        </div>
                        <div className="directory-meta-item">
                          <span className="directory-meta-label">Status</span>
                          <strong>{user.isActive ? 'Active' : 'Inactive'}</strong>
                        </div>
                      </div>

                      <div className="directory-card-actions" style={actionsStyle}>
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
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}

        {selectedUserId ? (
          <div className="section-card directory-detail-shell" style={detailShellStyle}>
            {detailLoading || !detailUser || !editForm ? (
              <div className="text-muted">Loading details...</div>
            ) : (
              <>
                <div className="section-header directory-detail-header" style={detailHeaderStyle}>
                  <div className="directory-detail-header-info" style={detailHeaderInfoStyle}>
                    <div className="avatar-stack directory-user-identity">
                      <div className="avatar-circle directory-avatar-circle">
                        {String(detailUser.name || '?')
                          .split(' ')
                          .filter(Boolean)
                          .map((part) => part[0])
                          .join('')
                          .slice(0, 2)}
                      </div>
                      <div className="directory-identity-copy">
                        <h3 style={detailTitleStyle}>{detailUser.name}</h3>
                        <div className="user-role directory-user-email">{detailUser.email}</div>
                      </div>
                    </div>
                    <div className="directory-detail-meta-wrap" style={detailMetaWrapStyle}>
                      <span className="tag">{detailUser.isActive ? 'Active' : 'Inactive'}</span>
                      <div className="directory-detail-meta" style={detailMetaStyle}>
                        <span className="text-muted">Role: {formatRole(detailUser.role)}</span>
                        <span className="text-muted">Department: {getDepartmentLabel(detailUser.department) || 'None'}</span>
                        <span className="text-muted">Agent ID: {detailUser.agentId || 'None'}</span>
                        <span className="text-muted">Created: {formatDate(detailUser.createdAt)}</span>
                        <span className="text-muted">Updated: {formatDate(detailUser.updatedAt)}</span>
                      </div>
                    </div>
                  </div>
                  <button type="button" style={closeButtonStyle} onClick={() => openUserDetails(selectedUserId)}>
                    Close
                  </button>
                </div>

                <div className="directory-detail-content" style={detailContentStyle}>
                  <form className="directory-detail-form" onSubmit={handleUpdateUser} style={detailFormStyle}>
                    <div className="section-header">
                      <h3 style={sectionTitleStyle}>Edit User</h3>
                      <span className="tag">Admin only</span>
                    </div>
                    <input className="numbers-input" placeholder="Full name" value={editForm.name} onChange={handleEditChange('name')} required />
                    <input className="numbers-input" type="email" placeholder="Email" value={editForm.email} onChange={handleEditChange('email')} required />
                    <select className="numbers-input" value={editForm.role} onChange={handleEditChange('role')}>
                      <option value="agent">Agent</option>
                      <option value="admin">Admin</option>
                    </select>
                    <div style={fieldGroupStyle}>
                      <label style={fieldLabelStyle}>Department</label>
                      <select
                        className="numbers-input"
                        value={editForm.department}
                        onChange={handleEditChange('department')}
                      >
                        <option value="">No department assigned</option>
                        {DEPARTMENT_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                      <div className="text-muted" style={helperTextStyle}>
                        Department represents the business team. Admin users can also be assigned here without losing admin permissions.
                      </div>
                    </div>
                    <div style={fieldGroupStyle}>
                      <label style={fieldLabelStyle}>Agent ID</label>
                      <input
                        className="numbers-input"
                        style={isEditingExistingAgentId ? readOnlyFieldStyle : undefined}
                        value={editForm.agentId}
                        onChange={isEditingExistingAgentId ? undefined : handleEditChange('agentId')}
                        placeholder={isEditingExistingAgentId ? 'Stable communication identity' : 'Communication identity'}
                        required={editForm.role === 'agent'}
                        readOnly={isEditingExistingAgentId}
                      />
                      <div className="text-muted" style={helperTextStyle}>
                        {isEditingExistingAgentId
                          ? 'Locked after creation to protect Twilio voice identity, call routing, messaging, and socket presence continuity.'
                          : 'Set this carefully once if the user does not already have a communication identity.'}
                      </div>
                    </div>
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

                  <form className="directory-detail-form" onSubmit={handleResetPassword} style={detailFormStyle}>
                    <div className="section-header">
                      <h3 style={sectionTitleStyle}>Reset Password</h3>
                      <span className="tag">Set new password</span>
                    </div>
                    <div className="text-muted" style={helperTextStyle}>
                      Set a new password for this user.
                    </div>
                    <input
                      className="numbers-input"
                      type="password"
                      placeholder="New password"
                      value={passwordForm.password}
                      onChange={handlePasswordChange}
                      required
                    />
                    <button className="numbers-primary-btn" style={compactPrimaryButtonStyle} type="submit" disabled={passwordSaving}>
                      {passwordSaving ? 'Resetting...' : 'Reset password'}
                    </button>
                  </form>
                </div>
              </>
            )}
          </div>
        ) : null}
      </div>

      <div className="section-card directory-create-section" style={{ display: 'grid', gap: '16px' }}>
        <div className="section-header directory-create-header">
          <h3 style={{ margin: 0 }}>Create User</h3>
          <span className="tag">Admin only</span>
        </div>

        <form className="directory-create-form" onSubmit={handleCreateSubmit} style={createFormStyle}>
          <div className="directory-create-primary-row" style={createPrimaryRowStyle}>
            <div className="directory-field-group" style={fieldGroupStyle}>
              <label style={fieldLabelStyle}>Full Name</label>
              <input
                className="numbers-input"
                style={compactFieldStyle}
                placeholder="Full name"
                value={form.name}
                onChange={handleCreateChange('name')}
                required
              />
            </div>
            <div className="directory-field-group" style={fieldGroupStyle}>
              <label style={fieldLabelStyle}>Email</label>
              <input
                className="numbers-input"
                style={compactFieldStyle}
                type="email"
                placeholder="Email"
                value={form.email}
                onChange={handleCreateChange('email')}
                required
              />
            </div>
            <div className="directory-field-group" style={fieldGroupStyle}>
              <label style={fieldLabelStyle}>Password</label>
              <input
                className="numbers-input"
                style={compactFieldStyle}
                type="password"
                placeholder="Password"
                value={form.password}
                onChange={handleCreateChange('password')}
                required
              />
            </div>
          </div>

          <div className="directory-create-secondary-row" style={createSecondaryRowStyle}>
            <div className="directory-field-group" style={fieldGroupStyle}>
              <label style={fieldLabelStyle}>Role</label>
              <select className="numbers-input" style={compactFieldStyle} value={form.role} onChange={handleCreateChange('role')}>
                <option value="agent">Agent</option>
                <option value="admin">Admin</option>
              </select>
            </div>

            <div className="directory-field-group" style={fieldGroupStyle}>
              <label style={fieldLabelStyle}>Department</label>
              <select
                className="numbers-input"
                style={compactFieldStyle}
                value={form.department}
                onChange={handleCreateChange('department')}
              >
                <option value="">No department assigned</option>
                {DEPARTMENT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
              <div className="text-muted" style={helperTextStyle}>
                Department is the business team the user belongs to. Admins and agents can both be assigned here while keeping their existing permissions.
              </div>
            </div>

            <div className="directory-field-group" style={fieldGroupStyle}>
              <label style={fieldLabelStyle}>Agent ID</label>
              <input
                className="numbers-input"
                style={{
                  ...compactFieldStyle,
                  ...readOnlyFieldStyle,
                }}
                value={generatedCreateAgentId}
                readOnly
                placeholder="Generated from name and department"
              />
              <div className="text-muted" style={helperTextStyle}>
                Generated automatically for calls, messaging, routing, and presence. The backend keeps it unique and may append a suffix like <code>_2</code> if needed.
              </div>
            </div>

            <div className="directory-checkbox-field" style={checkboxFieldStyle}>
              <label style={fieldLabelStyle}>Status</label>
              <label style={createCheckboxStyle}>
                <input type="checkbox" checked={form.isActive} onChange={handleCreateChange('isActive')} />
                <span>Active user</span>
              </label>
            </div>

            <div className="directory-create-button-wrap" style={createButtonWrapStyle}>
              <button className="numbers-primary-btn" style={createButtonStyle} type="submit" disabled={saving}>
                {saving ? 'Creating...' : 'Create User'}
              </button>
            </div>
          </div>
        </form>

      </div>
    </div>
  );
}

function toEditForm(user) {
  return {
    name: user.name || '',
    email: user.email || '',
    role: user.role || 'agent',
    department: user.department || '',
    agentId: user.agentId || '',
    isActive: user.isActive !== false,
  };
}

function buildAgentIdPreview({ name, role, department }) {
  const normalizedName = normalizeAgentIdPart(name) || 'user';
  const prefix = role === 'admin'
    ? 'admin'
    : (normalizeAgentIdPart(department) || 'agent');

  return `${prefix}_${normalizedName}`;
}

function normalizeAgentIdPart(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function formatDate(value) {
  if (!value) return 'Unknown';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  return date.toLocaleString();
}

function formatRole(role) {
  const normalizedRole = String(role || '').trim().toLowerCase();
  if (!normalizedRole) return 'Unknown';
  if (normalizedRole === 'admin') return 'Admin';
  if (normalizedRole === 'agent') return 'Agent';
  return normalizedRole.charAt(0).toUpperCase() + normalizedRole.slice(1);
}

function buildDirectoryStats(users = []) {
  const activeUsers = users.filter((user) => user?.isActive !== false).length;
  const adminUsers = users.filter((user) => String(user?.role || '').toLowerCase() === 'admin').length;
  const departmentCount = new Set(
    users
      .map((user) => String(user?.department || '').trim())
      .filter(Boolean)
  ).size;

  return {
    totalUsers: users.length,
    activeUsers,
    adminUsers,
    departmentCount,
  };
}

function buildDepartmentGroups(users = []) {
  const groups = users.reduce((acc, user) => {
    const departmentKey = String(user?.department || '').trim();
    const groupKey = departmentKey || '__unassigned__';

    if (!acc[groupKey]) {
      acc[groupKey] = [];
    }

    acc[groupKey].push(user);
    return acc;
  }, {});

  return Object.entries(groups)
    .map(([key, groupUsers]) => {
      const sortedUsers = [...groupUsers].sort((left, right) => (
        String(left?.name || '').localeCompare(String(right?.name || ''))
      ));

      return {
        key,
        sortOrder: resolveDepartmentSortOrder(key),
        label: key === '__unassigned__' ? 'Unassigned / Global' : (getDepartmentLabel(key) || key),
        activeCount: sortedUsers.filter((user) => user?.isActive !== false).length,
        users: sortedUsers,
      };
    })
    .sort((left, right) => {
      if (left.sortOrder !== right.sortOrder) {
        return left.sortOrder - right.sortOrder;
      }

      return left.label.localeCompare(right.label);
    });
}

function resolveDepartmentSortOrder(departmentKey) {
  if (departmentKey === '__unassigned__') {
    return Number.MAX_SAFE_INTEGER;
  }

  const optionIndex = DEPARTMENT_OPTIONS.findIndex((option) => option.value === departmentKey);
  return optionIndex === -1 ? DEPARTMENT_OPTIONS.length : optionIndex;
}

const createFormStyle = {
  display: 'grid',
  gap: '16px',
};

const createPrimaryRowStyle = {
  display: 'grid',
  gap: '12px',
  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
};

const createSecondaryRowStyle = {
  display: 'grid',
  gap: '12px',
  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
};

const compactFieldStyle = {
  minHeight: '36px',
  padding: '8px 12px',
  borderRadius: '12px',
};

const readOnlyFieldStyle = {
  background: '#f8fafc',
  color: '#475569',
  cursor: 'default',
};

const detailShellStyle = {
  display: 'grid',
  gap: '24px',
  marginTop: '12px',
};

const detailHeaderStyle = {
  alignItems: 'flex-start',
  gap: '14px',
};

const detailHeaderInfoStyle = {
  display: 'grid',
  gap: '12px',
  flex: '1 1 auto',
};

const detailMetaWrapStyle = {
  display: 'grid',
  gap: '8px',
};

const detailMetaStyle = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '8px 14px',
  fontSize: '12.5px',
  lineHeight: 1.5,
};

const detailContentStyle = {
  display: 'grid',
  gap: '16px',
  gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
  alignItems: 'stretch',
};

const detailFormStyle = {
  display: 'grid',
  gap: '12px',
  padding: '18px',
  border: '1px solid rgba(148, 163, 184, 0.14)',
  borderRadius: '18px',
  background: 'rgba(248, 250, 252, 0.58)',
  alignContent: 'start',
  boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.72)',
};

const fieldGroupStyle = {
  display: 'grid',
  gap: '7px',
};

const fieldLabelStyle = {
  fontSize: '12px',
  fontWeight: 700,
  color: '#334155',
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
};

const checkboxFieldStyle = {
  display: 'grid',
  gap: '8px',
  alignContent: 'start',
};

const createButtonWrapStyle = {
  display: 'grid',
  alignContent: 'end',
};

const createButtonStyle = {
  minHeight: '36px',
  padding: '8px 14px',
  width: '100%',
};

const actionsStyle = {
  display: 'flex',
  gap: '8px',
  flexWrap: 'wrap',
};

const checkboxStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  fontSize: '13px',
  color: '#475569',
};

const createCheckboxStyle = {
  ...checkboxStyle,
  minHeight: '36px',
  padding: '6px 2px',
};

const secondaryButtonStyle = {
  border: '1px solid rgba(15, 23, 42, 0.1)',
  background: 'rgba(255, 255, 255, 0.92)',
  color: '#0f172a',
  borderRadius: '12px',
  padding: '9px 14px',
  cursor: 'pointer',
  fontWeight: 600,
};

const closeButtonStyle = {
  ...secondaryButtonStyle,
  padding: '8px 12px',
  fontSize: '12px',
  alignSelf: 'flex-start',
};

const compactPrimaryButtonStyle = {
  justifySelf: 'flex-start',
  width: 'auto',
  minWidth: '150px',
};

const sectionTitleStyle = {
  margin: 0,
  fontSize: '18px',
  fontWeight: 700,
  color: '#0f172a',
};

const detailTitleStyle = {
  margin: 0,
  fontSize: '22px',
  fontWeight: 700,
  color: '#0f172a',
};

const helperTextStyle = {
  fontSize: '12.5px',
  lineHeight: 1.5,
};

const dangerButtonStyle = {
  ...secondaryButtonStyle,
  borderColor: 'rgba(185, 28, 28, 0.18)',
  color: '#b91c1c',
};

const activeCardStyle = {
  border: '1px solid rgba(37, 99, 235, 0.22)',
  boxShadow: '0 8px 20px rgba(37, 99, 235, 0.07)',
};

export default Users;
