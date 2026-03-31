import { useEffect, useRef } from 'react';
import Header from './Header';
import MessageBubble from './MessageBubble';
import MessageInput from './MessageInput';
import BASE_URL from '../config/api';

function ChatWindow({ chat, messages, setMessages }) {
  const listRef = useRef(null);
  const safeMessages = messages || [];

  // 🔥 AUTO SCROLL
  useEffect(() => {
    if (!listRef.current) return;

    listRef.current.scrollTo({
      top: listRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [safeMessages]);

  // 📞 CALL FUNCTION
  const handleCall = async () => {
    if (!chat?.phone) return;

    try {
      console.log('📞 Calling:', chat.phone);

      const res = await fetch(`${BASE_URL}/api/calls/call`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: chat.phone }),
      });

      const data = await res.json();

      console.log('📞 Call response:', data);

      alert(`📞 Calling ${chat.phone}`);

    } catch (err) {
      console.error('❌ Call error:', err);
      alert('Call failed');
    }
  };

  // ❌ NO CHAT SELECTED
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

  return (
    <div className="panel chat-window">
      {/* 🔥 HEADER + CALL BUTTON */}
      <Header
        title={chat.phone}
        subtitle={subtitle}
        status="Active"
        actions={(
          <button
            className="call-btn"
            type="button"
            onClick={handleCall}
          >
            📞 Call
          </button>
        )}
      />

      {/* 🔥 MESSAGE LIST */}
      <div className="message-list" ref={listRef}>
        {safeMessages.length === 0 ? (
          <div className="empty-state">
            <div className="empty-title">Start a conversation</div>
            <div className="empty-subtitle">
              Send a message to begin chatting.
            </div>
          </div>
        ) : (
          safeMessages.map((message, index) => (
            <MessageBubble key={index} message={message} />
          ))
        )}
      </div>

      {/* 🔥 INPUT */}
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
