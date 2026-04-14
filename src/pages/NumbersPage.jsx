import { useEffect, useMemo, useRef, useState } from 'react';
import { MoreVertical } from 'lucide-react';
import BASE_URL from '../config/api';

const statusOptions = ['active', 'pending', 'porting', 'completed', 'failed'];
const capabilityOptions = ['voice', 'messaging', 'voice + messaging'];

const emptyForm = {
  phoneNumber: '',
  label: '',
  provider: '',
  status: 'pending',
  capabilities: 'voice',
  assignedTo: '',
  notes: '',
  requestedPortDate: '',
  completedDate: '',
};

function NumbersPage() {
  const [numbers, setNumbers] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingId, setSavingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [openMenuId, setOpenMenuId] = useState(null);
  const [error, setError] = useState('');
  const [toast, setToast] = useState(null);
  const actionMenuRef = useRef(null);

  useEffect(() => {
    if (!toast) return undefined;

    const timeoutId = window.setTimeout(() => {
      setToast(null);
    }, 2500);

    return () => window.clearTimeout(timeoutId);
  }, [toast]);

  useEffect(() => {
    if (!openMenuId) return undefined;

    const handleClickOutside = (event) => {
      if (actionMenuRef.current && !actionMenuRef.current.contains(event.target)) {
        setOpenMenuId(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [openMenuId]);

  const fetchNumbers = async () => {
    try {
      const res = await fetch(`${BASE_URL}/api/numbers`);
      if (!res.ok) throw new Error('Failed to fetch numbers');
      const data = await res.json();
      const list = Array.isArray(data) ? data : [];
      setNumbers(list);
      setDrafts(
        Object.fromEntries(
          list.map((item) => [item._id, toDraft(item)])
        )
      );
      setError('');
    } catch (err) {
      console.error('Numbers fetch error:', err);
      setError('Failed to load numbers');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNumbers();
  }, []);

  const summary = useMemo(() => {
    return {
      total: numbers.length,
      active: numbers.filter((item) => item.status === 'active').length,
      porting: numbers.filter((item) => item.status === 'porting').length,
      failed: numbers.filter((item) => item.status === 'failed').length,
    };
  }, [numbers]);

  const handleCreate = async (e) => {
    e.preventDefault();
    setSaving(true);

    try {
      const res = await fetch(`${BASE_URL}/api/numbers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });

      if (!res.ok) throw new Error('Failed to create number');

      setForm(emptyForm);
      await fetchNumbers();
    } catch (err) {
      console.error('Numbers create error:', err);
      setError('Failed to create number');
    } finally {
      setSaving(false);
    }
  };

  const handleDraftChange = (id, field, value) => {
    setDrafts((prev) => ({
      ...prev,
      [id]: {
        ...prev[id],
        [field]: value,
      },
    }));
  };

  const handleUpdate = async (id) => {
    if (savingId === id) return;
    setSavingId(id);

    try {
      const res = await fetch(`${BASE_URL}/api/numbers/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(drafts[id]),
      });

      if (!res.ok) throw new Error('Failed to update number');
      await fetchNumbers();
      setOpenMenuId(null);
      setToast({ type: 'success', message: 'Number updated' });
    } catch (err) {
      console.error('Numbers update error:', err);
      setError('Failed to update number');
      setToast({ type: 'error', message: 'Failed to save number' });
    } finally {
      setSavingId(null);
    }
  };

  const handleDelete = async (id) => {
    if (deletingId === id) return;
    setDeletingId(id);

    try {
      const res = await fetch(`${BASE_URL}/api/numbers/${id}`, {
        method: 'DELETE',
      });

      if (!res.ok) throw new Error('Failed to delete number');
      await fetchNumbers();
      setOpenMenuId(null);
      setToast({ type: 'success', message: 'Number deleted' });
    } catch (err) {
      console.error('Numbers delete error:', err);
      setError('Failed to delete number');
      setToast({ type: 'error', message: 'Failed to delete number' });
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="numbers-page" style={{ display: 'grid', gap: '24px' }}>
      {toast ? (
        <div className={`numbers-toast numbers-toast-${toast.type}`}>
          {toast.message}
        </div>
      ) : null}

      <div>
        <h1 className="page-title">Numbers & Porting</h1>
        <div className="page-subtitle">
          Track phone inventory, provider migrations, and internal ownership without changing live routing.
        </div>
      </div>

      <div className="call-stats numbers-summary-grid">
        <div className="call-stat-card numbers-summary-card">
          <div className="call-stat-label">Total numbers</div>
          <div className="call-stat-value">{summary.total}</div>
        </div>
        <div className="call-stat-card numbers-summary-card">
          <div className="call-stat-label">Active</div>
          <div className="call-stat-value">{summary.active}</div>
        </div>
        <div className="call-stat-card numbers-summary-card">
          <div className="call-stat-label">Porting</div>
          <div className="call-stat-value">{summary.porting}</div>
        </div>
        <div className="call-stat-card numbers-summary-card">
          <div className="call-stat-label">Failed</div>
          <div className="call-stat-value">{summary.failed}</div>
        </div>
      </div>

      <div className="section-card numbers-section-card">
        <div className="section-header">
          <h3 style={{ margin: 0 }}>Add Number</h3>
          <span className="tag">Stage 1</span>
        </div>
        <div className="numbers-section-copy">
          Create an internal record for a line before or during provider migration.
        </div>

        <form className="numbers-form" onSubmit={handleCreate}>
          <input
            className="numbers-input"
            placeholder="Phone number"
            value={form.phoneNumber}
            onChange={(e) => setForm((prev) => ({ ...prev, phoneNumber: e.target.value }))}
          />
          <input
            className="numbers-input"
            placeholder="Label"
            value={form.label}
            onChange={(e) => setForm((prev) => ({ ...prev, label: e.target.value }))}
          />
          <input
            className="numbers-input"
            placeholder="Current provider"
            value={form.provider}
            onChange={(e) => setForm((prev) => ({ ...prev, provider: e.target.value }))}
          />
          <select
            className="numbers-input"
            value={form.status}
            onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value }))}
          >
            {statusOptions.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
          <select
            className="numbers-input"
            value={form.capabilities}
            onChange={(e) => setForm((prev) => ({ ...prev, capabilities: e.target.value }))}
          >
            {capabilityOptions.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
          <input
            className="numbers-input"
            placeholder="Assigned team / owner"
            value={form.assignedTo}
            onChange={(e) => setForm((prev) => ({ ...prev, assignedTo: e.target.value }))}
          />
          <input
            className="numbers-input"
            type="date"
            value={form.requestedPortDate}
            onChange={(e) => setForm((prev) => ({ ...prev, requestedPortDate: e.target.value }))}
          />
          <input
            className="numbers-input"
            type="date"
            value={form.completedDate}
            onChange={(e) => setForm((prev) => ({ ...prev, completedDate: e.target.value }))}
          />
          <textarea
            className="numbers-input numbers-textarea"
            placeholder="Notes"
            value={form.notes}
            onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
          />
          <button className="numbers-primary-btn" type="submit" disabled={saving}>
            {saving ? 'Saving...' : 'Add Number'}
          </button>
        </form>
      </div>

      <div className="section-card numbers-section-card">
        <div className="section-header">
          <h3 style={{ margin: 0 }}>Tracked Numbers</h3>
          <span className="tag">{loading ? 'Loading' : `${numbers.length} records`}</span>
        </div>
        <div className="numbers-section-copy">
          Review current ownership, capabilities, and porting progress in one place.
        </div>

        {error ? <div className="text-muted">{error}</div> : null}

        <div className="call-table-scroll">
          {numbers.length === 0 && !loading ? (
            <div className="numbers-empty-state">
              <div className="numbers-empty-title">No tracked numbers yet</div>
              <div className="numbers-empty-copy">
                Add your first number to start tracking porting status.
              </div>
            </div>
          ) : (
          <table className="table call-table numbers-table">
            <thead>
              <tr>
                <th>Number</th>
                <th>Status</th>
                <th>Capabilities</th>
                <th>Provider</th>
                <th>Owner</th>
                <th>Requested</th>
                <th>Completed</th>
                <th>Notes</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {numbers.map((item) => {
                const draft = drafts[item._id] || toDraft(item);

                return (
                  <tr key={item._id} className="numbers-row">
                    <td>
                      <div className="call-primary numbers-number-cell">{item.phoneNumber}</div>
                      <div className="call-secondary">{item.label || 'Unlabeled'}</div>
                    </td>
                    <td>
                      <select
                        className="numbers-input numbers-inline-input"
                        value={draft.status}
                        onChange={(e) => handleDraftChange(item._id, 'status', e.target.value)}
                      >
                        {statusOptions.map((option) => (
                          <option key={option} value={option}>{option}</option>
                        ))}
                      </select>
                      <div className={`numbers-status numbers-status-${draft.status}`}>
                        {draft.status}
                      </div>
                    </td>
                    <td>
                      <select
                        className="numbers-input numbers-inline-input"
                        value={draft.capabilities}
                        onChange={(e) => handleDraftChange(item._id, 'capabilities', e.target.value)}
                      >
                        {capabilityOptions.map((option) => (
                          <option key={option} value={option}>{option}</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        className="numbers-input numbers-inline-input"
                        value={draft.provider}
                        onChange={(e) => handleDraftChange(item._id, 'provider', e.target.value)}
                      />
                    </td>
                    <td>
                      <input
                        className="numbers-input numbers-inline-input"
                        value={draft.assignedTo}
                        onChange={(e) => handleDraftChange(item._id, 'assignedTo', e.target.value)}
                      />
                    </td>
                    <td>
                      <input
                        className="numbers-input numbers-inline-input"
                        type="date"
                        value={draft.requestedPortDate}
                        onChange={(e) => handleDraftChange(item._id, 'requestedPortDate', e.target.value)}
                      />
                    </td>
                    <td>
                      <input
                        className="numbers-input numbers-inline-input"
                        type="date"
                        value={draft.completedDate}
                        onChange={(e) => handleDraftChange(item._id, 'completedDate', e.target.value)}
                      />
                    </td>
                    <td>
                      <textarea
                        className="numbers-input numbers-inline-input numbers-inline-notes"
                        value={draft.notes}
                        onChange={(e) => handleDraftChange(item._id, 'notes', e.target.value)}
                      />
                    </td>
                    <td className="numbers-actions-cell">
                      <div
                        className="numbers-actions-menu"
                        ref={openMenuId === item._id ? actionMenuRef : null}
                      >
                        <button
                          className="numbers-menu-trigger"
                          type="button"
                          aria-label="Open actions menu"
                          onClick={() =>
                            setOpenMenuId((prev) => (prev === item._id ? null : item._id))
                          }
                        >
                          <MoreVertical size={16} />
                        </button>

                        {openMenuId === item._id ? (
                          <div className="numbers-menu-dropdown">
                            <button
                              className="numbers-menu-item"
                              type="button"
                              disabled={savingId === item._id || deletingId === item._id}
                              onClick={() => handleUpdate(item._id)}
                            >
                              {savingId === item._id ? 'Saving...' : 'Save changes'}
                            </button>
                            <button
                              className="numbers-menu-item numbers-menu-item-danger"
                              type="button"
                              disabled={deletingId === item._id || savingId === item._id}
                              onClick={() => handleDelete(item._id)}
                            >
                              {deletingId === item._id ? 'Deleting...' : 'Delete number'}
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          )}
        </div>
      </div>
    </div>
  );
}

function toDraft(item) {
  return {
    phoneNumber: item.phoneNumber || '',
    label: item.label || '',
    provider: item.provider || '',
    status: item.status || 'pending',
    capabilities: item.capabilities || 'voice',
    assignedTo: item.assignedTo || '',
    notes: item.notes || '',
    requestedPortDate: formatDateInput(item.requestedPortDate),
    completedDate: formatDateInput(item.completedDate),
  };
}

function formatDateInput(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

export default NumbersPage;
