export const AVAILABILITY_STATUS_OPTIONS = [
  { value: 'online', label: 'Online' },
  { value: 'busy', label: 'Busy' },
  { value: 'meeting', label: 'Meeting' },
  { value: 'break', label: 'Break' },
  { value: 'offline', label: 'Offline' },
];

export const normalizeAvailabilityStatus = (status) => {
  const normalized = String(status || '').trim().toLowerCase();
  if (AVAILABILITY_STATUS_OPTIONS.some((option) => option.value === normalized)) {
    return normalized;
  }

  return 'online';
};

export const formatAvailabilityStatus = (status) => {
  const normalized = normalizeAvailabilityStatus(status);
  return AVAILABILITY_STATUS_OPTIONS.find((option) => option.value === normalized)?.label || 'Online';
};

export const getAvailabilityStatusClass = (status) => {
  return `is-${normalizeAvailabilityStatus(status)}`;
};

export const resolveEffectiveAvailabilityStatus = (record = {}) => {
  const connected = typeof record?.connected === 'boolean'
    ? record.connected
    : Boolean(record?.presenceStatus) && String(record?.presenceStatus || '').trim().toLowerCase() !== 'offline';

  if (!connected) {
    return 'offline';
  }

  return normalizeAvailabilityStatus(
    record?.effectiveAvailabilityStatus
    || record?.availabilityStatus
    || record?.presenceStatus
    || 'online'
  );
};
