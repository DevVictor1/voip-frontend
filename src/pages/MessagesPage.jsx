import { useEffect, useState } from 'react';
import ContactsList from '../components/ContactsList';
import ChatWindow from '../components/ChatWindow';
import socket from '../socket';
import BASE_URL from '../config/api';

function MessagesPage() {
  const [chats, setChats] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [activeChatId, setActiveChatId] = useState(null);
  const [messages, setMessages] = useState([]);

  // 📚 FETCH CONVERSATIONS
  const fetchConversations = async () => {
    try {
      const res = await fetch(`${BASE_URL}/api/sms/conversations`);
      const data = await res.json();
      setChats(data);
    } catch (err) {
      console.error('❌ Fetch conversations error:', err);
    }
  };

  // 👤 FETCH CONTACTS
  const fetchContacts = async () => {
    try {
      const res = await fetch(`${BASE_URL}/api/contacts`);
      const data = await res.json();
      setContacts(data);
    } catch (err) {
      console.error('❌ Fetch contacts error:', err);
    }
  };

  // 💬 FETCH MESSAGES
  const fetchMessages = async (phone) => {
    try {
      const res = await fetch(`${BASE_URL}/api/sms/messages/${phone}`);
      const data = await res.json();
      setMessages(data || []);
    } catch (err) {
      console.error('❌ Fetch messages error:', err);
      setMessages([]);
    }
  };

  // 🚀 INITIAL LOAD
  useEffect(() => {
    fetchConversations();
    fetchContacts();
  }, []);

  // 🔄 LOAD CHAT WHEN CLICKED
  useEffect(() => {
    if (!activeChatId) return;

    const loadChat = async () => {
      try {
        await fetchMessages(activeChatId);

        await fetch(`${BASE_URL}/api/sms/read/${activeChatId}`, {
          method: 'PUT',
        });

        await fetchConversations();
      } catch (err) {
        console.error('❌ Chat load error:', err);
      }
    };

    loadChat();
  }, [activeChatId]);

  // ⚡ REAL-TIME
  useEffect(() => {
    socket.on('newMessage', async (msg) => {
      const isCurrent =
        msg.from === activeChatId || msg.to === activeChatId;

      if (isCurrent) {
        setMessages((prev) => [...prev, msg]);

        if (msg.direction === 'inbound') {
          await fetch(`${BASE_URL}/api/sms/read/${activeChatId}`, {
            method: 'PUT',
          });
        }
      }

      fetchConversations();
    });

    return () => socket.off('newMessage');
  }, [activeChatId]);

  // 🔥 MERGE CONTACT + CHAT
  const mergedList = contacts.map((contact) => {
    const chat = chats.find((c) => c.phone === contact.phone);

    return {
      ...contact,
      lastMessage: chat?.lastMessage || '',
      unread: chat?.unread || 0,
    };
  });

  // 🔥 ADD CHATS THAT ARE NOT CONTACTS
  chats.forEach((chat) => {
    const exists = mergedList.find((c) => c.phone === chat.phone);
    if (!exists) {
      mergedList.push(chat);
    }
  });

  // 🔥 ACTIVE CHAT FIX
  const activeChat =
    mergedList.find((c) => c.phone === activeChatId) ||
    (activeChatId ? { phone: activeChatId } : null);

  return (
    <div className="page-shell">
      <ContactsList
        list={mergedList}
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