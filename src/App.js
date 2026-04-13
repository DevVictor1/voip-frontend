import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { useEffect, useState } from 'react';
import './App.css';
import MainLayout from './layout/MainLayout';
import Dashboard from './pages/Dashboard';
import CallLogs from './pages/CallLogs';
import Users from './pages/Users';
import Messages from './pages/MessagesPage';
import IncomingCallPopup from './components/IncomingCallPopup';
import socket from './socket';
import {
  initVoice,
  muteCall,
  unmuteCall,
  disconnectCall
} from './services/voice';
import OptInPage from './pages/OptInPage';

function App() {
  const [connection, setConnection] = useState(null);
  const [isMuted, setIsMuted] = useState(false);
  const [onHold, setOnHold] = useState(false);

  // INIT VOICE
  useEffect(() => {
    const startVoice = async () => {
      const userId = window.localStorage?.getItem('voiceUserId') || '';
      await initVoice(userId || undefined);
    };

    window.addEventListener('click', startVoice, { once: true });

    return () => {
      window.removeEventListener('click', startVoice);
    };
  }, []);

  // LISTEN FOR ACCEPTED CALL
  useEffect(() => {
    const handler = (e) => {
      const conn = e.detail;
      setConnection(conn);

      conn.on('disconnect', () => {
        setConnection(null);
        setIsMuted(false);
        setOnHold(false);
      });
    };

    window.addEventListener('callAccepted', handler);

    return () => window.removeEventListener('callAccepted', handler);
  }, []);

  // SOCKET (optional)
  useEffect(() => {
    socket.on('incomingCall', (data) => {
      console.log('Incoming (socket):', data);
    });

    return () => socket.off('incomingCall');
  }, []);

  // END CALL
  const hangUp = () => {
    disconnectCall();
    setConnection(null);
  };

  // MUTE
  const toggleMute = () => {
    if (!isMuted) {
      muteCall();
    } else {
      unmuteCall();
    }
    setIsMuted(!isMuted);
  };

  // HOLD
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

  return (
    <div className="App">

      {/* MAIN POPUP SYSTEM */}
      <IncomingCallPopup />

      {/* ACTIVE CALL UI */}
      {connection && (
        <div style={callStyle}>
          <div style={{ fontWeight: 'bold', marginBottom: '10px' }}>
            In Call
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

        {/* Pages WITH layout */}
        <Routes>
          <Route path="/" element={<MainLayout><Dashboard /></MainLayout>} />
          <Route path="/messages" element={<MainLayout><Messages /></MainLayout>} />
          <Route path="/calls" element={<MainLayout><CallLogs /></MainLayout>} />
          <Route path="/users" element={<MainLayout><Users /></MainLayout>} />

          {/* Opt-in WITHOUT layout */}
          <Route path="/opt-in" element={<OptInPage />} />
        </Routes>

      </BrowserRouter>
    </div>
  );
}

// STYLES
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
  minWidth: '220px'
};

const btn = {
  padding: '8px 12px',
  borderRadius: '6px',
  border: 'none',
  background: '#333',
  color: '#fff',
  cursor: 'pointer'
};

const endBtn = {
  ...btn,
  background: '#e53935'
};

export default App;
