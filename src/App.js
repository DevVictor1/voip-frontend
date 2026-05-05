import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useCallback, useEffect, useRef, useState } from 'react';
import './App.css';
import MainLayout from './layout/MainLayout';
import Dashboard from './pages/Dashboard';
import Calls from './pages/Calls';
import Users from './pages/Users';
import Messages from './pages/MessagesPage';
import SettingsPage from './pages/SettingsPage';
import CallExperienceOverlay from './components/CallExperienceOverlay';
import IncomingCallPopup from './components/IncomingCallPopup';
import socket from './socket';
import BASE_URL from './config/api';
import {
  initVoice,
  getDeviceStatus,
  muteCall,
  unmuteCall,
  disconnectCall,
  resetVoice,
} from './services/voice';
import OptInPage from './pages/OptInPage';
import LoginPage from './pages/LoginPage';
import InfoPage from './pages/InfoPage';
import PrivacyPage from './pages/PrivacyPage';
import TermsPage from './pages/TermsPage';
import {
  clearAuthSession,
  fetchCurrentUser,
  getEffectiveAgentId,
  getEffectiveRole,
  getStoredAuthToken,
  getStoredAuthUser,
  loginRequest,
  storeAuthSession,
  updateMyAvatarRequest,
  updateMyAvailabilityStatusRequest,
} from './services/auth';
import { AVAILABILITY_STATUS_OPTIONS, normalizeAvailabilityStatus, resolveEffectiveAvailabilityStatus } from './utils/presence';

