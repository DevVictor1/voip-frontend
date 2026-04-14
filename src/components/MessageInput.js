import { useState } from 'react';
import './MessageInput.css';
import BASE_URL from '../config/api';

function MessageInput({ chatId, onMessageSent }) {
  const [text, setText] = useState('');

  const handleSend = async () => {
    if (!text.trim() || !chatId) return;

    try {
      const res = await fetch(`${BASE_URL}/api/sms/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: chatId, message: text }),
      });

      if (!res.ok) throw new Error('Send failed');

      const data = await res.json();

      onMessageSent(data);

      setText('');
    } catch (err) {
      console.error(err);
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
        onKeyDown={(e) => e.key === 'Enter' && handleSend()}
      />

      <button className="message-send-btn" onClick={handleSend}>
        Send
      </button>
    </div>
  );
}

export default MessageInput;
