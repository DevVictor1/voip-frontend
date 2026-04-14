import { useEffect, useRef, useState, useCallback } from 'react';
import { Phone } from 'lucide-react';
import Header from './Header';
import MessageBubble from './MessageBubble';
import MessageInput, { sendMessageRequest } from './MessageInput';
import BASE_URL from '../config/api';
import socket from '../socket';
import { startCall } from '../services/voice';

const normalize = (num) => num?.replace(/\D/g, '').slice(-10);

function ChatWindow({
  chat,
  messages,
  setMessages,
  onSwitchNumber,
  onAssignContact,
  onBack,
  showBack
}) {
  const bottomRef = useRef(null);
  const [callLogs, setCallLogs] = useState([]);
  const [callStatus, setCallStatus] = useState(null);
  const [currentCallSid, setCurrentCallSid] = useState(null);

  const safeMessages = messages || [];

  const formatPhone = (num) => {
    if (!num) return '';

    let cleaned = num.replace(/\D/g, '');

    if (num.startsWith('+')) return num;

    if (cleaned.length === 11 && cleaned.startsWith('0')) {
      return '+234' + cleaned.slice(1);
    }

    if (cleaned.length === 10 && /^[789]/.test(cleaned)) {
      return '+234' + cleaned;
    }

    if (cleaned.length === 10) {
      return '+1' + cleaned;
    }

    return '+' + cleaned;
  };

  const fetchCalls = useCallback(async () => {
    if (!chat?.phone) return;

    try {
      const res = await fetch(`${BASE_URL}/api/calls/by-number/${chat.phone}`);
      const data = await res.json();
      setCallLogs(data || []);
    } catch (err) {
      console.error('Fetch call logs error:', err);
    }
  }, [chat?.phone]);

  useEffect(() => {
    fetchCalls();
  }, [fetchCalls]);

  useEffect(() => {
    const handleStatus = (data) => {
      if (currentCallSid && data.callSid !== currentCallSid) return;

      setCallStatus(data.status);

      if (['completed', 'failed', 'no-answer', 'busy', 'canceled'].includes(data.status)) {
        setTimeout(() => {
          setCallStatus(null);
          setCurrentCallSid(null);
        }, 1500);
      }
    };

    socket.on('callStatus', handleStatus);
    return () => socket.off('callStatus', handleStatus);
  }, [currentCallSid]);

  useEffect(() => {
    socket.on('callStatus', fetchCalls);
    return () => socket.off('callStatus', fetchCalls);
  }, [fetchCalls]);

  const mergedTimeline = [
    ...safeMessages.map((m) => ({ ...m, type: 'message' })),
    ...callLogs.map((c) => ({ ...c, type: 'call' }))
  ].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [mergedTimeline]);

  if (!chat) {
    return (
      <div className="panel chat-window">
        <div className="message-list">
          <div className="empty-state">
            <div className="empty-title">Select a contact</div>
          </div>
        </div>
      </div>
    );
  }

  const displayName =
    chat.firstName || chat.lastName
      ? `${chat.firstName || ''} ${chat.lastName || ''}`.trim()
      : chat.phone;

  const handleCall = async () => {
    if (callStatus === 'initiated' || callStatus === 'ringing') return;

    try {
      setCallStatus('initiated');
      const formatted = formatPhone(chat.phone);
      await startCall(formatted);
    } catch (err) {
      console.error('Call failed:', err);
      setCallStatus(null);
    }
  };

  const handleRetry = async (message) => {
    if (!message || !message.body || !chat?.phone) return;

    const retryTime = new Date().toISOString();
    setMessages((prev) =>
      prev.map((m) =>
        m._id === message._id
          ? { ...m, status: 'sending', createdAt: retryTime }
          : m
      )
    );

    try {
      const res = await sendMessageRequest(
        chat.phone,
        message.body,
        message.media?.[0]
      );
      if (!res) throw new Error('Retry failed');

      setMessages((prev) =>
        prev.map((m) =>
          m._id === message._id
            ? { ...res }
            : m
        )
      );
    } catch (err) {
      console.error('Retry failed:', err);
      setMessages((prev) =>
        prev.map((m) =>
          m._id === message._id
            ? { ...m, status: 'failed' }
            : m
        )
      );
    }
  };

  const getCallLabel = () => {
    switch (callStatus) {
      case 'initiated': return 'Calling...';
      case 'ringing': return 'Ringing...';
      case 'in-progress': return 'In Call';
      default: return 'Call';
    }
  };

  return (
    <div className="panel chat-window">

      <Header
        title={displayName}
        status="Active"
        chat={chat}
        callStatus={callStatus}
        callLabel={getCallLabel()}
        onCall={handleCall}
        onSwitchNumber={onSwitchNumber}
        onAssignContact={onAssignContact}
        onBack={onBack}
        showBack={showBack}
      />

      <div className="chat-messages-container">
        <div className="message-list">
          {mergedTimeline.map((item, index) => {

            if (item.type === 'message') {
              return <MessageBubble key={index} message={item} onRetry={handleRetry} />;
            }

            // ✅ FIXED CALL UI
            const isOutbound =
  normalize(item.from) === normalize(chat.phone);

            return (
              <div
                key={index}
                style={{
                  display: 'flex',
                  justifyContent: isOutbound ? 'flex-end' : 'flex-start',
                  padding: '4px 10px'
                }}
              >
                <div
                  style={{
                    maxWidth: '65%',
                    background: isOutbound ? '#1d9bf0' : '#1e1e1e',
                    color: '#fff',
                    borderRadius: '12px',
                    padding: '10px',
                    fontSize: '13px'
                  }}
                >
                  <div style={{ marginBottom: '6px', opacity: 0.8 }}>
                    <Phone size={14} style={{ marginRight: '5px' }} />
                    Call {item.status}
                    {item.duration ? ` - ${item.duration}s` : ''}
                  </div>

                  {item.recordingSid && (
                    <audio controls style={{ width: '200px', height: '32px' }}>
                      <source
                        src={`${process.env.REACT_APP_API_URL}/api/recordings/${item.recordingSid}`}
                        type="audio/mpeg"
                      />
                    </audio>
                  )}
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>
      </div>

      <MessageInput
        chatId={chat.phone}
        setMessages={setMessages}
        onMessageSent={(msg) => {
          setMessages((prev) => {
            const exists = prev.find(
              (m) => m._id === msg._id || m.sid === msg.sid
            );
            if (exists) return prev;
            return [...prev, msg];
          });
        }}
      />
    </div>
  );
}

export default ChatWindow;