function App() {
  const lastRegisteredSocketIdentityRef = useRef(null);
  const [authToken, setAuthToken] = useState(() => getStoredAuthToken());
  const [authUser, setAuthUser] = useState(() => getStoredAuthUser());
  const [authChecking, setAuthChecking] = useState(() => Boolean(getStoredAuthToken()));
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [authError, setAuthError] = useState('');
  const [connection, setConnection] = useState(null);
  const [isMuted, setIsMuted] = useState(false);
  const [deviceStatus, setDeviceStatus] = useState(() => getDeviceStatus());
  const [callState, setCallState] = useState('idle');
  const [callNotice, setCallNotice] = useState(null);
  const [callParticipant, setCallParticipant] = useState(null);
  const [userRole, setUserRole] = useState(() => getEffectiveRole(getStoredAuthUser()));
  const [agentStatus, setAgentStatus] = useState('offline');
  const [availabilityStatus, setAvailabilityStatus] = useState(() => normalizeAvailabilityStatus(getStoredAuthUser()?.availabilityStatus || 'online'));
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [statusUpdateError, setStatusUpdateError] = useState('');
  const [agentId, setAgentId] = useState(() => getEffectiveAgentId(getStoredAuthUser()));
  const [isUpdatingAvatar, setIsUpdatingAvatar] = useState(false);
  const [avatarUpdateError, setAvatarUpdateError] = useState('');
  const [sidebarUnreadTotals, setSidebarUnreadTotals] = useState(() => ({
    internalChat: 0,
    internalTeams: 0,
  }));

  const isAuthenticated = Boolean(authToken && authUser);
  const authenticatedAgentId = authUser?.agentId || '';
  const workspaceAgentId = isAuthenticated
    ? (authenticatedAgentId || agentId || 'web_user')
    : (agentId || 'web_user');
  const isVoiceReady = deviceStatus === 'ready';

  const syncSidebarUnreadTotals = useCallback((conversations = []) => {
    setSidebarUnreadTotals(calculateSidebarUnreadTotals(conversations));
  }, []);

  const fetchSidebarUnreadTotals = useCallback(async () => {
    if (!isAuthenticated) {
      setSidebarUnreadTotals({ internalChat: 0, internalTeams: 0 });
      return;
    }

    try {
      const params = new URLSearchParams({
        role: authUser?.role || userRole,
        userId: workspaceAgentId,
      });
      const response = await fetch(`${BASE_URL}/api/messages/conversations?${params.toString()}`);

      if (!response.ok) {
        throw new Error('Failed to fetch internal unread totals');
      }

      const data = await response.json();
      syncSidebarUnreadTotals(data || []);
    } catch (error) {
      console.error('Sidebar unread totals error:', error);
    }
  }, [authUser?.role, isAuthenticated, syncSidebarUnreadTotals, userRole, workspaceAgentId]);

  useEffect(() => {
    let isMounted = true;

    const restoreSession = async () => {
      const storedToken = getStoredAuthToken();

      if (!storedToken) {
        if (isMounted) {
          setAuthToken(null);
          setAuthUser(null);
          setAuthChecking(false);
        }
        return;
      }

      try {
        const payload = await fetchCurrentUser(storedToken);
        if (!isMounted) return;

        const user = payload?.user || null;
        storeAuthSession({ token: storedToken, user });
        setAuthToken(storedToken);
        setAuthUser(user);
        setAuthError('');
      } catch (error) {
        if (!isMounted) return;

        clearAuthSession();
        setAuthToken(null);
        setAuthUser(null);
      } finally {
        if (isMounted) {
          setAuthChecking(false);
        }
      }
    };

    restoreSession();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!authUser) return;

    setUserRole(authUser.role === 'agent' ? 'agent' : 'admin');
    setAgentId(authUser.agentId || '');
    setAvailabilityStatus(normalizeAvailabilityStatus(authUser.availabilityStatus || 'online'));
  }, [authUser]);

  useEffect(() => {
    if (!isAuthenticated) return;

    const userId = workspaceAgentId;

    if (!socket || !userId) return;

    const registerIdentity = () => {
      setAgentStatus('online');
      socket.emit('registerUser', {
        userId,
        status: 'online',
        availabilityStatus,
        voiceReady: isVoiceReady,
      });
      socket.emit('voiceReady', {
        userId,
        voiceReady: isVoiceReady,
        deviceStatus,
      });
      lastRegisteredSocketIdentityRef.current = userId;
      console.log('Registered socket user:', userId, {
        agentStatus: 'online',
        availabilityStatus,
        deviceStatus,
        voiceReady: isVoiceReady,
      });
    };

    const needsReconnect = Boolean(
      lastRegisteredSocketIdentityRef.current
      && lastRegisteredSocketIdentityRef.current !== userId
    );

    if (needsReconnect && socket.connected) {
      socket.disconnect();
    }

    const handleDisconnect = () => {
      setAgentStatus('offline');
    };

    socket.on('connect', registerIdentity);
    socket.on('disconnect', handleDisconnect);

    if (socket.connected) {
      registerIdentity();
    } else {
      socket.connect();
    }

    return () => {
      socket.off('connect', registerIdentity);
      socket.off('disconnect', handleDisconnect);
    };
  }, [availabilityStatus, deviceStatus, isAuthenticated, isVoiceReady, workspaceAgentId]);

  useEffect(() => {
    if (!isAuthenticated) {
      setSidebarUnreadTotals({ internalChat: 0, internalTeams: 0 });
      return;
    }

    fetchSidebarUnreadTotals();
  }, [fetchSidebarUnreadTotals, isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) return undefined;

    const refreshInternalUnreadTotals = (payload) => {
      const conversationType = String(payload?.conversationType || '').trim();
      if (!conversationType || (conversationType !== 'internal_dm' && conversationType !== 'team')) {
        return;
      }

      fetchSidebarUnreadTotals();
    };

    socket.on('newMessage', refreshInternalUnreadTotals);
    socket.on('internalMessageStatus', refreshInternalUnreadTotals);
    socket.on('internalMessageUpdated', refreshInternalUnreadTotals);
    socket.on('internalMessageDeleted', refreshInternalUnreadTotals);

    return () => {
      socket.off('newMessage', refreshInternalUnreadTotals);
      socket.off('internalMessageStatus', refreshInternalUnreadTotals);
      socket.off('internalMessageUpdated', refreshInternalUnreadTotals);
      socket.off('internalMessageDeleted', refreshInternalUnreadTotals);
    };
  }, [fetchSidebarUnreadTotals, isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated || !authToken) return undefined;

    const handleUserPresenceUpdated = (payload) => {
      const nextAgentId = String(payload?.userId || payload?.agentId || '').trim();
      if (!nextAgentId || nextAgentId !== workspaceAgentId) {
        return;
      }

      const nextAvailabilityStatus = normalizeAvailabilityStatus(
        payload?.availabilityStatus || availabilityStatus
      );
      const nextPresenceStatus = String(payload?.presenceStatus || '').trim().toLowerCase() || 'offline';

      setAgentStatus(nextPresenceStatus);
      setAvailabilityStatus(nextAvailabilityStatus);
      setAuthUser((current) => {
        if (!current) return current;

        const nextUser = {
          ...current,
          availabilityStatus: nextAvailabilityStatus,
        };
        storeAuthSession({ token: authToken, user: nextUser });
        return nextUser;
      });
    };

    const handleUserAvatarUpdated = (payload) => {
      const nextUser = payload?.user || null;
      const nextUserId = String(nextUser?.id || nextUser?._id || payload?.userId || '').trim();
      const currentUserDbId = String(authUser?.id || authUser?._id || '').trim();

      if (!nextUser || !nextUserId || !currentUserDbId || nextUserId !== currentUserDbId) {
        return;
      }

      storeAuthSession({ token: authToken, user: nextUser });
      setAuthUser(nextUser);
    };

    socket.on('userPresenceUpdated', handleUserPresenceUpdated);
    socket.on('userAvatarUpdated', handleUserAvatarUpdated);
    return () => {
      socket.off('userPresenceUpdated', handleUserPresenceUpdated);
      socket.off('userAvatarUpdated', handleUserAvatarUpdated);
    };
  }, [authToken, authUser?.id, authUser?._id, availabilityStatus, isAuthenticated, workspaceAgentId]);

  useEffect(() => {
    if (!isAuthenticated) return undefined;

    const startVoice = async () => {
      const userId = workspaceAgentId || '';
      await initVoice(userId || undefined);
    };

    window.addEventListener('click', startVoice, { once: true });

    return () => {
      window.removeEventListener('click', startVoice);
    };
  }, [isAuthenticated, workspaceAgentId]);

  useEffect(() => {
    const handler = (e) => {
      const payload = e.detail;
      const conn = payload?.connection || payload;
      setConnection(conn);
      setCallNotice(null);
      if (payload?.party) {
        setCallParticipant(normalizeCallParticipant(payload.party));
        if (payload.party.direction === 'incoming') {
          setCallState('connecting');
        }
      }

      conn.on('disconnect', () => {
        setConnection(null);
        setIsMuted(false);
      });
    };

    window.addEventListener('callAccepted', handler);

    return () => window.removeEventListener('callAccepted', handler);
  }, []);

  useEffect(() => {
    const handleDeviceStatus = (e) => {
      setDeviceStatus(e.detail?.status || 'offline');
    };

    const handleCallState = (e) => {
      const nextState = e.detail?.state || 'idle';
      setCallState(nextState);

      if (['missed', 'failed', 'ended'].includes(nextState)) {
        setCallNotice(getCallNotice(nextState));
      } else {
        setCallNotice(null);
      }
    };

    const handleCallEnded = () => {
      setConnection(null);
      setIsMuted(false);
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
    if (!callNotice) return undefined;

    const timeoutId = window.setTimeout(() => {
      setCallNotice(null);
      setCallState('idle');
      setCallParticipant(null);
    }, 2500);

    return () => window.clearTimeout(timeoutId);
  }, [callNotice]);

  useEffect(() => {
    const handleIncomingCall = (data) => {
      setCallState('incoming');
      setCallParticipant(normalizeCallParticipant({
        name: [data?.contact?.firstName, data?.contact?.lastName].filter(Boolean).join(' ').trim(),
        number: data?.from || '',
        label: data?.contact?.dba || '',
        direction: 'incoming',
      }));
    };

    const handleSocketCallStatus = (data) => {
      const mappedStatus = mapCallStatus(data?.status);
      if (mappedStatus) {
        setCallState(mappedStatus);
      }
    };

    const handleSocketCallEnded = () => {
      setCallState((prev) => (prev === 'failed' || prev === 'missed' ? prev : 'ended'));
    };

    const handleOutgoingMeta = (event) => {
      setCallParticipant(normalizeCallParticipant({
        name: event.detail?.phone || '',
        number: event.detail?.phone || '',
        label: 'Outbound call',
        direction: 'outgoing',
      }));
      setCallNotice(null);
    };

    socket.on('incomingCall', handleIncomingCall);
    socket.on('callStatus', handleSocketCallStatus);
    socket.on('callEnded', handleSocketCallEnded);
    window.addEventListener('voiceOutgoingCall', handleOutgoingMeta);

    return () => {
      socket.off('incomingCall', handleIncomingCall);
      socket.off('callStatus', handleSocketCallStatus);
      socket.off('callEnded', handleSocketCallEnded);
      window.removeEventListener('voiceOutgoingCall', handleOutgoingMeta);
    };
  }, []);

  const hangUp = () => {
    disconnectCall();
    setConnection(null);
    setCallState('ended');
  };

  const toggleMute = () => {
    if (!isMuted) {
      muteCall();
    } else {
      unmuteCall();
    }
    setIsMuted(!isMuted);
  };

  const handleAvailabilityStatusChange = async (nextStatus) => {
    if (!isAuthenticated || !authToken || isUpdatingStatus) return;

    const normalizedStatus = normalizeAvailabilityStatus(nextStatus);
    const previousStatus = availabilityStatus;
    setStatusUpdateError('');
    setIsUpdatingStatus(true);
    setAvailabilityStatus(normalizedStatus);

    try {
      const payload = await updateMyAvailabilityStatusRequest(authToken, normalizedStatus);
      const nextUser = payload?.user || null;
      if (!nextUser) {
        throw new Error('Status update did not return a user payload');
      }

      storeAuthSession({ token: authToken, user: nextUser });
      setAuthUser(nextUser);
      setAvailabilityStatus(normalizeAvailabilityStatus(nextUser.availabilityStatus || normalizedStatus));
    } catch (error) {
      console.error('Update availability status failed:', error);
      setAvailabilityStatus(previousStatus);
      setStatusUpdateError(error?.message || 'Unable to update status');
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const handleAgentChange = async (nextAgent) => {
    if (isAuthenticated) return;

    const userId = nextAgent || 'web_user';
    setAgentId(userId);
    window.localStorage?.setItem('voiceUserId', userId);
    await initVoice(userId);
  };

  const handleRetryVoice = async () => {
    if (!isAuthenticated) return;
    await initVoice(workspaceAgentId || undefined);
  };

  const handleRoleChange = (nextRole) => {
    if (authUser) return;

    const normalized = nextRole === 'agent' ? 'agent' : 'admin';
    setUserRole(normalized);
    window.localStorage?.setItem('userRole', normalized);
  };

  const handleLogin = async ({ email, password }) => {
    try {
      setAuthSubmitting(true);
      setAuthError('');

      const payload = await loginRequest({ email, password });
      const token = payload?.token || '';
      const user = payload?.user || null;

      storeAuthSession({ token, user });
      setAuthToken(token);
      setAuthUser(user);
      setUserRole(user?.role === 'agent' ? 'agent' : 'admin');
      setAvailabilityStatus(normalizeAvailabilityStatus(user?.availabilityStatus || 'online'));
      setAgentId(user?.agentId || '');
    } catch (error) {
      setAuthError(error.message || 'Login failed');
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleLogout = () => {
    clearAuthSession();
    if (socket.connected) {
      socket.disconnect();
    }
    lastRegisteredSocketIdentityRef.current = null;
    resetVoice();
    setAuthToken(null);
    setAuthUser(null);
    setAuthError('');
    setConnection(null);
    setIsMuted(false);
    setCallState('idle');
      setCallNotice(null);
      setCallParticipant(null);
      setUserRole('admin');
      setAgentStatus('offline');
      setAvailabilityStatus('online');
      setIsUpdatingStatus(false);
      setStatusUpdateError('');
      setIsUpdatingAvatar(false);
      setAvatarUpdateError('');
      setAgentId('web_user');
  };

  const handleAvatarChange = async (avatarDataUrl) => {
    if (!isAuthenticated || !authToken || isUpdatingAvatar) return;

    try {
      setIsUpdatingAvatar(true);
      setAvatarUpdateError('');

      const payload = await updateMyAvatarRequest(authToken, avatarDataUrl);
      const nextUser = payload?.user || null;

      if (!nextUser) {
        throw new Error('Avatar update did not return a user payload');
      }

      storeAuthSession({ token: authToken, user: nextUser });
      setAuthUser(nextUser);
    } catch (error) {
      console.error('Update avatar failed:', error);
      setAvatarUpdateError(error?.message || 'Unable to update avatar');
      throw error;
    } finally {
      setIsUpdatingAvatar(false);
    }
  };

  const renderProtectedLayout = (children, { adminOnly = false } = {}) => {
    if (authChecking) {
      return <div style={authLoadingStyle}>Restoring your session...</div>;
    }

    if (!isAuthenticated) {
      return <Navigate to="/login" replace />;
    }

    if (adminOnly && userRole !== 'admin') {
      return <Navigate to="/messages" replace />;
    }

    return (
      <MainLayout
        userRole={userRole}
        onRoleChange={handleRoleChange}
        roleLocked={Boolean(authUser)}
        sidebarUnreadTotals={sidebarUnreadTotals}
        authUser={authUser}
        onLogout={handleLogout}
        deviceStatus={deviceStatus}
        callState={callState}
        agentId={workspaceAgentId}
        agentStatus={resolveEffectiveAvailabilityStatus({
          connected: agentStatus === 'online',
          availabilityStatus,
        })}
        onRetryVoice={handleRetryVoice}
        availabilityStatus={availabilityStatus}
        availabilityOptions={AVAILABILITY_STATUS_OPTIONS}
        onAvailabilityStatusChange={handleAvailabilityStatusChange}
        isUpdatingStatus={isUpdatingStatus}
        statusUpdateError={statusUpdateError}
        onAvatarChange={handleAvatarChange}
        isUpdatingAvatar={isUpdatingAvatar}
        avatarUpdateError={avatarUpdateError}
      >
        {children}
      </MainLayout>
    );
  };

  return (
    <div className="App">
      {isAuthenticated ? <IncomingCallPopup /> : null}

      {isAuthenticated && callNotice ? (
        <div style={noticeStyle}>
          {callNotice}
        </div>
      ) : null}

      {isAuthenticated && shouldRenderCallOverlay({ callState, connection, callParticipant }) ? (
        <CallExperienceOverlay
          callState={callState}
          participant={callParticipant}
          isMuted={isMuted}
          onToggleMute={toggleMute}
          onHangUp={hangUp}
        />
      ) : null}

      <BrowserRouter>
        <Routes>
          <Route
            path="/login"
            element={
              authChecking ? (
                <div style={authLoadingStyle}>Restoring your session...</div>
              ) : isAuthenticated ? (
                <Navigate to="/" replace />
              ) : (
                <LoginPage
                  onLogin={handleLogin}
                  isSubmitting={authSubmitting}
                  error={authError}
                />
              )
            }
          />
          <Route
            path="/"
            element={
              renderProtectedLayout(
                userRole === 'admin' ? (
                  <Dashboard
                    agentId={workspaceAgentId}
                    onAgentChange={handleAgentChange}
                    agentSelectionLocked={authUser?.role !== 'admin'}
                  />
                ) : (
                  <Navigate to="/internal-chat" replace />
                )
              )
            }
          />
          <Route
            path="/messages"
            element={<Navigate to="/sms-mms" replace />}
          />
          <Route
            path="/internal-chat"
            element={renderProtectedLayout(
              <Messages
                currentRole={authUser?.role || userRole}
                currentUserId={workspaceAgentId}
                viewMode="internal"
                onInternalConversationsChange={syncSidebarUnreadTotals}
              />
            )}
          />
          <Route
            path="/internal-teams"
            element={renderProtectedLayout(
              <Messages
                currentRole={authUser?.role || userRole}
                currentUserId={workspaceAgentId}
                viewMode="teams"
                onInternalConversationsChange={syncSidebarUnreadTotals}
              />
            )}
          />
          <Route
            path="/sms-mms"
            element={renderProtectedLayout(
              <Messages
                currentRole={authUser?.role || userRole}
                currentUserId={workspaceAgentId}
                viewMode="customers"
              />
            )}
          />
          <Route
            path="/calls"
            element={renderProtectedLayout(<Calls />)}
          />
          <Route
            path="/users"
            element={renderProtectedLayout(
              <Users
                currentUserRole={authUser?.role || userRole}
                currentUserId={authUser?.id || ''}
              />,
              { adminOnly: true }
            )}
          />
          <Route
            path="/settings"
            element={renderProtectedLayout(
              <SettingsPage
                currentUserRole={authUser?.role || userRole}
                currentUserId={authUser?.id || ''}
              />,
              { adminOnly: true }
            )}
          />
          <Route
            path="/numbers"
            element={<Navigate to="/settings" replace />}
          />
          <Route path="/info" element={<InfoPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/terms" element={<TermsPage />} />
          <Route path="/opt-in" element={<OptInPage />} />
          <Route path="*" element={<Navigate to={isAuthenticated ? '/' : '/login'} replace />} />
        </Routes>
      </BrowserRouter>
    </div>
  );
}

const getCallNotice = (state) => {
  switch (state) {
    case 'missed':
      return 'Missed call';
    case 'failed':
      return 'Call failed';
    case 'ended':
      return 'Call ended';
    default:
      return '';
  }
};

const mapCallStatus = (status) => {
  switch (status) {
    case 'initiated':
      return 'connecting';
    case 'ringing':
      return 'ringing';
    case 'in-progress':
      return 'in-call';
    case 'busy':
    case 'failed':
      return 'failed';
    case 'no-answer':
      return 'missed';
    case 'completed':
    case 'canceled':
      return 'ended';
    default:
      return null;
  }
};

const noticeStyle = {
  position: 'fixed',
  right: '20px',
  bottom: '108px',
  zIndex: 9998,
  padding: '10px 14px',
  borderRadius: '12px',
  background: 'rgba(15, 23, 42, 0.92)',
  color: '#fff',
  boxShadow: '0 10px 24px rgba(15,23,42,0.22)',
  fontSize: '13px',
  fontWeight: 600,
};

const authLoadingStyle = {
  minHeight: '100vh',
  display: 'grid',
  placeItems: 'center',
  background: 'linear-gradient(135deg, #eef4ff 0%, #f8fafc 55%, #eef6f0 100%)',
  color: '#0f172a',
  fontSize: '15px',
  fontWeight: 600,
};

export default App;

function calculateSidebarUnreadTotals(conversations = []) {
  return (Array.isArray(conversations) ? conversations : []).reduce(
    (totals, conversation) => {
      const conversationType = String(conversation?.conversationType || conversation?.type || '').trim();
      const unread = normalizeUnreadCount(conversation?.unreadCount ?? conversation?.unread);

      if (conversationType === 'internal_dm') {
        totals.internalChat += unread;
      } else if (conversationType === 'team') {
        totals.internalTeams += unread;
      }

      return totals;
    },
    { internalChat: 0, internalTeams: 0 }
  );
}

function normalizeUnreadCount(value) {
  const count = Number(value || 0);
  return Number.isFinite(count) && count > 0 ? count : 0;
}

function shouldRenderCallOverlay({ callState, connection, callParticipant }) {
  if (callState === 'in-call') return Boolean(connection);
  if (['connecting', 'ringing'].includes(callState)) return Boolean(callParticipant);
  return false;
}

function normalizeCallParticipant(party) {
  const name = String(party?.name || '').trim();
  const number = String(party?.number || '').trim();
  const label = String(party?.label || '').trim();

  return {
    name: name || formatPhone(number) || 'Unknown caller',
    number: formatPhone(number),
    label,
    direction: party?.direction === 'incoming' ? 'incoming' : 'outgoing',
  };
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
