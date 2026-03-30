import { useEffect, useRef } from 'react';
import Header from './Header';
import MessageBubble from './MessageBubble';
import MessageInput from './MessageInput';

function ChatWindow({ chat, messages, setMessages }) {
  const listRef = useRef(null);

  // ✅ FIX: define BEFORE return
  const safeMessages = messages || [];

  useEffect(() => {
    if (!listRef.current) return;

    listRef.current.scrollTo({
      top: listRef.current.scrollHeight,
      behavior: 'smooth'
    });
  }, [safeMessages, chat?.phone]);

  // ✅ HANDLE NO CHAT
  if (!chat) {
    return (
      <div className="panel chat-window">
        <div className="message-list">
          <div className="empty-state">
            <div className="empty-title">Select a conversation</div>
            <div className="empty-subtitle">
              Choose a contact on the left to view the conversation.
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ✅ FIX HEADER DATA
  const subtitle = chat.phone ? `SMS • ${chat.phone}` : 'SMS';

  return (
    <div className="panel chat-window">
      <Header
        title={chat.phone}
        subtitle={subtitle}
        status="Active"
      />

      <div className="message-list" ref={listRef}>
        {safeMessages.length === 0 ? (
          <div className="empty-state">
            <div className="empty-title">No messages yet</div>
            <div className="empty-subtitle">
              Start the conversation by sending a message.
            </div>
          </div>
        ) : (
          safeMessages.map((message, index) => (
            <MessageBubble key={index} message={message} />
          ))
        )}
      </div>

      <MessageInput
  chatId={chat.phone}
  onMessageSent={(newMessage) => {
    // 🔥 ADD MESSAGE TO UI
    const updated = [...(messages || []), newMessage];
    
    // TEMP: update locally (we’ll improve later)
    setMessages(updated);
  }}
  />
    </div>
  );
}

export default ChatWindow;