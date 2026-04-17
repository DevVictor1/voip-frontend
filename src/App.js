import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import './App.css';
import MainLayout from './layout/MainLayout';
import Dashboard from './pages/Dashboard';
import CallLogs from './pages/CallLogs';
import Users from './pages/Users';
import Messages from './pages/MessagesPage';
import NumbersPage from './pages/NumbersPage';
import IncomingCallPopup from './components/IncomingCallPopup';
import socket from './socket';
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
import {
  clearAuthSession,
  fetchCurrentUser,
  getStoredAuthToken,
  getStoredAuthUser,
  loginRequest,
  storeAuthSession,
} from './services/auth';

function App() {
  const [authToken, setAuthToken] = useState(() => getStoredAuthToken());
  const [authUser, setAuthUser] = useState(() => getStoredAuthUser());
  const [authChecking, setAuthChecking] = useState(() => Boolean(getStoredAuthToken()));
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [authError, setAuthError] = useState('');
  const [connection, setConnection] = useState(null);
  const [isMuted, setIsMuted] = useState(false);
  const [onHold, setOnHold] = useState(false);
  const [deviceStatus, setDeviceStatus] = useState(() => getDeviceStatus());
  const [callState, setCallState] = useState('idle');
  const [callNotice, setCallNotice] = useState(null);
  const [userRole, setUserRole] = useState(() => {
    if (typeof window === 'undefined') return 'admin';
    const saved = window.localStorage?.getItem('userRole');
    return saved === 'agent' ? 'agent' : 'admin';
  });
  const [agentStatus, setAgentStatus] = useState(() => {
    if (typeof window === 'undefined') return 'online';
    return window.localStorage?.getItem('agentStatus') || 'online';
  });
  const [agentId, setAgentId] = useState(() => {
    if (typeof window === 'undefined') return 'web_user';
    return window.localStorage?.getItem('voiceUserId') || 'web_user';
  });

  const isAuthenticated = Boolean(authToken && authUser);

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

    if (authUser.agentId) {
      setAgentId(authUser.agentId);
    }
  }, [authUser]);

  useEffect(() => {
    if (!isAuthenticated) return;

    const userId = agentId || 'web_user';

    if (socket && userId) {
      socket.emit('registerUser', userId);
      socket.emit('agentStatus', { userId, status: agentStatus });
      console.log('Registered socket user:', userId);
    }
  }, [agentId, agentStatus, isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) return undefined;

    const startVoice = async () => {
      const userId = agentId || '';
      await initVoice(userId || undefined);
    };

    window.addEventListener('click', startVoice, { once: true });

    return () => {
      window.removeEventListener('click', startVoice);
    };
  }, [agentId, isAuthenticated]);

  useEffect(() => {
    const handler = (e) => {
      const conn = e.detail;
      setConnection(conn);
      setCallState('in-call');
      setCallNotice(null);

      conn.on('disconnect', () => {
        setConnection(null);
        setIsMuted(false);
        setOnHold(false);
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
      setOnHold(false);
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
    }, 2500);

    return () => window.clearTimeout(timeoutId);
  }, [callNotice]);

  useEffect(() => {
    socket.on('incomingCall', () => {
      setCallState('incoming');
    });

    socket.on('callStatus', (data) => {
      const mappedStatus = mapCallStatus(data?.status);
      if (mappedStatus) {
        setCallState(mappedStatus);
      }
    });

    socket.on('callEnded', () => {
      setCallState((prev) => (prev === 'failed' || prev === 'missed' ? prev : 'ended'));
    });

    return () => {
      socket.off('incomingCall');
      socket.off('callStatus');
      socket.off('callEnded');
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

  const toggleHold = () => {
    if (!connection) return;

    if (!onHold) {
      connection.mute(true);
      console.log('Call on hold (simulated)');
    } else {
      connection.mute(false);
      console.log('Call resumed');
    }

    setOnHold(!onHold);
  };

  const toggleAgentStatus = () => {
    if (!isAuthenticated) return;

    const userId = agentId || 'web_user';
    const nextStatus = agentStatus === 'online' ? 'offline' : 'online';
    setAgentStatus(nextStatus);
    window.localStorage?.setItem('agentStatus', nextStatus);
    if (socket && userId) {
      socket.emit('agentStatus', { userId, status: nextStatus });
    }
  };

  const handleAgentChange = async (nextAgent) => {
    if (!isAuthenticated) return;

    const userId = nextAgent || 'web_user';
    setAgentId(userId);
    window.localStorage?.setItem('voiceUserId', userId);
    await initVoice(userId);
  };

  const handleRetryVoice = async () => {
    if (!isAuthenticated) return;
    await initVoice(agentId || undefined);
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
      if (user?.agentId) {
        setAgentId(user.agentId);
      }
    } catch (error) {
      setAuthError(error.message || 'Login failed');
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleLogout = () => {
    clearAuthSession();
    resetVoice();
    setAuthToken(null);
    setAuthUser(null);
    setAuthError('');
    setConnection(null);
    setIsMuted(false);
    setOnHold(false);
    setCallState('idle');
    setCallNotice(null);
    setUserRole('admin');
    setAgentId('web_user');
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
        authUser={authUser}
        onLogout={handleLogout}
        deviceStatus={deviceStatus}
        callState={callState}
        agentId={agentId}
        agentStatus={agentStatus}
        onRetryVoice={handleRetryVoice}
        onToggleAgentStatus={toggleAgentStatus}
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

      {isAuthenticated && connection && (
        <div style={callStyle}>
          <div style={{ fontWeight: 'bold', marginBottom: '10px' }}>
            {getCallLabel(callState)}
          </div>

          <div style={callMetaStyle}>
            Device: {getDeviceLabel(deviceStatus)}
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={toggleMute} style={btn}>
              {isMuted ? 'Unmute' : 'Mute'}
            </button>

            <button onClick={toggleHold} style={btn}>
              {onHold ? 'Resume' : 'Hold'}
            </button>

            <button onClick={hangUp} style={endBtn}>
              End
            </button>
          </div>
        </div>
      )}

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
                    agentId={agentId}
                    onAgentChange={handleAgentChange}
                  />
                ) : (
                  <Navigate to="/messages" replace />
                )
              )
            }
          />
          <Route
            path="/messages"
            element={renderProtectedLayout(<Messages />)}
          />
          <Route
            path="/calls"
            element={renderProtectedLayout(<CallLogs />)}
          />
          <Route
            path="/users"
            element={renderProtectedLayout(<Users />, { adminOnly: true })}
          />
          <Route
            path="/numbers"
            element={renderProtectedLayout(<NumbersPage />, { adminOnly: true })}
          />
          <Route path="/opt-in" element={<OptInPage />} />
          <Route path="*" element={<Navigate to={isAuthenticated ? '/' : '/login'} replace />} />
        </Routes>
      </BrowserRouter>
    </div>
  );
}

const getDeviceLabel = (status) => {
  switch (status) {
    case 'initializing':
      return 'Connecting';
    case 'ready':
      return 'Ready';
    case 'error':
      return 'Error';
    default:
      return 'Offline';
  }
};

const getCallLabel = (state) => {
  switch (state) {
    case 'incoming':
      return 'Incoming call';
    case 'ringing':
      return 'Ringing';
    case 'connecting':
      return 'Connecting';
    case 'in-call':
      return 'In Call';
    case 'missed':
      return 'Missed call';
    case 'failed':
      return 'Call failed';
    case 'ended':
      return 'Call ended';
    default:
      return 'In Call';
  }
};

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

const callStyle = {
  position: 'fixed',
  bottom: '20px',
  right: '20px',
  background: 'linear-gradient(135deg, #1e1e1e, #2a2a2a)',
  color: '#fff',
  padding: '20px',
  borderRadius: '12px',
  zIndex: 9999,
  boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
  minWidth: '220px',
};

const callMetaStyle = {
  fontSize: '12px',
  color: 'rgba(255,255,255,0.75)',
  marginBottom: '12px',
};

const btn = {
  padding: '8px 12px',
  borderRadius: '6px',
  border: 'none',
  background: '#333',
  color: '#fff',
  cursor: 'pointer',
};

const endBtn = {
  ...btn,
  background: '#e53935',
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
