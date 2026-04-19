import { useEffect, useState } from 'react';
import { PhoneIncoming } from 'lucide-react';
import socket from '../socket';

function IncomingCallPopup() {
  const [call, setCall] = useState(null);
  const [contact, setContact] = useState(null);
  const [callState, setCallState] = useState('incoming');
  const [notice, setNotice] = useState(null);

  const closePopup = (nextState = 'ended') => {
    setCall(null);
    setContact(null);
    setCallState(nextState);
    setNotice(null);
  };

  useEffect(() => {
    const handleIncoming = (data) => {
      console.log('Incoming:', data);
      setContact(data.contact || null);
      setCallState('incoming');
      setNotice(null);
    };

    socket.on('incomingCall', handleIncoming);
    return () => socket.off('incomingCall', handleIncoming);
  }, []);

  useEffect(() => {
    const handler = (e) => {
      setCall(e.detail);
    };

    window.addEventListener('incomingCallUI', handler);
    return () => {
      window.removeEventListener('incomingCallUI', handler);
    };
  }, []);

  useEffect(() => {
    const handleEnded = () => {
      console.log('Call ended (popup close)');
      closePopup('ended');
    };

    socket.on('callEnded', handleEnded);
    window.addEventListener('callEnded', handleEnded);
    return () => {
      socket.off('callEnded', handleEnded);
      window.removeEventListener('callEnded', handleEnded);
    };
  }, []);

  useEffect(() => {
    const handleState = (e) => {
      const nextState = e.detail?.state || 'incoming';
      setCallState(nextState);

      if (nextState === 'failed') {
        closePopup('failed');
        return;
      }

      if (nextState === 'missed') {
        closePopup('missed');
        return;
      }

      if (nextState === 'ended') {
        closePopup('ended');
      }
    };

    window.addEventListener('voiceCallState', handleState);
    return () => window.removeEventListener('voiceCallState', handleState);
  }, []);

  useEffect(() => {
    if (!notice) return undefined;

    const timeoutId = window.setTimeout(() => {
      setNotice(null);
    }, 2200);

    return () => window.clearTimeout(timeoutId);
  }, [notice]);

  const name = contact
    ? `${contact.firstName || ''} ${contact.lastName || ''}`.trim()
    : 'Unknown Caller';

  const initials = !name || name === 'Unknown Caller'
    ? 'UC'
    : name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('');

  if (!call) return null;

  return (
    <div style={style}>
      <div style={titleRow}>
        <div style={avatar}>{initials}</div>
        <div>
          <div style={title}>
            <PhoneIncoming size={15} style={{ marginRight: '6px' }} />
            {getPopupLabel(callState)}
          </div>
          <div style={nameStyle}>{name}</div>
        </div>
      </div>

      {contact?.dba && (
        <div style={sub}>DBA: {contact.dba}</div>
      )}

      {contact?.mid && (
        <div style={sub}>MID: {contact.mid}</div>
      )}

      {notice ? <div style={noticeStyle}>{notice}</div> : null}

      <div style={btnRow}>
        <button
          onClick={() => {
            setCallState('connecting');
            if (typeof call.accept === 'function') {
              call.accept();
            }

            window.dispatchEvent(
              new CustomEvent('callAccepted', { detail: call })
            );

            setCall(null);
          }}
          style={acceptBtn}
        >
          Answer
        </button>

        <button
          onClick={() => {
            if (typeof call.reject === 'function') {
              call.reject();
            }
            setCall(null);
          }}
          style={rejectBtn}
        >
          Decline
        </button>
      </div>
    </div>
  );
}

const style = {
  position: 'fixed',
  bottom: '20px',
  right: '20px',
  background: '#ffffff',
  color: '#0f172a',
  padding: '18px',
  borderRadius: '18px',
  zIndex: 9999,
  width: 'min(320px, calc(100vw - 24px))',
  border: '1px solid rgba(148, 163, 184, 0.2)',
  boxShadow: '0 18px 40px rgba(15,23,42,0.18)'
};

const titleRow = {
  display: 'flex',
  gap: '12px',
  alignItems: 'center',
  marginBottom: '10px'
};

const avatar = {
  width: '42px',
  height: '42px',
  borderRadius: '14px',
  background: 'linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%)',
  color: '#1d4ed8',
  display: 'grid',
  placeItems: 'center',
  fontSize: '14px',
  fontWeight: 700,
  flexShrink: 0
};

const title = {
  fontWeight: 700,
  fontSize: '12px',
  color: '#475569',
  display: 'flex',
  alignItems: 'center',
  textTransform: 'uppercase',
  letterSpacing: '0.08em'
};

const nameStyle = {
  fontSize: '17px',
  fontWeight: 700,
  marginTop: '4px'
};

const sub = {
  fontSize: '13px',
  color: '#64748b',
  marginTop: '4px'
};

const btnRow = {
  marginTop: '15px',
  display: 'flex',
  gap: '10px'
};

const acceptBtn = {
  flex: 1,
  minHeight: '42px',
  padding: '10px 12px',
  background: 'linear-gradient(135deg, #2563eb 0%, #3b82f6 100%)',
  border: 'none',
  color: '#fff',
  borderRadius: '12px',
  fontWeight: 700,
  cursor: 'pointer'
};

const rejectBtn = {
  flex: 1,
  minHeight: '42px',
  padding: '10px 12px',
  background: '#fff5f5',
  border: '1px solid #fecaca',
  color: '#b91c1c',
  borderRadius: '12px',
  fontWeight: 700,
  cursor: 'pointer'
};

const noticeStyle = {
  marginTop: '12px',
  padding: '8px 10px',
  borderRadius: '10px',
  background: '#f8fafc',
  color: '#475569',
  fontSize: '12px',
  fontWeight: 600
};

const getPopupLabel = (state) => {
  switch (state) {
    case 'connecting':
      return 'Connecting...';
    case 'ringing':
      return 'Ringing';
    case 'in-call':
      return 'In Call';
    default:
      return 'Incoming Call';
  }
};

export default IncomingCallPopup;
