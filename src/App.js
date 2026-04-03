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

function App() {
  const [connection, setConnection] = useState(null);
  const [isMuted, setIsMuted] = useState(false);
  const [onHold, setOnHold] = useState(false);

  // 🔥 INIT VOICE
  useEffect(() => {
    const startVoice = async () => {
      await initVoice();
    };

    window.addEventListener('click', startVoice, { once: true });

    return () => {
      window.removeEventListener('click', startVoice);
    };
  }, []);

  // 🔥 LISTEN FOR ACCEPTED CALL
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
      console.log('📡 Incoming (socket):', data);
    });

    return () => socket.off('incomingCall');
  }, []);

  // 🔴 END
  const hangUp = () => {
    disconnectCall();
    setConnection(null);
  };

  // 🔇 MUTE
  const toggleMute = () => {
    if (!isMuted) {
      muteCall();
    } else {
      unmuteCall();
    }
    setIsMuted(!isMuted);
  };

  // ⏸ HOLD (enhanced)
  const toggleHold = () => {
  if (!connection) return;

  if (!onHold) {
    // 🔇 Mute mic (user cannot speak)
    connection.mute(true);

    console.log('⏸ Call on hold (simulated)');
  } else {
    connection.mute(false);

    console.log('▶️ Call resumed');
  }

  setOnHold(!onHold);
};

  return (
    <div className="App">

      {/* 🔥 MAIN POPUP SYSTEM */}
      <IncomingCallPopup />

      {/* 🟢 ACTIVE CALL UI */}
      {connection && (
        <div style={callStyle}>
          <div style={{ fontWeight: 'bold', marginBottom: '10px' }}>
            🟢 In Call
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={toggleMute} style={btn}>
              {isMuted ? 'Unmute' : 'Mute'}
            </button>

            <button onClick={toggleHold} style={btn}>
              {onHold ? 'Resume' : 'Mute (Hold)'}
            </button>

            <button onClick={hangUp} style={endBtn}>
              End
            </button>
          </div>
        </div>
      )}

      <BrowserRouter>
        <MainLayout>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/messages" element={<Messages />} />
            <Route path="/calls" element={<CallLogs />} />
            <Route path="/users" element={<Users />} />
          </Routes>
        </MainLayout>
      </BrowserRouter>
    </div>
  );
}

// 🎨 STYLES (UPGRADED)
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