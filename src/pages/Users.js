import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Download,
  MessageSquare,
  MoreHorizontal,
  Phone,
  Plus,
  Upload,
  Video,
  X,
} from 'lucide-react';
import { DEPARTMENT_OPTIONS, getDepartmentLabel } from '../config/agents';
import BASE_URL from '../config/api';
import ImportContacts from '../components/ImportContacts';
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

const emptyClientForm = {
  name: '',
  phone: '',
  business: '',
  merchantId: '',
  alternatePhone: '',
  notes: '',
};

function Users({ currentUserRole = 'admin', currentUserId = '', mode = 'directory' }) {
  const navigate = useNavigate();
  const isSettingsMode = mode === 'settings';

  const [users, setUsers] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [clientChats, setClientChats] = useState([]);

  const [form, setForm] = useState(emptyCreateForm);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [detailUser, setDetailUser] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [passwordForm, setPasswordForm] = useState(emptyPasswordForm);

  const [searchQuery, setSearchQuery] = useState('');
  const [clientSearchQuery, setClientSearchQuery] = useState('');
  const [activeDirectoryTab, setActiveDirectoryTab] = useState('internal');
  const [selectedClientId, setSelectedClientId] = useState('');

  const [loading, setLoading] = useState(true);
  const [clientLoading, setClientLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [deletingId, setDeletingId] = useState('');
  const [clientStatusSaving, setClientStatusSaving] = useState(false);

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [isCreateExpanded, setIsCreateExpanded] = useState(false);
  const [isImportExpanded, setIsImportExpanded] = useState(false);
  const [showClientImport, setShowClientImport] = useState(false);
  const [showAddClientModal, setShowAddClientModal] = useState(false);
  const [addClientForm, setAddClientForm] = useState(emptyClientForm);
  const [savingClient, setSavingClient] = useState(false);
  const [addClientError, setAddClientError] = useState('');
  const [showEditClientModal, setShowEditClientModal] = useState(false);
  const [editClientForm, setEditClientForm] = useState(emptyClientForm);
  const [editingClient, setEditingClient] = useState(false);
  const [editClientError, setEditClientError] = useState('');
  const [deletingClientId, setDeletingClientId] = useState('');
  const [exportingClients, setExportingClients] = useState(false);

  const toastType = error ? 'error' : success ? 'success' : '';
  const toastMessage = error || success;
  const generatedCreateAgentId = buildAgentIdPreview(form);
  const isEditingExistingAgentId = Boolean(detailUser?.agentId);

  useEffect(() => {
    if (!toastMessage) return undefined;

    const timeoutId = window.setTimeout(() => {
      setError('');
      setSuccess('');
    }, 3000);

    return () => window.clearTimeout(timeoutId);
  }, [toastMessage]);

  const searchableUsers = useMemo(() => {
    return [...users].sort((left, right) => (
      String(left?.name || '').localeCompare(String(right?.name || ''))
    ));
  }, [users]);

  const filteredUsers = useMemo(() => {
    const normalizedQuery = String(searchQuery || '').trim().toLowerCase();
    if (!normalizedQuery) {
      return searchableUsers;
    }

    return searchableUsers.filter((user) => {
      const departmentLabel = getDepartmentLabel(user.department) || '';
      return [
        user.name,
        user.email,
        user.agentId,
        user.department,
        departmentLabel,
        formatRole(user.role),
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalizedQuery));
    });
  }, [searchQuery, searchableUsers]);

  const departmentGroups = useMemo(() => buildDepartmentGroups(filteredUsers), [filteredUsers]);
  const activeAdminCount = useMemo(() => (
    users.filter((user) => user?.role === 'admin' && user?.isActive !== false).length
  ), [users]);

  const clientDirectory = useMemo(() => {
    return buildClientDirectory({ contacts, chats: clientChats });
  }, [contacts, clientChats]);

  const filteredClients = useMemo(() => {
    const normalizedQuery = String(clientSearchQuery || '').trim().toLowerCase();
    if (!normalizedQuery) {
      return clientDirectory;
    }

    return clientDirectory.filter((client) => (
      [
        client.name,
        client.phone,
        client.businessName,
        client.mid,
        client.previewText,
        client.assignmentLabel,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalizedQuery))
    ));
  }, [clientDirectory, clientSearchQuery]);

  const selectedDirectoryUser = useMemo(() => {
    if (!selectedUserId) return filteredUsers[0] || searchableUsers[0] || null;
    return searchableUsers.find((user) => user.id === selectedUserId)
      || filteredUsers[0]
      || searchableUsers[0]
      || null;
  }, [filteredUsers, searchableUsers, selectedUserId]);

  const selectedClient = useMemo(() => {
    if (!selectedClientId) return filteredClients[0] || clientDirectory[0] || null;
    return clientDirectory.find((client) => client.id === selectedClientId)
      || filteredClients[0]
      || clientDirectory[0]
      || null;
  }, [clientDirectory, filteredClients, selectedClientId]);

  useEffect(() => {
    if (loading || isSettingsMode || activeDirectoryTab !== 'internal') return;
    if (!filteredUsers.length) {
      if (selectedUserId) setSelectedUserId('');
      return;
    }

    const selectedStillVisible = filteredUsers.some((user) => user.id === selectedUserId);
    if (!selectedStillVisible) {
      setSelectedUserId(filteredUsers[0].id);
    }
  }, [activeDirectoryTab, filteredUsers, isSettingsMode, loading, selectedUserId]);

  useEffect(() => {
    if (clientLoading || isSettingsMode || activeDirectoryTab !== 'clients') return;
    if (!filteredClients.length) {
      if (selectedClientId) setSelectedClientId('');
      return;
    }

    const selectedStillVisible = filteredClients.some((client) => client.id === selectedClientId);
    if (!selectedStillVisible) {
      setSelectedClientId(filteredClients[0].id);
    }
  }, [activeDirectoryTab, clientLoading, filteredClients, isSettingsMode, selectedClientId]);

  const loadUsers = useCallback(async () => {
    try {
      const token = getStoredAuthToken();
      const payload = await fetchUsersRequest(token);
      const nextUsers = Array.isArray(payload?.users) ? payload.users : [];
      setUsers(nextUsers);
      setError('');
    } catch (loadError) {
      setError(loadError.message || 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadClients = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        role: currentUserRole,
        userId: currentUserId,
        includeArchived: 'true',
      });

      const [contactsRes, chatsRes] = await Promise.all([
        fetch(`${BASE_URL}/api/contacts?${params.toString()}`),
        fetch(`${BASE_URL}/api/sms/conversations`),
      ]);

      const contactsData = contactsRes.ok ? await contactsRes.json() : [];
      const chatsData = chatsRes.ok ? await chatsRes.json() : [];

      setContacts(Array.isArray(contactsData) ? contactsData : []);
      setClientChats(Array.isArray(chatsData) ? chatsData : []);
    } catch (loadError) {
      console.error('Directory client load error:', loadError);
      setError((prev) => prev || 'Failed to load clients');
    } finally {
      setClientLoading(false);
    }
  }, [currentUserRole, currentUserId]);

  useEffect(() => {
    if (currentUserRole !== 'admin') {
      setLoading(false);
      setClientLoading(false);
      return;
    }

    loadUsers();
    loadClients();
  }, [currentUserRole, loadClients, loadUsers]);

  const handleCreateChange = (field) => (event) => {
    const value = field === 'isActive' ? event.target.checked : event.target.value;
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleEditChange = (field) => (event) => {
    const value = field === 'isActive' ? event.target.checked : event.target.value;
    setEditForm((prev) => ({ ...prev, [field]: value }));
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
        setSelectedUserId(payload.user.id);
      }

      setForm(emptyCreateForm);
      setIsCreateExpanded(false);
      setSuccess('User created successfully');
    } catch (saveError) {
      setError(saveError.message || 'Failed to create user');
    } finally {
      setSaving(false);
    }
  };

  const openUserDetails = async (userId) => {
    if (!userId) return;

    if (selectedUserId === userId && detailUser && isSettingsMode) {
      setSelectedUserId('');
      setDetailUser(null);
      setEditForm(null);
      setPasswordForm(emptyPasswordForm);
      return;
    }

    setSelectedUserId(userId);
    if (!isSettingsMode) return;

    setDetailLoading(true);
    setError('');
    setSuccess('');

    try {
      const token = getStoredAuthToken();
      const payload = await fetchUserDetailsRequest(token, userId);
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
    const user = users.find((item) => item.id === userId);

    if (userId === currentUserId) {
      setError('You cannot delete your own account.');
      return;
    }

    if (user?.role === 'admin' && user?.isActive !== false && activeAdminCount <= 1) {
      setError('At least one admin must remain.');
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

  const handleImportContactsSuccess = (payload) => {
    setError('');
    setSuccess(`Imported ${payload?.count || 0} contacts successfully`);
    setIsImportExpanded(false);
    setShowClientImport(false);
    loadClients();
  };

  const handleImportContactsError = (message) => {
    setSuccess('');
    setError(message || 'Failed to import contacts');
  };

  const handleExportClients = useCallback(async () => {
    if (exportingClients) return;

    setExportingClients(true);
    setError('');
    setSuccess('');

    try {
      const params = new URLSearchParams({
        role: currentUserRole,
        userId: currentUserId,
      });

      const response = await fetch(`${BASE_URL}/api/contacts/export?${params.toString()}`);
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || 'Failed to export contacts');
      }

      const blob = await response.blob();
      const today = new Date().toISOString().slice(0, 10);
      const filename = `contacts_export_${today}.csv`;
      const objectUrl = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(objectUrl);

      setSuccess('Contacts exported successfully');
    } catch (exportError) {
      setError(exportError.message || 'Failed to export contacts');
    } finally {
      setExportingClients(false);
    }
  }, [currentUserId, currentUserRole, exportingClients]);

  const closeAddClientModal = useCallback(() => {
    if (savingClient) return;
    setShowAddClientModal(false);
    setAddClientForm(emptyClientForm);
    setAddClientError('');
  }, [savingClient]);

  const handleSaveClient = useCallback(async () => {
    const trimmedPhone = String(addClientForm.phone || '').trim();
    if (!trimmedPhone || savingClient) return;

    setSavingClient(true);
    setAddClientError('');
    setError('');
    setSuccess('');

    try {
      const response = await fetch(`${BASE_URL}/api/contacts/upsert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: addClientForm.name,
          phone: trimmedPhone,
          business: addClientForm.business,
          merchantId: addClientForm.merchantId,
          notes: addClientForm.notes,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to save client');
      }

      const savedContact = payload?.contact;
      if (savedContact?._id) {
        setContacts((prev) => {
          const existingIndex = prev.findIndex((contact) => contact._id === savedContact._id);
          if (existingIndex === -1) {
            return [savedContact, ...prev];
          }

          const next = [...prev];
          next[existingIndex] = {
            ...next[existingIndex],
            ...savedContact,
          };
          return next;
        });
        setSelectedClientId(savedContact._id);
      }

      setSuccess(payload?.created ? 'Client created successfully' : 'Client updated successfully');
      setShowAddClientModal(false);
      setAddClientForm(emptyClientForm);
      setAddClientError('');
    } catch (saveError) {
      setAddClientError(saveError.message || 'Failed to save client');
    } finally {
      setSavingClient(false);
    }
  }, [addClientForm, savingClient]);

  const closeEditClientModal = useCallback(() => {
    if (editingClient) return;
    setShowEditClientModal(false);
    setEditClientForm(emptyClientForm);
    setEditClientError('');
  }, [editingClient]);

  const handleOpenEditClientModal = useCallback((client) => {
    if (!client?._id) return;

    const phones = Array.isArray(client.phones) ? client.phones : [];
    setEditClientForm({
      name: client.name || '',
      phone: client.phone || normalizePhone(phones[0]?.number) || '',
      business: client.businessName || '',
      merchantId: client.mid || '',
      alternatePhone: normalizePhone(phones[1]?.number) || '',
      notes: client.notes || '',
    });
    setEditClientError('');
    setShowEditClientModal(true);
  }, []);

  const handleSaveEditedClient = useCallback(async () => {
    if (!selectedClient?._id || editingClient) return;

    const trimmedPhone = String(editClientForm.phone || '').trim();
    if (!trimmedPhone) {
      setEditClientError('Valid phone number is required');
      return;
    }

    setEditingClient(true);
    setEditClientError('');
    setError('');
    setSuccess('');

    try {
      const response = await fetch(`${BASE_URL}/api/contacts/${selectedClient._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: currentUserRole,
          userId: currentUserId,
          name: editClientForm.name,
          phone: trimmedPhone,
          alternatePhone: editClientForm.alternatePhone,
          business: editClientForm.business,
          merchantId: editClientForm.merchantId,
          notes: editClientForm.notes,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to update client');
      }

      if (payload?.contact?._id) {
        setContacts((prev) => prev.map((contact) => (
          contact._id === payload.contact._id ? payload.contact : contact
        )));
        setSelectedClientId(payload.contact._id);
      }

      setSuccess('Client updated successfully');
      setShowEditClientModal(false);
      setEditClientForm(emptyClientForm);
      setEditClientError('');
    } catch (updateError) {
      setEditClientError(updateError.message || 'Failed to update client');
    } finally {
      setEditingClient(false);
    }
  }, [currentUserId, currentUserRole, editClientForm, editingClient, selectedClient?._id]);

  const handleDeleteClient = useCallback(async (client) => {
    if (!client?._id || deletingClientId) return;

    const confirmed = window.confirm(
      'Delete this client? Contacts with message history will be archived instead of permanently removed.'
    );
    if (!confirmed) return;

    setDeletingClientId(client._id);
    setError('');
    setSuccess('');

    try {
      const response = await fetch(`${BASE_URL}/api/contacts/${client._id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: currentUserRole,
          userId: currentUserId,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to delete client');
      }

      setContacts((prev) => prev.filter((contact) => contact._id !== client._id));
      if (selectedClientId === client._id) {
        setSelectedClientId('');
      }

      setSuccess(payload?.archived ? 'Client archived safely' : 'Client deleted successfully');
      if (showEditClientModal) {
        setShowEditClientModal(false);
        setEditClientForm(emptyClientForm);
        setEditClientError('');
      }
    } catch (deleteError) {
      setError(deleteError.message || 'Failed to delete client');
    } finally {
      setDeletingClientId('');
    }
  }, [currentUserId, currentUserRole, deletingClientId, selectedClientId, showEditClientModal]);

  const handleClientStatusChange = async (contactId, assignmentStatus) => {
    if (!contactId || !assignmentStatus) return;

    setClientStatusSaving(true);
    setError('');

    try {
      const res = await fetch(`${BASE_URL}/api/contacts/${contactId}/assignment-status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignmentStatus }),
      });

      const updatedContact = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(updatedContact?.error || 'Failed to update client status');
      }

      setContacts((prev) => prev.map((contact) => (
        contact._id === contactId
          ? { ...contact, ...(updatedContact || {}), assignmentStatus }
          : contact
      )));
      setSuccess('Client status updated');
    } catch (statusError) {
      setError(statusError.message || 'Failed to update client status');
    } finally {
      setClientStatusSaving(false);
    }
  };

  if (currentUserRole !== 'admin') {
    return (
      <div className="directory-page" style={{ display: 'grid', gap: '24px' }}>
        <div>
          <h1 className="page-title">{isSettingsMode ? 'Settings' : 'Directory'}</h1>
          <div className="page-subtitle">
            You do not have access to {isSettingsMode ? 'workspace settings' : 'the company directory'}.
          </div>
        </div>
      </div>
    );
  }

  if (isSettingsMode) {
    return (
      <div className="directory-admin-page" style={{ display: 'grid', gap: '24px' }}>
        {toastMessage ? (
          <div className={`numbers-toast numbers-toast-${toastType}`}>
            {toastMessage}
          </div>
        ) : null}

        <div className="section-card settings-admin-shell">
          <div className="section-header users-directory-header">
            <div>
              <h3 style={{ margin: 0 }}>User Management</h3>
              <div className="text-muted" style={helperTextStyle}>
                Manage team members, roles, and account access.
              </div>
            </div>
            <span className="tag">{loading ? 'Loading' : `${users.length} users`}</span>
          </div>

          <div className="directory-settings-layout">
            <div className="directory-settings-list">
              <div className="directory-settings-list-scroll">
                {loading ? (
                  <div className="text-muted">Loading users...</div>
                ) : filteredUsers.length === 0 ? (
                  <div className="text-muted">No users found.</div>
                ) : (
                  <div className="directory-settings-group-list">
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
                          {group.users.map((user) => {
                            const deleteRestrictionMessage = getDeleteRestrictionMessage(user, currentUserId, activeAdminCount);
                            const isDeleteBlocked = Boolean(deleteRestrictionMessage);

                            return (
                              <div
                                key={user.id}
                                className="user-card directory-user-card"
                                style={selectedUserId === user.id ? activeCardStyle : undefined}
                              >
                                <div className="avatar-stack directory-user-identity">
                                  <div className="avatar-circle directory-avatar-circle">
                                    {getInitials(user.name)}
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
                                    {selectedUserId === user.id ? 'Hide details' : 'Manage user'}
                                  </button>
                                  <button
                                    type="button"
                                    style={isDeleteBlocked ? blockedDangerButtonStyle : dangerButtonStyle}
                                    onClick={() => handleDeleteUser(user.id)}
                                    disabled={deletingId === user.id}
                                    aria-disabled={isDeleteBlocked}
                                    title={deleteRestrictionMessage}
                                  >
                                    {deletingId === user.id ? 'Deleting...' : 'Delete'}
                                  </button>
                                </div>
                                {isDeleteBlocked ? (
                                  <div className="text-muted" style={helperTextStyle}>
                                    {deleteRestrictionMessage}
                                  </div>
                                ) : null}
                              </div>
                            );
                          })}
                        </div>
                      </section>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="directory-settings-detail">
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
                              {getInitials(detailUser.name)}
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
                            <select className="numbers-input" value={editForm.department} onChange={handleEditChange('department')}>
                              <option value="">No department assigned</option>
                              {DEPARTMENT_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                              ))}
                            </select>
                            <div className="text-muted" style={helperTextStyle}>
                              Choose the team for this user.
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
                                ? 'This ID is locked after setup.'
                                : 'Set an ID for calls and messaging.'}
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
                            <button type="button" style={secondaryButtonStyle} onClick={handleToggleActive} disabled={editing}>
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
              ) : (
                <div className="section-card directory-settings-empty">
                  <h3 style={{ margin: 0 }}>Select a user</h3>
                  <div className="text-muted">
                    Select a team member to view details and update access.
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className={`section-card directory-create-section${isCreateExpanded ? ' is-expanded' : ''}`} style={{ display: 'grid', gap: '16px' }}>
          <div className="section-header directory-create-header">
            <div className="directory-create-header-copy">
              <h3 style={{ margin: 0 }}>Create User</h3>
              <div className="text-muted directory-create-summary">
                Add a new admin or agent.
              </div>
            </div>
            <div className="directory-create-header-actions">
              <span className="tag">Admin only</span>
              <button
                type="button"
                className="directory-collapse-btn"
                onClick={() => setIsCreateExpanded((prev) => !prev)}
                aria-expanded={isCreateExpanded}
              >
                {isCreateExpanded ? 'Hide form' : 'Open form'}
              </button>
            </div>
          </div>

          {isCreateExpanded ? (
            <form className="directory-create-form" onSubmit={handleCreateSubmit} style={createFormStyle}>
              <div className="directory-create-primary-row" style={createPrimaryRowStyle}>
                <div className="directory-field-group" style={fieldGroupStyle}>
                  <label style={fieldLabelStyle}>Full Name</label>
                  <input className="numbers-input" style={compactFieldStyle} placeholder="Full name" value={form.name} onChange={handleCreateChange('name')} required />
                </div>
                <div className="directory-field-group" style={fieldGroupStyle}>
                  <label style={fieldLabelStyle}>Email</label>
                  <input className="numbers-input" style={compactFieldStyle} type="email" placeholder="Email" value={form.email} onChange={handleCreateChange('email')} required />
                </div>
                <div className="directory-field-group" style={fieldGroupStyle}>
                  <label style={fieldLabelStyle}>Password</label>
                  <input className="numbers-input" style={compactFieldStyle} type="password" placeholder="Password" value={form.password} onChange={handleCreateChange('password')} required />
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
                  <select className="numbers-input" style={compactFieldStyle} value={form.department} onChange={handleCreateChange('department')}>
                    <option value="">No department assigned</option>
                    {DEPARTMENT_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                  <div className="text-muted" style={helperTextStyle}>
                    Choose the team for this user.
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
                    Created automatically for calls and messaging.
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
          ) : (
            <div className="directory-create-collapsed">
              <div className="directory-create-collapsed-copy">
                Add team members from Settings.
              </div>
            </div>
          )}
        </div>

        <div className={`section-card directory-import-section${isImportExpanded ? ' is-expanded' : ''}`}>
          <div className="section-header directory-import-header">
            <div className="directory-import-copy">
              <h3 style={{ margin: 0 }}>Import Contacts</h3>
              <div className="text-muted directory-import-summary">
                Upload or import client contacts.
              </div>
            </div>
            <div className="directory-import-actions">
              <span className="tag">Contacts</span>
              <button
                type="button"
                className="directory-collapse-btn"
                onClick={() => setIsImportExpanded((prev) => !prev)}
                aria-expanded={isImportExpanded}
              >
                {isImportExpanded ? 'Hide import' : 'Open import'}
              </button>
            </div>
          </div>

          {isImportExpanded ? (
            <div className="directory-import-panel">
              <ImportContacts
                onImportSuccess={handleImportContactsSuccess}
                onImportError={handleImportContactsError}
              />
              <div className="text-muted directory-import-help">
                The existing import component and backend flow are unchanged.
              </div>
            </div>
          ) : (
            <div className="directory-import-collapsed-copy">
              Contact imports stay accessible here for now while the Directory route is focused on the internal company directory.
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`directory-page${activeDirectoryTab === 'internal' ? ' is-internal-company-directory' : ' is-clients-directory'}`} style={{ display: 'grid', gap: '24px' }}>
      {toastMessage ? (
        <div className={`numbers-toast numbers-toast-${toastType}`}>
          {toastMessage}
        </div>
      ) : null}

      <div className="directory-hero">
        <div className="directory-hero-tabs">
          <button
            type="button"
            className={`directory-tab${activeDirectoryTab === 'internal' ? ' is-active' : ''}`}
            onClick={() => setActiveDirectoryTab('internal')}
          >
            Internal Company
          </button>
          <button
            type="button"
            className={`directory-tab${activeDirectoryTab === 'clients' ? ' is-active' : ''}`}
            onClick={() => setActiveDirectoryTab('clients')}
          >
            Clients
          </button>
        </div>
        <h1 className="page-title">Directory</h1>
        <div className="page-subtitle">
          {activeDirectoryTab === 'internal'
            ? 'Search internal teammates, review their communication identity, and open a clean company phonebook view without the old admin dashboard clutter.'
            : 'Browse client records, search by phone number or Merchant ID, and keep the customer directory separate from the live SMS inbox.'}
        </div>
      </div>

      {activeDirectoryTab === 'internal' ? (
        <div className="section-card directory-company-shell">
          <div className="directory-company-list">
            <div className="directory-company-search">
              <input
                className="numbers-input directory-search-input"
                placeholder="Search company contacts"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
              />
              <div className="directory-company-count text-muted">
                {loading ? 'Loading contacts...' : `${filteredUsers.length} teammates`}
              </div>
            </div>

            <div className="directory-company-list-scroll">
              {loading ? (
                <div className="directory-company-empty">
                  <h3>Loading teammates</h3>
                  <div className="text-muted">Fetching the current internal company directory.</div>
                </div>
              ) : filteredUsers.length === 0 ? (
                <div className="directory-company-empty">
                  <h3>No company contacts found</h3>
                  <div className="text-muted">Try a different name, email, department, or extension search.</div>
                </div>
              ) : (
                filteredUsers.map((user) => {
                  const isSelected = selectedDirectoryUser?.id === user.id;
                  return (
                    <button
                      type="button"
                      key={user.id}
                      className={`directory-contact-row${isSelected ? ' is-active' : ''}`}
                      onClick={() => setSelectedUserId(user.id)}
                    >
                      <div className="directory-contact-avatar">{getInitials(user.name)}</div>
                      <div className="directory-contact-copy">
                        <div className="directory-contact-primary">
                          <span>{user.name}</span>
                          {user.agentId ? (
                            <span className="directory-contact-extension">Ext. {user.agentId}</span>
                          ) : null}
                        </div>
                        <div className="directory-contact-secondary">{user.email}</div>
                        <div className="directory-contact-tertiary">
                          {formatRole(user.role)}{user.department ? ` · ${getDepartmentLabel(user.department) || user.department}` : ''}
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          <div className="directory-company-detail">
            {selectedDirectoryUser ? (
              <div className="directory-detail-card">
                <div className="directory-detail-hero">
                  <div className="directory-detail-avatar">{getInitials(selectedDirectoryUser.name)}</div>
                  <div className="directory-detail-copy">
                    <h2>{selectedDirectoryUser.name}</h2>
                    <div className="directory-detail-subtitle">
                      {formatRole(selectedDirectoryUser.role)}
                      {selectedDirectoryUser.department ? ` · ${getDepartmentLabel(selectedDirectoryUser.department) || selectedDirectoryUser.department}` : ''}
                    </div>
                  </div>
                  <div className="directory-quick-actions" aria-label="Contact quick actions">
                    <button
                      type="button"
                      className="directory-quick-action"
                      title="Internal messaging shortcut will connect here in a later directory phase"
                      aria-label="Message teammate"
                      disabled
                    >
                      <MessageSquare size={16} />
                    </button>
                    <button
                      type="button"
                      className="directory-quick-action"
                      title="Meeting shortcuts are not connected from Directory yet"
                      aria-label="Start meeting"
                      disabled
                    >
                      <Video size={16} />
                    </button>
                    <button
                      type="button"
                      className="directory-quick-action"
                      title="Direct calling from Directory is not connected yet"
                      aria-label="Call teammate"
                      disabled
                    >
                      <Phone size={16} />
                    </button>
                    <button
                      type="button"
                      className="directory-quick-action"
                      title="More teammate tools will appear here later"
                      aria-label="More teammate options"
                      disabled
                    >
                      <MoreHorizontal size={16} />
                    </button>
                  </div>
                  <span className={`directory-status-pill${selectedDirectoryUser.isActive ? ' is-active' : ''}`}>
                    {selectedDirectoryUser.isActive ? 'Active' : 'Inactive'}
                  </span>
                </div>

                <div className="directory-detail-grid">
                  <div className="directory-detail-section">
                    <div className="directory-detail-label">Extension / Agent ID</div>
                    <div className="directory-detail-value">{selectedDirectoryUser.agentId || 'Not assigned yet'}</div>
                  </div>
                  <div className="directory-detail-section">
                    <div className="directory-detail-label">Email</div>
                    <div className="directory-detail-value">{selectedDirectoryUser.email || 'Not available'}</div>
                  </div>
                  <div className="directory-detail-section">
                    <div className="directory-detail-label">Department</div>
                    <div className="directory-detail-value">{getDepartmentLabel(selectedDirectoryUser.department) || 'Unassigned / Global'}</div>
                  </div>
                  <div className="directory-detail-section">
                    <div className="directory-detail-label">Availability</div>
                    <div className="directory-detail-value">{formatPresence(selectedDirectoryUser.status)}</div>
                  </div>
                </div>

                <div className="directory-detail-note">
                  <div className="directory-detail-label">Direct Number</div>
                  <div className="text-muted">
                    No direct number is stored yet. The directory is currently using the existing internal user profile only.
                  </div>
                </div>
              </div>
            ) : (
              <div className="directory-company-empty directory-company-empty-detail">
                <h3>Select a teammate</h3>
                <div className="text-muted">Choose someone from the left to view internal company details.</div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="section-card directory-clients-shell">
          <div className="directory-clients-list">
            <div className="directory-clients-actions">
              <button
                type="button"
                className="directory-client-action-btn"
                onClick={() => setShowAddClientModal(true)}
              >
                <Plus size={15} />
                <span>Add Client</span>
              </button>
              <button
                type="button"
                className="directory-client-action-btn"
                onClick={() => setShowClientImport((prev) => !prev)}
              >
                <Upload size={15} />
                <span>{showClientImport ? 'Hide Import' : 'Import Clients'}</span>
              </button>
              <button
                type="button"
                className="directory-client-action-btn"
                onClick={handleExportClients}
                disabled={exportingClients}
              >
                <Download size={15} />
                <span>{exportingClients ? 'Exporting...' : 'Export'}</span>
              </button>
            </div>

            {showClientImport ? (
              <div className="directory-client-import">
                <ImportContacts
                  onImportSuccess={handleImportContactsSuccess}
                  onImportError={handleImportContactsError}
                />
              </div>
            ) : null}

            <div className="directory-company-search directory-clients-search">
              <input
                className="numbers-input directory-search-input"
                placeholder="Search by phone number, Merchant ID"
                value={clientSearchQuery}
                onChange={(event) => setClientSearchQuery(event.target.value)}
              />
              <div className="directory-company-count text-muted">
                {clientLoading ? 'Loading clients...' : `${filteredClients.length} clients`}
              </div>
            </div>

            <div className="directory-company-list-scroll directory-client-list-scroll">
              {clientLoading ? (
                <div className="directory-company-empty">
                  <h3>Loading clients</h3>
                  <div className="text-muted">Fetching current contact records and customer conversations.</div>
                </div>
              ) : filteredClients.length === 0 ? (
                <div className="directory-company-empty">
                  <h3>No clients found</h3>
                  <div className="text-muted">Try a phone number, business name, or Merchant ID search.</div>
                </div>
              ) : (
                filteredClients.map((client) => (
                  <button
                    type="button"
                    key={client.id}
                    className={`directory-client-row${selectedClient?.id === client.id ? ' is-active' : ''}`}
                    onClick={() => setSelectedClientId(client.id)}
                  >
                    <div className="directory-client-row-head">
                      <div className="directory-client-name">{client.name}</div>
                      <div className="directory-client-assignment-badge">{client.assignmentLabel}</div>
                    </div>
                    <div className="directory-client-secondary">{client.secondaryLine}</div>
                    <div className="directory-client-preview">{client.previewText}</div>
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="directory-clients-detail">
            {selectedClient ? (
              <div className="directory-client-detail-card">
                <div className="directory-client-detail-head">
                  <div>
                    <h2 className="directory-client-detail-title">{selectedClient.name}</h2>
                    <div className="directory-client-detail-subtitle">{selectedClient.secondaryLine}</div>
                  </div>
                  <span className="directory-status-pill is-active">Active</span>
                </div>

                <div className="directory-client-badges">
                  <span className="directory-client-badge">{selectedClient.assignmentLabel}</span>
                  <span className="directory-client-badge">Open</span>
                  {selectedClient.mid ? (
                    <span className="directory-client-badge is-mid">Merchant ID {selectedClient.mid}</span>
                  ) : null}
                </div>

                <div className="directory-client-status-row">
                  <label className="directory-detail-label" htmlFor="directory-client-status">
                    Status
                  </label>
                  <select
                    id="directory-client-status"
                    className="numbers-input directory-client-status-select"
                    value={selectedClient.assignmentStatus}
                    onChange={(event) => handleClientStatusChange(selectedClient._id, event.target.value)}
                    disabled={!selectedClient._id || clientStatusSaving}
                  >
                    <option value="open">Open</option>
                    <option value="resolved">Resolved</option>
                    <option value="closed">Closed</option>
                  </select>
                </div>

                {selectedClient.businessName ? (
                  <div className="directory-client-store-tag">Store</div>
                ) : null}

                <div className="directory-client-actions">
                  <button
                    type="button"
                    className="directory-client-toolbar-btn"
                    onClick={() => handleOpenEditClientModal(selectedClient)}
                    disabled={!selectedClient._id}
                    title={selectedClient._id ? 'Edit client details' : 'Create a saved contact before editing'}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="directory-client-toolbar-btn"
                    onClick={() => handleDeleteClient(selectedClient)}
                    disabled={!selectedClient._id || deletingClientId === selectedClient._id}
                    title={selectedClient._id ? 'Archive or delete this client safely' : 'Chat-only entries cannot be deleted from Directory'}
                  >
                    {deletingClientId === selectedClient._id ? 'Deleting...' : 'Delete'}
                  </button>
                  <button
                    type="button"
                    className="directory-client-toolbar-btn"
                    disabled
                    title="More client options will appear here later"
                  >
                    Options
                  </button>
                  <button
                    type="button"
                    className="directory-client-toolbar-btn is-accent"
                    onClick={() => navigate('/calls')}
                  >
                    <Phone size={15} />
                    <span>Call</span>
                  </button>
                  <button
                    type="button"
                    className="directory-client-toolbar-btn is-accent is-secondary"
                    onClick={() => navigate('/sms-mms', {
                      state: {
                        openSmsModeChooser: true,
                        phone: selectedClient.phone || '',
                      },
                    })}
                  >
                    <MessageSquare size={15} />
                    <span>SMS / MMS</span>
                  </button>
                </div>

                <div className="directory-client-detail-body">
                  <div className="directory-detail-section">
                    <div className="directory-detail-label">Phone number</div>
                    <div className="directory-detail-value">{selectedClient.phone || 'Unknown'}</div>
                  </div>
                  <div className="directory-detail-section">
                    <div className="directory-detail-label">Alternate phone</div>
                    <div className="directory-detail-value">{selectedClient.alternatePhone || 'Not available'}</div>
                  </div>
                  <div className="directory-detail-section">
                    <div className="directory-detail-label">Business</div>
                    <div className="directory-detail-value">{selectedClient.businessName || 'Not available'}</div>
                  </div>
                  <div className="directory-detail-section">
                    <div className="directory-detail-label">Notes</div>
                    <div className="directory-detail-value">{selectedClient.notes || 'No notes yet'}</div>
                  </div>
                  <div className="directory-detail-section">
                    <div className="directory-detail-label">Last preview</div>
                    <div className="directory-detail-value directory-client-preview-value">{selectedClient.previewText}</div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="directory-company-empty directory-company-empty-detail">
                <h3>Select a client</h3>
                <div className="text-muted">Choose a client from the left to view contact and conversation details.</div>
              </div>
            )}
          </div>
        </div>
      )}

      {showAddClientModal ? (
        <div className="directory-modal-overlay" onClick={closeAddClientModal}>
          <div className="directory-modal" onClick={(event) => event.stopPropagation()}>
            <div className="directory-modal-header">
              <div>
                <h3>Add Client</h3>
                <p>Create a directory client entry using the existing contact save flow.</p>
              </div>
              <button
                type="button"
                className="directory-modal-close"
                onClick={closeAddClientModal}
                aria-label="Close add client"
              >
                <X size={16} />
              </button>
            </div>

            <div className="directory-modal-body">
              {addClientError ? (
                <div className="directory-modal-feedback is-error">
                  {addClientError}
                </div>
              ) : null}
              <input
                className="numbers-input"
                placeholder="Client name"
                value={addClientForm.name}
                onChange={(event) => setAddClientForm((prev) => ({ ...prev, name: event.target.value }))}
              />
              <input
                className="numbers-input"
                placeholder="Phone number"
                value={addClientForm.phone}
                onChange={(event) => setAddClientForm((prev) => ({ ...prev, phone: event.target.value }))}
              />
              <input
                className="numbers-input"
                placeholder="Business / store"
                value={addClientForm.business}
                onChange={(event) => setAddClientForm((prev) => ({ ...prev, business: event.target.value }))}
              />
              <input
                className="numbers-input"
                placeholder="Merchant ID"
                value={addClientForm.merchantId}
                onChange={(event) => setAddClientForm((prev) => ({ ...prev, merchantId: event.target.value }))}
              />
              <div className="directory-modal-note">
                Save will create or update the directory contact for this phone number using the current contacts backend.
              </div>
            </div>

            <div className="directory-modal-footer">
              <button
                type="button"
                className="directory-client-toolbar-btn"
                onClick={() => {
                  closeAddClientModal();
                  setShowClientImport(true);
                }}
                disabled={savingClient}
              >
                Import Instead
              </button>
              <button
                type="button"
                className="directory-client-toolbar-btn is-accent"
                onClick={handleSaveClient}
                disabled={savingClient || !addClientForm.phone.trim()}
              >
                {savingClient ? 'Saving...' : 'Save'}
              </button>
              <button
                type="button"
                className="directory-client-toolbar-btn"
                onClick={closeAddClientModal}
                disabled={savingClient}
              >
                Close
              </button>
              <button
                type="button"
                className="directory-client-toolbar-btn"
                onClick={closeAddClientModal}
                disabled={savingClient}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showEditClientModal ? (
        <div className="directory-modal-overlay" onClick={closeEditClientModal}>
          <div className="directory-modal" onClick={(event) => event.stopPropagation()}>
            <div className="directory-modal-header">
              <div>
                <h3>Edit Client</h3>
                <p>Update the saved directory contact without affecting message history.</p>
              </div>
              <button
                type="button"
                className="directory-modal-close"
                onClick={closeEditClientModal}
                aria-label="Close edit client"
              >
                <X size={16} />
              </button>
            </div>

            <div className="directory-modal-body">
              {editClientError ? (
                <div className="directory-modal-feedback is-error">
                  {editClientError}
                </div>
              ) : null}
              <input
                className="numbers-input"
                placeholder="Client name"
                value={editClientForm.name}
                onChange={(event) => setEditClientForm((prev) => ({ ...prev, name: event.target.value }))}
              />
              <input
                className="numbers-input"
                placeholder="Primary phone number"
                value={editClientForm.phone}
                onChange={(event) => setEditClientForm((prev) => ({ ...prev, phone: event.target.value }))}
              />
              <input
                className="numbers-input"
                placeholder="Alternate phone number"
                value={editClientForm.alternatePhone}
                onChange={(event) => setEditClientForm((prev) => ({ ...prev, alternatePhone: event.target.value }))}
              />
              <input
                className="numbers-input"
                placeholder="Business / store"
                value={editClientForm.business}
                onChange={(event) => setEditClientForm((prev) => ({ ...prev, business: event.target.value }))}
              />
              <input
                className="numbers-input"
                placeholder="Merchant ID"
                value={editClientForm.merchantId}
                onChange={(event) => setEditClientForm((prev) => ({ ...prev, merchantId: event.target.value }))}
              />
              <textarea
                className="numbers-input numbers-textarea"
                placeholder="Notes"
                value={editClientForm.notes}
                onChange={(event) => setEditClientForm((prev) => ({ ...prev, notes: event.target.value }))}
                rows={4}
              />
            </div>

            <div className="directory-modal-footer">
              <button
                type="button"
                className="directory-client-toolbar-btn"
                onClick={closeEditClientModal}
                disabled={editingClient}
              >
                Cancel
              </button>
              <button
                type="button"
                className="directory-client-toolbar-btn is-accent"
                onClick={handleSaveEditedClient}
                disabled={editingClient || !editClientForm.phone.trim()}
              >
                {editingClient ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function UserAdminSettingsSection(props) {
  return <Users {...props} mode="settings" />;
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

function getInitials(name) {
  return String(name || '?')
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2);
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

function formatPresence(status) {
  const normalizedStatus = String(status || '').trim().toLowerCase();
  if (!normalizedStatus) return 'Offline';
  if (normalizedStatus === 'busy') return 'Busy';
  if (normalizedStatus === 'available') return 'Available';
  if (normalizedStatus === 'online') return 'Online';
  return normalizedStatus.charAt(0).toUpperCase() + normalizedStatus.slice(1);
}

function normalizePhone(value) {
  if (!value) return '';
  return String(value).replace(/\D/g, '').slice(-10);
}

function buildClientDirectory({ contacts = [], chats = [] }) {
  const clients = [];
  const matchedPhones = new Set();
  const archivedPhones = new Set();

  contacts.forEach((contact) => {
    if (!contact?.isArchived) return;
    const phones = Array.isArray(contact?.phones) ? contact.phones : [];
    phones
      .map((phone) => normalizePhone(phone.number))
      .filter(Boolean)
      .forEach((phone) => archivedPhones.add(phone));
  });

  contacts.forEach((contact) => {
    if (contact?.isArchived) return;
    const phones = Array.isArray(contact?.phones) ? contact.phones : [];
    const normalizedPhones = phones
      .map((phone) => normalizePhone(phone.number))
      .filter(Boolean);
    const matchedChat = chats.find((chat) => normalizedPhones.includes(normalizePhone(chat?.phone)));
    const phone = normalizePhone(matchedChat?.phone || phones[0]?.number || '');
    const alternatePhone = normalizePhone(phones[1]?.number || '');
    const fullName = [contact?.firstName, contact?.lastName].filter(Boolean).join(' ').trim();
    const businessName = contact?.dba || '';
    const name = fullName || contact?.name || businessName || phone;
    const previewText = matchedChat?.lastMessage || 'No messages yet';

    clients.push({
      ...contact,
      id: contact?._id || `client:${phone}`,
      _id: contact?._id || null,
      name: name || phone || 'Unknown client',
      phone,
      alternatePhone,
      businessName,
      mid: contact?.mid || '',
      notes: contact?.notes || '',
      previewText,
      assignedTo: contact?.assignedTo || matchedChat?.assignedTo || null,
      isUnassigned: typeof contact?.isUnassigned === 'boolean'
        ? contact.isUnassigned
        : typeof matchedChat?.isUnassigned === 'boolean'
          ? matchedChat.isUnassigned
          : !(contact?.assignedTo || matchedChat?.assignedTo),
      assignmentStatus: contact?.assignmentStatus || matchedChat?.assignmentStatus || 'open',
      unread: Number(matchedChat?.unread || 0),
      updatedAt: matchedChat?.updatedAt || contact?.updatedAt || 0,
      secondaryLine: [phone, businessName].filter(Boolean).join(' / '),
    });

    normalizedPhones.forEach((item) => matchedPhones.add(item));
    if (phone) matchedPhones.add(phone);
  });

  chats.forEach((chat) => {
    const phone = normalizePhone(chat?.phone);
    if (!phone || matchedPhones.has(phone) || archivedPhones.has(phone)) return;

    clients.push({
      id: `client:${phone}`,
      _id: null,
      name: chat?.name || phone,
      phone,
      alternatePhone: '',
      businessName: '',
      mid: '',
      notes: '',
      previewText: chat?.lastMessage || 'No messages yet',
      assignedTo: chat?.assignedTo || null,
      isUnassigned: typeof chat?.isUnassigned === 'boolean' ? chat.isUnassigned : !chat?.assignedTo,
      assignmentStatus: chat?.assignmentStatus || 'open',
      unread: Number(chat?.unread || 0),
      updatedAt: chat?.updatedAt || 0,
      secondaryLine: phone,
    });
  });

  return clients
    .map((client) => ({
      ...client,
      assignmentLabel: client.isUnassigned ? 'Unassigned' : (client.assignedTo || 'Assigned'),
    }))
    .sort((left, right) => new Date(right.updatedAt || 0) - new Date(left.updatedAt || 0));
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

function getDeleteRestrictionMessage(user, currentUserId, activeAdminCount) {
  if (!user?.id) {
    return '';
  }

  if (user.id === currentUserId) {
    return 'You cannot delete your own account.';
  }

  if (user.role === 'admin' && user.isActive !== false && activeAdminCount <= 1) {
    return 'At least one admin must remain.';
  }

  return '';
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

const blockedDangerButtonStyle = {
  ...dangerButtonStyle,
  opacity: 0.6,
};

const activeCardStyle = {
  border: '1px solid rgba(37, 99, 235, 0.22)',
  boxShadow: '0 8px 20px rgba(37, 99, 235, 0.07)',
};

export default Users;
