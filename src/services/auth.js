import BASE_URL from '../config/api';

const AUTH_TOKEN_KEY = 'authToken';
const AUTH_USER_KEY = 'authUser';
const LEGACY_ROLE_KEY = 'userRole';
const LEGACY_AGENT_KEY = 'voiceUserId';

const isBrowser = () => typeof window !== 'undefined';

const readStorage = (key) => {
  if (!isBrowser()) return null;
  return window.localStorage?.getItem(key) || null;
};

const writeStorage = (key, value) => {
  if (!isBrowser()) return;
  window.localStorage?.setItem(key, value);
};

const removeStorage = (key) => {
  if (!isBrowser()) return;
  window.localStorage?.removeItem(key);
};

export const getStoredAuthToken = () => readStorage(AUTH_TOKEN_KEY);

export const getStoredAuthUser = () => {
  const raw = readStorage(AUTH_USER_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch (error) {
    removeStorage(AUTH_USER_KEY);
    return null;
  }
};

export const getLegacyRole = () => {
  const role = readStorage(LEGACY_ROLE_KEY);
  return role === 'agent' ? 'agent' : 'admin';
};

export const getLegacyAgentId = () => {
  return readStorage(LEGACY_AGENT_KEY) || 'web_user';
};

export const getEffectiveRole = (user = null) => {
  const resolvedUser = user || getStoredAuthUser();
  if (resolvedUser?.role) {
    return resolvedUser.role === 'agent' ? 'agent' : 'admin';
  }

  return getLegacyRole();
};

export const getEffectiveAgentId = (user = null) => {
  const resolvedUser = user || getStoredAuthUser();
  if (resolvedUser?.agentId) {
    return resolvedUser.agentId;
  }

  return getLegacyAgentId();
};

export const syncLegacyUserState = (user) => {
  if (!user || !isBrowser()) return;

  removeStorage(LEGACY_ROLE_KEY);
  removeStorage(LEGACY_AGENT_KEY);
};

export const storeAuthSession = ({ token, user }) => {
  if (token) {
    writeStorage(AUTH_TOKEN_KEY, token);
  }

  if (user) {
    writeStorage(AUTH_USER_KEY, JSON.stringify(user));
    syncLegacyUserState(user);
  }
};

export const clearAuthSession = () => {
  removeStorage(AUTH_TOKEN_KEY);
  removeStorage(AUTH_USER_KEY);
  removeStorage(LEGACY_ROLE_KEY);
  removeStorage(LEGACY_AGENT_KEY);
};

const parseJsonResponse = async (response) => {
  const contentType = response.headers.get('content-type') || '';

  if (!contentType.includes('application/json')) {
    return null;
  }

  try {
    return await response.json();
  } catch (error) {
    return null;
  }
};

export const loginRequest = async ({ email, password }) => {
  const response = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  const payload = await parseJsonResponse(response);

  if (!response.ok) {
    throw new Error(payload?.error || 'Login failed');
  }

  return payload;
};

export const fetchCurrentUser = async (token) => {
  const response = await fetch(`${BASE_URL}/api/auth/me`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const payload = await parseJsonResponse(response);

  if (!response.ok) {
    throw new Error(payload?.error || 'Session expired');
  }

  return payload;
};
