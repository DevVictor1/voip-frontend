import { useEffect, useState } from 'react';
import socket from '../socket';

function IncomingCallPopup() {
  const [call, setCall] = useState(null);
  const [contact, setContact] = useState(null);

  // ðŸ”¥ INCOMING CALL
  useEffect(() => {
    socket.on('incomingCall', (data) => {
      console.log('ðŸ“¡ Incoming:', data);

      setContact(data.contact || null);

      window.dispatchEvent(
        new CustomEvent('incomingCallUI', { detail: data })
      );
    });

    return () => socket.off('incomingCall');
  }, []);

  // ðŸ”¥ BIND CONNECTION
  useEffect(() => {
    const handler = (e) => {
      setCall(e.detail);
    };

    window.addEventListener('incomingCallUI', handler);

    return () => {
      window.removeEventListener('incomingCallUI', handler);
    };
  }, []);

  // ðŸ”¥ CLOSE POPUP WHEN CALL ENDS (CRITICAL FIX)
  useEffect(() => {
    socket.on('callEnded', (data) => {
      console.log('ðŸ”´ Call ended (popup close)');
      setCall(null);
      setContact(null);
    });

    return () => socket.off('callEnded');
  }, []);

  if (!call) return null;

  const name = contact
    ? `${contact.firstName || ''} ${contact.lastName || ''}`.trim()
    : 'Unknown Caller';

  return (
    <div style={style}>
      <div style={title}>ðŸ“ž Incoming Call</div>

      <div style={nameStyle}>{name}</div>

      {contact?.dba && (
        <div style={sub}>DBA: {contact.dba}</div>
      )}

      {contact?.mid && (
        <div style={sub}>MID: {contact.mid}</div>
      )}

      <div style={btnRow}>
        <button
          onClick={() => {
            call.accept();

            window.dispatchEvent(
              new CustomEvent('callAccepted', { detail: call })
            );

            setCall(null);
          }}
          style={acceptBtn}
        >
          Accept
        </button>

        <button
          onClick={() => {
            call.reject();
            setCall(null);
          }}
          style={rejectBtn}
        >
          Reject
        </button>
      </div>
    </div>
  );
}

// ðŸŽ¨ BETTER UI
const style = {
  position: 'fixed',
  bottom: '20px',
  right: '20px',
  background: 'linear-gradient(135deg, #1c1c1c, #2a2a2a)',
  color: '#fff',
  padding: '20px',
  borderRadius: '12px',
  zIndex: 9999,
  minWidth: '260px',
  boxShadow: '0 10px 30px rgba(0,0,0,0.5)'
};

const title = {
  fontWeight: 'bold',
  marginBottom: '10px'
};

const nameStyle = {
  fontSize: '16px',
  marginBottom: '5px'
};

const sub = {
  fontSize: '13px',
  opacity: 0.7
};

const btnRow = {
  marginTop: '15px',
  display: 'flex',
  gap: '10px'
};

const acceptBtn = {
  flex: 1,
  padding: '8px',
  background: '#4caf50',
  border: 'none',
  color: '#fff',
  borderRadius: '6px',
  cursor: 'pointer'
};

const rejectBtn = {
  flex: 1,
  padding: '8px',
  background: '#e53935',
  border: 'none',
  color: '#fff',
  borderRadius: '6px',
  cursor: 'pointer'
};

export default IncomingCallPopup;
