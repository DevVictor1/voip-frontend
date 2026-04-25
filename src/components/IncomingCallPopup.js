import { PhoneIncoming, PhoneOff, Phone } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import socket from '../socket';

function IncomingCallPopup() {
  const [call, setCall] = useState(null);
  const [contact, setContact] = useState(null);
  const [incomingNumber, setIncomingNumber] = useState('');
  const [callState, setCallState] = useState('incoming');

  const closePopup = (nextState = 'ended') => {
    setCall(null);
    setContact(null);
    setIncomingNumber('');
    setCallState(nextState);
  };

  useEffect(() => {
    const handleIncoming = (data) => {
      console.log('Incoming:', data);
      setContact(data.contact || null);
      setIncomingNumber(data.from || '');
      setCallState('incoming');
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

  const name = useMemo(() => {
    const fullName = contact
      ? `${contact.firstName || ''} ${contact.lastName || ''}`.trim()
      : '';

    return fullName || formatPhone(incomingNumber) || 'Unknown Caller';
  }, [contact, incomingNumber]);

  const subtitle = useMemo(() => {
    const formatted = formatPhone(incomingNumber);
    if (formatted && formatted !== name) return formatted;
    if (contact?.dba) return contact.dba;
    return '';
  }, [contact?.dba, incomingNumber, name]);

  const initials = getInitials(name);

  if (!call) return null;

  return (
    <div className="incoming-call-overlay">
      <div className="incoming-call-card">
        <div className="incoming-call-header">
          <div className="incoming-call-avatar">{initials}</div>
          <div className="incoming-call-copy">
            <div className="incoming-call-eyebrow">
              <PhoneIncoming size={15} />
              {getPopupLabel(callState)}
            </div>
            <div className="incoming-call-name">{name}</div>
            {subtitle ? <div className="incoming-call-subtitle">{subtitle}</div> : null}
          </div>
        </div>

        {contact?.mid ? <div className="incoming-call-meta">MID {contact.mid}</div> : null}

        <div className="incoming-call-actions">
          <button
            type="button"
            className="incoming-call-action is-decline"
            onClick={() => {
              if (typeof call.reject === 'function') {
                call.reject();
              }
              setCall(null);
            }}
          >
            <PhoneOff size={18} />
            <span>Decline</span>
          </button>

          <button
            type="button"
            className="incoming-call-action is-accept"
            onClick={() => {
              setCallState('connecting');
              if (typeof call.accept === 'function') {
                call.accept();
              }

              window.dispatchEvent(
                new CustomEvent('callAccepted', {
                  detail: {
                    connection: call,
                    party: {
                      name,
                      number: formatPhone(incomingNumber),
                      label: contact?.dba || '',
                      direction: 'incoming',
                    },
                  },
                })
              );

              setCall(null);
            }}
          >
            <Phone size={18} />
            <span>Answer</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function getInitials(value) {
  const words = String(value || '')
    .split(/\s+/)
    .filter(Boolean);

  if (!words.length) return 'UC';

  return words
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
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

  if (text.startsWith('+')) {
    return text;
  }

  return text;
}

const getPopupLabel = (state) => {
  switch (state) {
    case 'connecting':
      return 'Answering';
    case 'ringing':
      return 'Incoming Call';
    case 'in-call':
      return 'Connected';
    default:
      return 'Incoming Call';
  }
};

export default IncomingCallPopup;
