import {
  ArrowLeft,
  BellOff,
  ChevronDown,
  Delete,
  LoaderCircle,
  MessageSquare,
  Phone,
  PhoneOff,
  Search,
  StickyNote,
  Video,
} from 'lucide-react';
import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import BASE_URL from '../config/api';
import socket from '../socket';
import { disconnectCall, getDeviceStatus, startCall } from '../services/voice';

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

const DEFAULT_CALLER_ID = '(260) 544-0829';
const ACTIVE_CALL_STATES = ['connecting', 'ringing', 'in-call'];

function Calls() {
  const [activeTab, setActiveTab] = useState('Keypad');
  const [callerIds, setCallerIds] = useState([DEFAULT_CALLER_ID]);
  const [callerId, setCallerId] = useState(DEFAULT_CALLER_ID);
  const [dialValue, setDialValue] = useState('');
  const [dialError, setDialError] = useState('');
  const [searchValue, setSearchValue] = useState('');
  const deferredSearchValue = useDeferredValue(searchValue);
  const [callFilter, setCallFilter] = useState('ALL');
  const [calls, setCalls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedCallId, setSelectedCallId] = useState('');
  const [deviceStatus, setDeviceStatus] = useState(() => getDeviceStatus());
  const [keypadCallState, setKeypadCallState] = useState('idle');

  const refreshCallerIds = useCallback(async () => {
    try {
      const response = await fetch(`${BASE_URL}/api/numbers`, { method: 'GET' });
      if (!response.ok) {
        throw new Error('Failed to fetch caller IDs');
      }

      const payload = await response.json();
      const numbers = Array.isArray(payload) ? payload : [];
      const candidates = numbers
        .filter((item) => item?.phoneNumber)
        .filter((item) => {
          const capabilities = String(item?.capabilities || '').toLowerCase();
          return capabilities.includes('voice');
        })
        .map((item) => formatPhone(item.phoneNumber))
        .filter(isBusinessCallerId)
        .filter(Boolean);

      if (!candidates.length) return;

      setCallerIds((current) => dedupeCallerIds([...candidates, ...current]));
      setCallerId((current) => current || candidates[0]);
    } catch (fetchError) {
      console.error('Failed to load caller ID options:', fetchError);
    }
  }, []);

  const refreshCalls = useCallback(async ({ silent = false } = {}) => {
    let isMounted = true;
    if (!silent) setLoading(true);

    try {
      const response = await fetch(`${BASE_URL}/api/calls/logs`, { method: 'GET' });
      if (!response.ok) {
        throw new Error('Failed request');
      }

      const payload = await response.json();
      const rawCalls = Array.isArray(payload) ? payload : [];
      const normalized = rawCalls.map((call, index) => normalizeCall(call, index));

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

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      await Promise.all([
        refreshCalls(),
        refreshCallerIds(),
      ]);
    };

    load();

    const intervalId = window.setInterval(() => {
      if (!cancelled) {
        refreshCalls({ silent: true });
      }
    }, 15000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [refreshCalls, refreshCallerIds]);

  useEffect(() => {
    const handleDeviceStatus = (event) => {
      setDeviceStatus(event.detail?.status || 'offline');
    };

    const handleCallState = (event) => {
      const nextState = event.detail?.state || 'idle';
      setKeypadCallState(nextState);

      if (nextState === 'failed') {
        setDialError('Unable to start the call. Check the number and try again.');
      }
    };

    const handleCallEnded = () => {
      setKeypadCallState((current) => (current === 'failed' || current === 'missed' ? current : 'ended'));
    };

    window.addEventListener('voiceDeviceStatus', handleDeviceStatus);
    window.addEventListener('voiceCallState', handleCallState);
    window.addEventListener('callEnded', handleCallEnded);

    return () => {
      window.removeEventListener('voiceDeviceStatus', handleDeviceStatus);
      window.removeEventListener('voiceCallState', handleCallState);
      window.removeEventListener('callEnded', handleCallEnded);
    };
  }, []);

  useEffect(() => {
    let refreshTimeoutId = null;

    const handleSocketCallStatus = () => {
      refreshCalls({ silent: true });
    };

    const handleEndedRefresh = () => {
      refreshCalls({ silent: true });
      window.clearTimeout(refreshTimeoutId);
      refreshTimeoutId = window.setTimeout(() => {
        refreshCalls({ silent: true });
      }, 2000);
    };

    socket.on('callStatus', handleSocketCallStatus);
    socket.on('callEnded', handleEndedRefresh);
    window.addEventListener('callEnded', handleEndedRefresh);

    return () => {
      socket.off('callStatus', handleSocketCallStatus);
      socket.off('callEnded', handleEndedRefresh);
      window.removeEventListener('callEnded', handleEndedRefresh);
      window.clearTimeout(refreshTimeoutId);
    };
  }, [refreshCalls]);

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
    setDialError('');
    setDialValue((current) => `${current}${digit}`);
  };

  const handleBackspace = () => {
    setDialError('');
    setDialValue((current) => current.slice(0, -1));
  };

  const handleDialChange = (event) => {
    setDialError('');
    setDialValue(sanitizeDialInput(event.target.value));
  };

  const handleStartCall = async () => {
    if (ACTIVE_CALL_STATES.includes(keypadCallState)) return;

    const target = formatOutboundPhone(dialValue);

    if (!dialValue.trim()) {
      setDialError('Enter a phone number to place a call.');
      return;
    }

    if (!target) {
      setDialError('Enter a valid phone number.');
      return;
    }

    setDialError('');

    try {
      await startCall(target);
      setDialValue(target);
    } catch (callError) {
      console.error('Keypad call failed:', callError);
      setDialError('Unable to start the call. Check the number and try again.');
    }
  };

  const handleHangUp = () => {
    disconnectCall();
    setKeypadCallState('ended');
  };

  const statusTone = getKeypadStatusTone({ deviceStatus, callState: keypadCallState });
  const statusLabel = getKeypadStatusLabel({ deviceStatus, callState: keypadCallState });
  const isCallBusy = ACTIVE_CALL_STATES.includes(keypadCallState);

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
                  {callerIds.map((value) => (
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
                  inputMode="text"
                  placeholder="Enter a name or number"
                  value={dialValue}
                  onChange={handleDialChange}
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

            <div className="calls-dial-helper">Type + for international numbers</div>

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

            <div className={`calls-keypad-status is-${statusTone}`}>
              <span className={`calls-keypad-status-dot is-${statusTone}`} />
              <span>{statusLabel}</span>
              {keypadCallState === 'connecting' ? <LoaderCircle size={14} className="calls-keypad-spinner" /> : null}
            </div>

            {dialError ? (
              <div className="calls-keypad-error" role="alert">
                {dialError}
              </div>
            ) : null}

            <div className="calls-keypad-footer">
              <div className="calls-notes-indicator">
                <BellOff size={15} />
                <span>Notes off</span>
              </div>

              <div className="calls-keypad-actions">
                <button
                  type="button"
                  className="calls-call-button"
                  onClick={handleStartCall}
                  aria-label="Start call"
                  disabled={isCallBusy || deviceStatus === 'initializing'}
                >
                  <Phone size={22} />
                </button>

                {isCallBusy ? (
                  <button
                    type="button"
                    className="calls-hangup-button"
                    onClick={handleHangUp}
                    aria-label="Hang up"
                  >
                    <PhoneOff size={18} />
                  </button>
                ) : null}
              </div>
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
                        title="Call this number"
                        onClick={() => {
                          setActiveTab('Keypad');
                          setDialError('');
                          setDialValue(selectedCall.displayNumber);
                        }}
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

function dedupeCallerIds(values = []) {
  return [...new Set(values.filter(Boolean))];
}

function sanitizeDialInput(value) {
  return String(value || '').replace(/[^0-9*#+()\-\s]/g, '');
}

function formatOutboundPhone(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  if (/[*#A-Za-z]/.test(text)) return '';
  if (text.startsWith('+') && /^\+\d{8,15}$/.test(text)) return text;

  const digits = text.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 11 && digits.startsWith('0')) return `+234${digits.slice(1)}`;
  if (digits.length === 10 && /^[789]/.test(digits)) return `+234${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  if (digits.length >= 8 && digits.length <= 15) return `+${digits}`;
  return '';
}

function isBusinessCallerId(value) {
  const normalized = formatOutboundPhone(value);
  return normalized.startsWith('+1');
}

function getKeypadStatusTone({ deviceStatus, callState }) {
  if (callState === 'failed' || deviceStatus === 'error') return 'failed';
  if (ACTIVE_CALL_STATES.includes(callState)) return 'active';
  if (callState === 'ended') return 'ended';
  if (deviceStatus === 'ready') return 'ready';
  if (deviceStatus === 'initializing') return 'connecting';
  return 'idle';
}

function getKeypadStatusLabel({ deviceStatus, callState }) {
  if (callState === 'connecting') return 'Connecting';
  if (callState === 'ringing') return 'Calling';
  if (callState === 'in-call') return 'Calling';
  if (callState === 'failed') return 'Failed';
  if (callState === 'missed') return 'Failed';
  if (callState === 'ended') return 'Ended';
  if (deviceStatus === 'ready') return 'Ready';
  if (deviceStatus === 'initializing') return 'Connecting';
  if (deviceStatus === 'error') return 'Failed';
  return 'Ready';
}
