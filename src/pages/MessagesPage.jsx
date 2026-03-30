import { useEffect, useState } from 'react';
import ChatList from '../components/ChatList';
import ChatWindow from '../components/ChatWindow';
import socket from '../socket';
import BASE_URL from '../config/api';

function MessagesPage() {
  const [chats, setChats] = useState([]);
  const [activeChatId, setActiveChatId] = useState(null);
  const [messages, setMessages] = useState([]);

  // 🔥 FETCH CONVERSATIONS
  const fetchConversations = async () => {
    try {
      const res = await fetch(`${BASE_URL}/api/sms/conversations`);
      const data = await res.json();

      setChats(data);

      if (data.length > 0 && !activeChatId) {
        setActiveChatId(data[0].phone);
      }
    } catch (err) {
      console.error('❌ Fetch conversations error:', err);
    }
  };

  // 🔥 FETCH MESSAGES
  const fetchMessages = async (phone) => {
    try {
      const res = await fetch(`${BASE_URL}/api/sms/messages/${phone}`);
      const data = await res.json();

      setMessages(data);
    } catch (err) {
      console.error('❌ Fetch messages error:', err);
    }
  };

  // 🚀 INITIAL LOAD
  useEffect(() => {
    fetchConversations();
  }, []);

  // ✅ LOAD CHAT + MARK AS READ
  useEffect(() => {
    if (!activeChatId) return;

    const loadChat = async () => {
      try {
        // 1. Load messages
        await fetchMessages(activeChatId);

        // 2. Mark as read
        await fetch(`${BASE_URL}/api/sms/read/${activeChatId}`, {
          method: 'PUT',
        });

        // 3. Refresh chat list (updates unread count)
        await fetchConversations();

      } catch (err) {
        console.error('❌ Chat load error:', err);
      }
    };

    loadChat();
  }, [activeChatId]);

  // 🔥 REAL-TIME SOCKET
  useEffect(() => {
    socket.on('newMessage', async (msg) => {
      const isCurrentChat =
        msg.from === activeChatId || msg.to === activeChatId;

      // ✅ If it's current chat → show instantly
      if (isCurrentChat) {
        setMessages((prev) => [...prev, msg]);

        // ✅ Auto mark as read (NO unread badge)
        if (msg.direction === 'inbound') {
          await fetch(`${BASE_URL}/api/sms/read/${activeChatId}`, {
            method: 'PUT',
          });
        }
      }

      // ✅ Always refresh chat list
      fetchConversations();
    });

    return () => socket.off('newMessage');
  }, [activeChatId]);

  const activeChat = chats.find(
    (chat) => chat.phone === activeChatId
  );

  return (
    <div className="page-shell">
      <ChatList
        chats={chats}
        activeId={activeChatId}
        onSelect={setActiveChatId}
      />

      <ChatWindow
        chat={activeChat}
        messages={messages}
        setMessages={setMessages}
      />
    </div>
  );
}

export default MessagesPage;