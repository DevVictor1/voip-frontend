import {
  ArrowLeft,
  BellOff,
  ChevronDown,
  Delete,
  MessageSquare,
  Phone,
  Search,
  StickyNote,
  Video,
} from 'lucide-react';
import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import BASE_URL from '../config/api';

const TABS = ['Keypad', 'Calls', 'Voicemail'];

const DIAL_PAD = [
  { digit: '1', letters: '' },
  { digit: '2', letters: 'ABC' },
  { digit: '3', letters: 'DEF' },
  { digit: '4', letters: 'GHI' },
  { digit: '5', letters: 'JKL' },
  { digit: '6', letters: 'MNO' },
  { digit: '7', letters: 'PQRS' },
  { digit: '8', letters: 'TUV' },
  { digit: '9', letters: 'WXYZ' },
  { digit: '*', letters: '' },
  { digit: '0', letters: '+' },
  { digit: '#', letters: '' },
];

const CALLER_IDS = [
  '(770) 441-0190',
  '(770) 441-0101',
];

function Calls() {
  const [activeTab, setActiveTab] = useState('Keypad');
  const [callerId, setCallerId] = useState(CALLER_IDS[0]);
  const [dialValue, setDialValue] = useState('');
  const [searchValue, setSearchValue] = useState('');
  const deferredSearchValue = useDeferredValue(searchValue);
  const [callFilter, setCallFilter] = useState('ALL');
  const [calls, setCalls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedCallId, setSelectedCallId] = useState('');

  useEffect(() => {
    let isMounted = true;

    const fetchCalls = async ({ silent = false } = {}) => {
      if (!silent && isMounted) setLoading(true);

      try {
        const response = await fetch(`${BASE_URL}/api/calls/logs`, { method: 'GET' });
        if (!response.ok) {
          throw new Error('Failed request');
        }

        const payload = await response.json();
        const normalized = Array.isArray(payload)
          ? payload.map((call, index) => normalizeCall(call, index))
          : [];

        if (!isMounted) return;

        setCalls(normalized);
        setError('');
        setSelectedCallId((current) => {
          if (current && normalized.some((item) => item.id === current)) {
            return current;
          }
          return normalized[0]?.id || '';
        });
      } catch (fetchError) {
        if (!isMounted) return;
        console.error('Failed to load call logs for Calls page:', fetchError);
        setError('Failed to load call logs');
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchCalls();
    const intervalId = window.setInterval(() => fetchCalls({ silent: true }), 15000);

    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
    };
  }, []);

  const filteredCalls = useMemo(() => {
    const query = deferredSearchValue.trim().toLowerCase();

    return calls.filter((call) => {
      const matchesFilter = callFilter === 'ALL' || call.type === 'missed';
      if (!matchesFilter) return false;

      if (!query) return true;

      return [
        call.displayName,
        call.displayNumber,
        call.statusLabel,
        call.detailTo,
        call.detailTime,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
    });
  }, [callFilter, calls, deferredSearchValue]);

  const selectedCall = useMemo(() => {
    if (!filteredCalls.length) return null;
    return filteredCalls.find((call) => call.id === selectedCallId) || filteredCalls[0];
  }, [filteredCalls, selectedCallId]);

  useEffect(() => {
    if (!selectedCall && selectedCallId) {
      setSelectedCallId('');
      return;
    }

    if (selectedCall && selectedCall.id !== selectedCallId) {
      setSelectedCallId(selectedCall.id);
    }
  }, [selectedCall, selectedCallId]);

  const handleDigitPress = (digit) => {
    setDialValue((current) => `${current}${digit}`);
  };

  const handleBackspace = () => {
    setDialValue((current) => current.slice(0, -1));
  };

  const handleCallPlaceholder = (source) => {
    const target = dialValue.trim() || selectedCall?.displayNumber || selectedCall?.displayName || 'unknown target';
    console.log(`[Calls UI] Placeholder ${source} action for`, target);
  };

  return (
    <div className="calls-page">
      <section className="calls-shell section-card">
        <div className="calls-shell-header">
          <div>
            <h1 className="page-title">Phone</h1>
          </div>
        </div>

        <div className="calls-top-tabs" role="tablist" aria-label="Calls navigation">
          {TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={activeTab === tab}
              className={`calls-top-tab${activeTab === tab ? ' is-active' : ''}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab}
            </button>
          ))}
        </div>

        {activeTab === 'Keypad' ? (
          <section className="calls-keypad-view">
            <div className="calls-caller-id-row">
              <label className="calls-caller-id">
                <span>My caller ID:</span>
                <select value={callerId} onChange={(event) => setCallerId(event.target.value)}>
                  {CALLER_IDS.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
                <ChevronDown size={14} />
              </label>
            </div>

            <div className="calls-dial-input-wrap">
              <input
                className="calls-dial-input"
                type="text"
                inputMode="tel"
                placeholder="Enter a name or number"
                value={dialValue}
                onChange={(event) => setDialValue(event.target.value)}
                aria-label="Enter a name or number"
              />
              <button
                type="button"
                className="calls-dial-backspace"
                onClick={handleBackspace}
                aria-label="Backspace"
              >
                <Delete size={18} />
              </button>
            </div>

            <div className="calls-dial-pad">
              {DIAL_PAD.map((key) => (
                <button
                  key={key.digit}
                  type="button"
                  className="calls-dial-key"
                  onClick={() => handleDigitPress(key.digit)}
                  aria-label={`Dial ${key.digit}`}
                >
                  <span className="calls-dial-key-digit">{key.digit}</span>
                  <span className="calls-dial-key-letters">{key.letters || '\u00A0'}</span>
                </button>
              ))}
            </div>

            <div className="calls-keypad-footer">
              <div className="calls-notes-indicator">
                <BellOff size={15} />
                <span>Notes off</span>
              </div>

              <button
                type="button"
                className="calls-call-button"
                onClick={() => handleCallPlaceholder('dial')}
                aria-label="Start placeholder call"
              >
                <Phone size={22} />
              </button>
            </div>
          </section>
        ) : null}

        {activeTab === 'Calls' ? (
          <section className="calls-history-view">
            <div className="calls-list-panel">
              <div className="calls-search">
                <Search size={16} />
                <input
                  type="search"
                  placeholder="search calls"
                  value={searchValue}
                  onChange={(event) => setSearchValue(event.target.value)}
                  aria-label="Search calls"
                />
              </div>

              <div className="calls-filter-row" role="tablist" aria-label="Call filters">
                {['ALL', 'MISSED'].map((filter) => (
                  <button
                    key={filter}
                    type="button"
                    role="tab"
                    className={`calls-filter-chip${callFilter === filter ? ' is-active' : ''}`}
                    onClick={() => setCallFilter(filter)}
                    aria-selected={callFilter === filter}
                  >
                    {filter}
                  </button>
                ))}
              </div>

              <div className="calls-list">
                {loading ? (
                  <div className="calls-panel-state">
                    <div className="calls-state-title">Loading calls</div>
                    <div className="calls-state-copy">Recent activity is being prepared for this view.</div>
                  </div>
                ) : error ? (
                  <div className="calls-panel-state">
                    <div className="calls-state-title">Unable to load call logs</div>
                    <div className="calls-state-copy">{error}</div>
                  </div>
                ) : filteredCalls.length === 0 ? (
                  <div className="calls-panel-state">
                    <div className="calls-state-title">No calls yet</div>
                    <div className="calls-state-copy">When calls are available, they will appear here.</div>
                  </div>
                ) : (
                  filteredCalls.map((call) => (
                    <button
                      key={call.id}
                      type="button"
                      className={`calls-list-item${selectedCall?.id === call.id ? ' is-selected' : ''}`}
                      onClick={() => setSelectedCallId(call.id)}
                    >
                      <div className={`calls-avatar calls-avatar-${call.type}`}>
                        {call.initials}
                      </div>

                      <div className="calls-list-copy">
                        <div className="calls-list-row">
                          <div className="calls-list-name">{call.displayName}</div>
                          <div className="calls-list-date">{call.relativeTime}</div>
                        </div>
                        <div className="calls-list-row">
                          <div className={`calls-list-status is-${call.type}`}>
                            {call.statusLabel}
                            {call.durationLabel !== '0 sec' ? <span>{call.durationLabel}</span> : null}
                          </div>
                        </div>
                        <div className="calls-list-number">{call.displayNumber}</div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>

            <div className="calls-detail-panel">
              {selectedCall ? (
                <>
                  <div className="calls-detail-hero">
                    <div className={`calls-detail-avatar calls-avatar-${selectedCall.type}`}>
                      {selectedCall.initials}
                    </div>
                    <h2 className="calls-detail-name">{selectedCall.displayName}</h2>
                    <div className="calls-detail-extension">{selectedCall.extensionLabel}</div>

                    <div className="calls-detail-actions">
                      <button type="button" className="calls-detail-action" title="Message placeholder">
                        <MessageSquare size={16} />
                      </button>
                      <button type="button" className="calls-detail-action" title="Video placeholder">
                        <Video size={16} />
                      </button>
                      <button
                        type="button"
                        className="calls-detail-action"
                        title="Call placeholder"
                        onClick={() => handleCallPlaceholder('details')}
                      >
                        <Phone size={16} />
                      </button>
                      <button type="button" className="calls-detail-action" title="Notes placeholder">
                        <StickyNote size={16} />
                      </button>
                    </div>
                  </div>

                  <div className="calls-detail-card">
                    <div className="calls-detail-block">
                      <div className="calls-detail-label">To</div>
                      <div className="calls-detail-value">{selectedCall.detailTo}</div>
                    </div>

                    <div className="calls-detail-divider" />

                    <div className="calls-detail-block">
                      <div className="calls-detail-label">{selectedCall.detailTime}</div>
                      <div className={`calls-detail-status is-${selectedCall.type}`}>
                        {selectedCall.statusLabel}
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="calls-detail-empty">
                  <div className="calls-detail-empty-icon">
                    <ArrowLeft size={18} />
                  </div>
                  <div className="calls-state-title">Select a call</div>
                  <div className="calls-state-copy">Choose a row from the left to inspect call details.</div>
                </div>
              )}
            </div>
          </section>
        ) : null}

        {activeTab === 'Voicemail' ? (
          <section className="calls-voicemail-view">
            <div className="calls-voicemail-icon">
              <BellOff size={20} />
            </div>
            <h2>Voicemail is coming soon</h2>
            <p>A clean placeholder is ready here until voicemail playback and management are designed.</p>
          </section>
        ) : null}
      </section>
    </div>
  );
}

function normalizeCall(call, index) {
  const direction = String(call?.direction || '').toLowerCase();
  const status = String(call?.status || '').toLowerCase();
  const createdAt = call?.createdAt || call?.timestamp || call?.startTime || '';
  const from = formatPhone(call?.from || '');
  const to = formatPhone(call?.to || '');
  const counterpart = direction.includes('outbound') ? to : from;
  const displayName = call?.contactName || call?.name || counterpart || 'Unknown caller';
  const type = getCallType({ direction, status });
  const statusLabel = getStatusLabel({ type, direction, status });
  const initials = getInitials(displayName);
  const extension = getExtension(call);

  return {
    id: String(call?._id || call?.callSid || `${createdAt}-${counterpart}-${index}`),
    createdAt,
    displayName,
    displayNumber: counterpart || to || from || 'Unknown',
    initials,
    type,
    statusLabel,
    durationLabel: formatDurationLabel(call?.duration),
    relativeTime: formatRelativeCallTime(createdAt),
    detailTime: formatDetailTime(createdAt),
    detailTo: extension
      ? `Ext. ${extension}${to && to !== extension ? ` - ${to}` : ''}`
      : to
        ? `${to} (me)`
        : 'Unknown',
    extensionLabel: extension ? `Ext. ${extension}` : 'Extension unavailable',
  };
}

function getCallType({ direction, status }) {
  if (
    status.includes('missed')
    || status.includes('no-answer')
    || status.includes('busy')
    || status.includes('failed')
    || status.includes('canceled')
    || status.includes('cancelled')
  ) {
    return 'missed';
  }

  if (direction.includes('outbound')) return 'outgoing';
  if (direction.includes('inbound')) return 'incoming';
  return 'incoming';
}

function getStatusLabel({ type, direction, status }) {
  if (type === 'missed') return 'Missed call';
  if (direction.includes('outbound')) return 'Outgoing call';
  if (direction.includes('inbound')) return 'Incoming call';
  if (status) return startCase(status);
  return 'Call activity';
}

function getExtension(call) {
  const candidates = [call?.extension, call?.ext, call?.agentExtension, call?.to];
  const matched = candidates
    .map((value) => String(value || ''))
    .find((value) => /^\d{3,6}$/.test(value.trim()));

  return matched ? matched.trim() : '';
}

function formatPhone(value) {
  const text = String(value || '').trim();
  const digits = text.replace(/\D/g, '');

  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }

  if (digits.length === 11 && digits.startsWith('1')) {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }

  return text;
}

function formatDurationLabel(value) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return '0 sec';
  if (seconds < 60) return `${seconds} sec`;

  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return remainder ? `${minutes} min ${remainder} sec` : `${minutes} min`;
}

function formatRelativeCallTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--';

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfValue = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((startOfToday - startOfValue) / 86400000);

  if (diffDays === 0) {
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }

  if (diffDays === 1) return 'Yesterday';

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatDetailTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date unavailable';

  const relative = formatRelativeCallTime(value);
  const time = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  return `${relative}, ${time}`;
}

function getInitials(value) {
  const words = String(value || '')
    .replace(/[()]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  if (!words.length) return 'NA';

  return words
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}

function startCase(value) {
  return String(value || '')
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export default Calls;
