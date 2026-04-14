import { useState } from 'react';
import './MessageInput.css';
import BASE_URL from '../config/api';

export const sendMessageRequest = async (to, message) => {
  const res = await fetch(`${BASE_URL}/api/sms/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to, message }),
  });

  if (!res.ok) throw new Error('Send failed');
  return res.json();
};

function MessageInput({ chatId, onMessageSent, setMessages }) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    if (sending) return;
    if (!text.trim() || !chatId) return;

    setSending(true);

    const tempId = `temp-${Date.now()}`;
    const tempMessage = {
      _id: tempId,
      body: text,
      direction: 'outbound',
      status: 'sending',
      createdAt: new Date().toISOString(),
    };

    if (setMessages) {
      setMessages((prev) => [...prev, tempMessage]);
    } else if (onMessageSent) {
      onMessageSent(tempMessage);
    }

    setText('');

    try {
      const data = await sendMessageRequest(chatId, text);

      if (setMessages) {
        setMessages((prev) =>
          prev.map((m) => (m._id === tempId ? data : m))
        );
      } else if (onMessageSent) {
        onMessageSent(data);
      }
    } catch (err) {
      console.error(err);
      if (setMessages) {
        setMessages((prev) =>
          prev.map((m) =>
            m._id === tempId ? { ...m, status: 'failed' } : m
          )
        );
      }
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="message-input-container">
      <input
        className="message-input-field"
        type="text"
        placeholder="Type a message..."
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (sending) return;
          if (e.key === 'Enter') handleSend();
        }}
      />

      <button className="message-send-btn" onClick={handleSend} disabled={sending}>
        {sending ? 'Sending...' : 'Send'}
      </button>
    </div>
  );
}

export default MessageInput;
