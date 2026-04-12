import { useEffect, useState } from 'react';
import { PhoneIncoming } from 'lucide-react'; // ✅ clean icon
import socket from '../socket';

function IncomingCallPopup() {
  const [call, setCall] = useState(null);
  const [contact, setContact] = useState(null);

  // INCOMING CALL
  useEffect(() => {
    socket.on('incomingCall', (data) => {
      console.log('Incoming:', data);

      setContact(data.contact || null);

      window.dispatchEvent(
        new CustomEvent('incomingCallUI', { detail: data })
      );
    });

    return () => socket.off('incomingCall');
  }, []);

  // BIND CONNECTION
  useEffect(() => {
    const handler = (e) => {
      setCall(e.detail);
    };

    window.addEventListener('incomingCallUI', handler);

    return () => {
      window.removeEventListener('incomingCallUI', handler);
    };
  }, []);

  // CLOSE POPUP WHEN CALL ENDS
  useEffect(() => {
    socket.on('callEnded', () => {
      console.log('Call ended (popup close)');
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
      <div style={title}>
        <PhoneIncoming size={16} style={{ marginRight: '6px' }} />
        Incoming Call
      </div>

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

// STYLES
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
  marginBottom: '10px',
  display: 'flex',
  alignItems: 'center'
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