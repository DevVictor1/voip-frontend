import BASE_URL from '../config/api';

export async function fetchCallLogs() {
  const response = await fetch(`${BASE_URL}/api/calls/logs`, { method: 'GET' });
  if (!response.ok) {
    throw new Error('Failed request');
  }

  const payload = await response.json();
  const rawCalls = Array.isArray(payload) ? payload : [];
  return rawCalls.map((call, index) => normalizeCall(call, index));
}

export function normalizeCall(call, index) {
  const direction = String(call?.direction || '').toLowerCase();
  const status = String(call?.status || '').toLowerCase();
  const createdAt = call?.createdAt || call?.timestamp || call?.startTime || '';
  const from = formatPhone(call?.from || '');
  const to = formatPhone(call?.to || '');
  const counterpart = direction.includes('outbound') ? to : from;
  const displayName = call?.contactName || call?.name || counterpart || 'Unknown caller';
  const type = getCallType({ direction, status });
  const statusLabel = getStatusLabel({ type, direction, status });
  const extension = getExtension(call);

  return {
    id: String(call?._id || call?.callSid || `${createdAt}-${counterpart}-${index}`),
    createdAt,
    displayName,
    displayNumber: counterpart || to || from || 'Unknown',
    initials: getInitials(displayName),
    directionLabel: direction ? startCase(direction) : 'Unknown',
    rawStatusLabel: status ? startCase(status) : 'Unknown',
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

export function formatPhone(value) {
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
