import { useEffect, useRef, useState } from 'react';
import Header from './Header';
import MessageBubble from './MessageBubble';
import MessageInput from './MessageInput';
import BASE_URL from '../config/api';
import socket from '../socket';

function ChatWindow({ chat, messages, setMessages }) {
  const listRef = useRef(null);
  const safeMessages = messages || [];

  const [calling, setCalling] = useState(false);
  const [callStatus, setCallStatus] = useState('');
  const [callDuration, setCallDuration] = useState(0);
  const [callSummary, setCallSummary] = useState('');
  const callStartRef = useRef(null);
  const callTimerRef = useRef(null);
  const summaryTimeoutRef = useRef(null);

  // 🔥 AUTO SCROLL
  useEffect(() => {
    if (!listRef.current) return;

    listRef.current.scrollTo({
      top: listRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [safeMessages]);

  useEffect(() => {
    if (callStatus === 'in-progress') {
      if (!callStartRef.current) {
        callStartRef.current = Date.now();
      }

      if (callTimerRef.current) {
        clearInterval(callTimerRef.current);
      }

      callTimerRef.current = setInterval(() => {
        const elapsed =
          Math.floor((Date.now() - callStartRef.current) / 1000);
        setCallDuration(elapsed);
      }, 1000);
    } else if (callTimerRef.current) {
      clearInterval(callTimerRef.current);
      callTimerRef.current = null;
    }

    return () => {
      if (callTimerRef.current) {
        clearInterval(callTimerRef.current);
        callTimerRef.current = null;
      }
    };
  }, [callStatus]);

  useEffect(() => {
    return () => {
      if (summaryTimeoutRef.current) {
        clearTimeout(summaryTimeoutRef.current);
      }
    };
  }, []);

  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const formatSummaryDuration = (seconds) => {
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return secs ? `${mins}m ${secs}s` : `${mins}m`;
  };

  // 📞 CALL FUNCTION
  const handleCall = async () => {
    if (!chat?.phone || calling) return;

    setCalling(true);
    setCallStatus('initiated');
    setCallSummary('');
    setCallDuration(0);
    callStartRef.current = null;

    try {
      const res = await fetch(`${BASE_URL}/api/calls/call`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: chat.phone }),
      });

      const data = await res.json();

      console.log('📞 Call started:', data.callSid);

    } catch (err) {
      console.error('❌ Call error:', err);
      setCallStatus('completed');
      setCallSummary('Call failed');
      setCalling(false);
    }
  };

  // 🔥 LIVE STATUS LISTENER
  useEffect(() => {
    socket.on('callStatus', (data) => {
      console.log('📡 LIVE STATUS:', data);

      if (data.status === 'initiated') setCallStatus('initiated');
      if (data.status === 'ringing') setCallStatus('ringing');
      if (data.status === 'in-progress') setCallStatus('in-progress');
      if (data.status === 'completed') {
        const durationSeconds = callStartRef.current
          ? Math.floor((Date.now() - callStartRef.current) / 1000)
          : 0;

        setCallStatus('completed');
        setCalling(false);
        setCallDuration(durationSeconds);
        setCallSummary(
          `Call ended • Duration: ${formatSummaryDuration(durationSeconds)}`
        );

        if (summaryTimeoutRef.current) {
          clearTimeout(summaryTimeoutRef.current);
        }
        summaryTimeoutRef.current = setTimeout(() => {
          setCallSummary('');
        }, 5000);
      }
    });

    return () => socket.off('callStatus');
  }, []);

  const endCall = () => {
    const durationSeconds = callStartRef.current
      ? Math.floor((Date.now() - callStartRef.current) / 1000)
      : 0;

    setCallStatus('completed');
    setCalling(false);
    setCallDuration(durationSeconds);
    setCallSummary(
      `Call ended • Duration: ${formatSummaryDuration(durationSeconds)}`
    );

    if (summaryTimeoutRef.current) {
      clearTimeout(summaryTimeoutRef.current);
    }
    summaryTimeoutRef.current = setTimeout(() => {
      setCallSummary('');
    }, 5000);
  };

  // ❌ NO CHAT
  if (!chat) {
    return (
      <div className="panel chat-window">
        <div className="message-list">
          <div className="empty-state">
            <div className="empty-title">Select a contact</div>
            <div className="empty-subtitle">
              Choose a contact to start chatting.
            </div>
          </div>
        </div>
      </div>
    );
  }

  const subtitle = `SMS • ${chat.phone}`;
  const isCallActive =
    callStatus === 'initiated' ||
    callStatus === 'ringing' ||
    callStatus === 'in-progress';

  const callBadge = callStatus ? (
    <span className={`call-status-badge is-${callStatus}`}>
      {callStatus.replace('-', ' ')}
    </span>
  ) : null;

  const callMeta =
    callStatus === 'in-progress'
      ? `Call live • ${formatDuration(callDuration)}`
      : callSummary;

  return (
    <div className="panel chat-window">

      {/* 🔥 HEADER */}
      <Header
        title={chat.phone}
        subtitle={subtitle}
        status="Active"
        badge={callBadge}
        meta={callMeta}
        actions={
          <>
            <button
              onClick={handleCall}
              disabled={calling}
              type="button"
              className="call-btn"
            >
              📞 Call
            </button>
            {isCallActive && (
              <button
                onClick={endCall}
                type="button"
                className="end-call-btn"
              >
                End Call
              </button>
            )}
          </>
        }
      />

      {/* 💬 MESSAGES */}
      <div className="message-list" ref={listRef}>
        {safeMessages.length === 0 ? (
          <div className="empty-state">
            <div className="empty-title">Start a conversation</div>
          </div>
        ) : (
          safeMessages.map((message, index) => (
            <MessageBubble key={index} message={message} />
          ))
        )}
      </div>

      {/* ✉️ INPUT */}
      <MessageInput
        chatId={chat.phone}
        onMessageSent={(newMessage) => {
          setMessages((prev) => [...(prev || []), newMessage]);
        }}
      />
    </div>
  );
}

export default ChatWindow;
