import { useEffect, useRef, useState, useCallback } from 'react';
import Header from './Header';
import MessageBubble from './MessageBubble';
import MessageInput from './MessageInput';
import BASE_URL from '../config/api';
import socket from '../socket';
import { startCall } from '../services/voice';

const normalize = (num) => num?.replace(/\D/g, '').slice(-10);

function ChatWindow({ chat, messages, setMessages }) {
  const listRef = useRef(null);
  const [callLogs, setCallLogs] = useState([]);

  const [callStatus, setCallStatus] = useState(null);
  const [currentCallSid, setCurrentCallSid] = useState(null);

  const safeMessages = messages || [];

  // âœ… FORMATTER (moved outside handleCall)
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
      const res = await fetch(
        `${BASE_URL}/api/calls/by-number/${chat.phone}`
      );
      const data = await res.json();
      setCallLogs(data || []);
    } catch (err) {
      console.error('âŒ Fetch call logs error:', err);
    }
  }, [chat?.phone]);

  useEffect(() => {
    fetchCalls();
  }, [fetchCalls]);

  // ðŸ”¥ STATUS (REAL TWILIO STATE)
  useEffect(() => {
    const handleStatus = (data) => {
      console.log('ðŸ“¡ CALL STATUS UPDATE:', data);

      if (currentCallSid && data.callSid !== currentCallSid) return;

      setCallStatus(data.status);

      if (
        ['completed', 'failed', 'no-answer', 'busy', 'canceled'].includes(data.status)
      ) {
        setTimeout(() => {
          setCallStatus(null);
          setCurrentCallSid(null);
        }, 1500);
      }
    };

    socket.on('callStatus', handleStatus);
    return () => socket.off('callStatus', handleStatus);
  }, [currentCallSid]);

  // ðŸ”„ REFRESH LOGS
  useEffect(() => {
    const handleCallUpdate = () => fetchCalls();

    socket.on('callStatus', handleCallUpdate);
    return () => socket.off('callStatus', handleCallUpdate);
  }, [fetchCalls]);

  // ðŸ’¬ MESSAGE REALTIME
  useEffect(() => {
    const handleNewMessage = (msg) => {
      if (!chat?.phone) return;

      const current = normalize(chat.phone);

      if (
        normalize(msg.from) === current ||
        normalize(msg.to) === current
      ) {
        setMessages((prev) => [...prev, msg]);
      }
    };

    socket.on('newMessage', handleNewMessage);
    return () => socket.off('newMessage', handleNewMessage);
  }, [chat?.phone, setMessages]);

  const mergedTimeline = [
    ...safeMessages.map((m) => ({ ...m, type: 'message' })),
    ...callLogs.map((c) => ({ ...c, type: 'call' }))
  ].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

  useEffect(() => {
    if (!listRef.current) return;
    listRef.current.scrollTop = listRef.current.scrollHeight;
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

  // âœ… REAL SOFTPHONE CALL (FIXED)
  const handleCall = async () => {
    if (callStatus === 'initiated' || callStatus === 'ringing') return;

    try {
      setCallStatus('initiated');

      const formatted = formatPhone(chat.phone);

      await startCall(formatted);

      // âŒ DO NOT force "in-progress"
      // Twilio will update it correctly via socket

    } catch (err) {
      console.error('âŒ Call failed:', err);
      setCallStatus(null);
    }
  };

  const getCallLabel = () => {
    switch (callStatus) {
      case 'initiated': return 'Calling...';
      case 'ringing': return 'Ringing...';
      case 'in-progress': return 'In Call';
      default: return 'ðŸ“ž Call';
    }
  };

  return (
    <div className="panel chat-window">

      <Header
        title={displayName}
        subtitle={
          <>
            {chat.dba && <div>DBA: {chat.dba}</div>}
            {chat.mid && <div>MID: {chat.mid}</div>}
          </>
        }
        status="Active"
        chat={chat}
        callStatus={callStatus}
        callLabel={getCallLabel()}
        onSwitchNumber={(num) => {
          window.dispatchEvent(
            new CustomEvent('switchChatNumber', { detail: num })
          );
        }}
        onCall={handleCall}
      />

      <div className="message-list" ref={listRef}>
        {mergedTimeline.map((item, index) => {

          if (item.type === 'message') {
            return <MessageBubble key={index} message={item} />;
          }

          return (
            <div
              key={index}
              style={{
                display: 'flex',
                justifyContent: 'flex-start',
                padding: '4px 10px'
              }}
            >
              <div
                style={{
                  maxWidth: '65%',
                  background: '#1e1e1e',
                  borderRadius: '12px',
                  padding: '10px',
                  fontSize: '13px',
                  border: '1px solid #2a2a2a'
                }}
              >
                <div style={{ color: '#aaa', marginBottom: '6px' }}>
                  ðŸ“ž Call {item.status}
                  {item.duration && ` â€¢ ${item.duration}s`}
                </div>

                {item.recordingUrl && (
                  <audio controls style={{ width: '200px', height: '32px' }}>
                    <source src={item.recordingUrl} type="audio/mpeg" />
                  </audio>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <MessageInput
        chatId={chat.phone}
        onMessageSent={(msg) => {
          setMessages((prev) => [...prev, msg]);
        }}
      />
    </div>
  );
}

export default ChatWindow;
