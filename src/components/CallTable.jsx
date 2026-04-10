import { AlertTriangle, ArrowUpRight, PhoneIncoming, PhoneOutgoing } from 'lucide-react';

const STATUS_LABELS = {
  initiated: 'Initiated',
  ringing: 'Ringing',
  'in-progress': 'In progress',
  completed: 'Completed'
};

const STATUS_CLASS = {
  initiated: 'status-initiated',
  ringing: 'status-ringing',
  'in-progress': 'status-in-progress',
  completed: 'status-completed'
};

const formatPhone = (value) => {
  if (!value) return 'Unknown';
  const digits = value.replace(/\D/g, '');
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return value.replace(/\s+/g, ' ').trim();
};

const formatDuration = (value) => {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return '0s';
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return remainder ? `${mins}m ${remainder}s` : `${mins}m`;
};

const formatTime = (value) => {
  if (!value) return '--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--';
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
};

const getDirectionLabel = (value) => {
  if (!value) return 'Unknown';
  if (value.includes('outbound')) return 'Outbound';
  if (value.includes('inbound')) return 'Inbound';
  return 'Internal';
};

const isRecent = (value) => {
  if (!value) return false;
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return false;
  return Date.now() - timestamp <= 60 * 60 * 1000;
};

const isHighlighted = (status, createdAt) => {
  if (['in-progress', 'ringing'].includes(status)) return true;
  return isRecent(createdAt);
};

const getDirectionIcon = (value) => {
  if (!value) return PhoneIncoming;
  if (value.includes('outbound')) return PhoneOutgoing;
  if (value.includes('inbound')) return PhoneIncoming;
  return ArrowUpRight;
};

function CallTable({ calls, loading, error, onRetry }) {
  return (
    <div className="section-card call-table-card">
      <div className="section-header call-table-header">
        <div>
          <h3 style={{ margin: 0 }}>Recent activity</h3>
          <div className="call-table-subtitle">Latest calls from all extensions.</div>
        </div>
        <div className="call-table-actions">
          <span className="tag">Live</span>
          {onRetry && (
            <button type="button" className="call-table-refresh" onClick={onRetry}>
              Refresh
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="call-table-loading">
          <div className="skeleton-line" />
          <div className="skeleton-line" />
          <div className="skeleton-line" />
          <div className="skeleton-line" />
        </div>
      ) : error ? (
        <div className="call-table-state">
          <div className="call-table-state-icon">
            <AlertTriangle size={18} />
          </div>
          <div className="call-table-state-title">Unable to load call logs</div>
          <div className="call-table-state-subtitle">{error}</div>
          {onRetry && (
            <button type="button" className="call-table-refresh" onClick={onRetry}>
              Try again
            </button>
          )}
        </div>
      ) : calls.length === 0 ? (
        <div className="call-table-state">
          <div className="call-table-state-icon">
            <PhoneIncoming size={18} />
          </div>
          <div className="call-table-state-title">No calls yet</div>
          <div className="call-table-state-subtitle">
            Your live call activity will appear here the moment calls begin.
          </div>
        </div>
      ) : (
        <div className="call-table-scroll">
          <table className="table call-table">
            <thead>
              <tr>
                <th>Caller</th>
                <th>Receiver</th>
                <th>Status</th>
                <th>Duration</th>
                <th>Date &amp; time</th>
              </tr>
            </thead>
            <tbody>
              {calls.map((call) => {
                const recent = isRecent(call.createdAt);
                const highlighted = isHighlighted(call.status, call.createdAt);
                const statusKey = STATUS_CLASS[call.status] || 'status-initiated';
                const DirectionIcon = getDirectionIcon(call.direction);
                return (
                  <tr
                    key={call._id || call.callSid}
                    className={`call-row${highlighted ? ' recent' : ''}`}
                  >
                    <td>
                      <div className="call-cell">
                        <div className="call-primary">
                          <span>{formatPhone(call.from)}</span>
                          {recent && <span className="recent-pill">Recent</span>}
                        </div>
                        <div className="call-secondary">
                          <span className="call-direction">
                            <DirectionIcon size={14} />
                            {getDirectionLabel(call.direction)}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="call-cell">
                        <div className="call-primary">{formatPhone(call.to)}</div>
                        <div className="call-secondary">Destination</div>
                      </div>
                    </td>
                    <td>
                      <span className={`status-badge ${statusKey}`}>
                        {STATUS_LABELS[call.status] || 'Initiated'}
                      </span>
                    </td>
                    <td>
                      <span className="call-duration">{formatDuration(call.duration)}</span>

                        {call.recordingSid && (
  <div style={{ marginTop: '5px' }}>
    <audio controls style={{ width: '160px' }}>
      <source
        src={`${process.env.REACT_APP_API_URL}/api/recordings/${call.recordingSid}`}
        type="audio/mpeg"
      />
    </audio>
  </div>
)}
                    </td>
                    <td>{formatTime(call.createdAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default CallTable;
