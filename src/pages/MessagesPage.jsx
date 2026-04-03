import { useEffect, useState, useCallback } from 'react';
import ContactsList from '../components/ContactsList';
import ChatWindow from '../components/ChatWindow';
import NewMessageModal from '../components/NewMessageModal';
import socket from '../socket';
import BASE_URL from '../config/api';

// 🔥 NORMALIZE PHONE (CRITICAL FIX)
const normalize = (phone) => {
  if (!phone) return '';
  return phone.toString().replace(/\D/g, '').slice(-10);
};

function MessagesPage() {
  const [chats, setChats] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [activeChatId, setActiveChatId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [showModal, setShowModal] = useState(false);

  // 📚 FETCH CONVERSATIONS
  const fetchConversations = useCallback(async () => {
    try {
      const res = await fetch(`${BASE_URL}/api/sms/conversations`);
      const data = await res.json();
      setChats(data || []);
    } catch (err) {
      console.error('❌ Fetch conversations error:', err);
    }
  }, []);

  // 👤 FETCH CONTACTS
  const fetchContacts = useCallback(async () => {
    try {
      const res = await fetch(`${BASE_URL}/api/contacts`);
      const data = await res.json();
      setContacts(data || []);
    } catch (err) {
      console.error('❌ Fetch contacts error:', err);
    }
  }, []);

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
  }, [fetchConversations, fetchContacts]);

  // 🔄 LOAD CHAT
  useEffect(() => {
    if (!activeChatId) return;

    const loadChat = async () => {
      const phone = normalize(activeChatId);

      await fetchMessages(phone);

      await fetch(`${BASE_URL}/api/sms/read/${phone}`, {
        method: 'PUT',
      });

      fetchConversations();
    };

    loadChat();
  }, [activeChatId, fetchConversations]);

  // 🔁 SWITCH NUMBER EVENT
  useEffect(() => {
    const handler = (e) => {
      setActiveChatId(normalize(e.detail));
    };

    window.addEventListener('switchChatNumber', handler);
    return () => window.removeEventListener('switchChatNumber', handler);
  }, []);

  // ⚡ REAL-TIME
  useEffect(() => {
    const handleMessage = (msg) => {
      const msgFrom = normalize(msg.from);
      const msgTo = normalize(msg.to);
      const active = normalize(activeChatId);

      if (msgFrom === active || msgTo === active) {
        setMessages((prev) => [...prev, msg]);
      }

      fetchConversations();
    };

    socket.on('newMessage', handleMessage);
    return () => socket.off('newMessage', handleMessage);
  }, [activeChatId, fetchConversations]);

  // 🔥 START CHAT
  const handleStartChat = (phone) => {
    setActiveChatId(normalize(phone));
    setMessages([]);
  };

  // 🔥 MERGE CONTACTS + CHATS (FIXED)
const mergedList = contacts.map((contact) => {
  const phones = contact.phones || [];

  const numbers = phones.map((p) => normalize(p.number));

  const chat = chats.find((c) =>
    numbers.includes(normalize(c.phone))
  );

  return {
    ...contact,
    phones, // 🔥 KEEP ORIGINAL FORMAT (IMPORTANT)
    phone: phones[0]?.number || '', // 🔥 DO NOT normalize here
    dba: contact.dba,
    lastMessage: chat?.lastMessage || '',
    unread: chat?.unread || 0,
    updatedAt: chat?.updatedAt || 0,
  };
});

  // 🔥 ADD UNKNOWN CHATS (FIXED)
  chats.forEach((chat) => {
    const phone = normalize(chat.phone);

    const exists = mergedList.find((c) =>
      (c.phones || []).some(p => p.number === phone)
    );

    if (!exists) {
      mergedList.push({
        phone,
        name: phone,
        phones: [{ number: phone, label: 'mobile' }],
        lastMessage: chat.lastMessage,
        unread: chat.unread,
        updatedAt: chat.updatedAt,
      });
    }
  });

  // 🔥 SORT (UNREAD FIRST + LATEST)
  const sortedList = [...mergedList].sort((a, b) => {
    if (b.unread !== a.unread) {
      return b.unread - a.unread;
    }
    return new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0);
  });

  // 🔥 ACTIVE CHAT FIX
  const activeChatBase = sortedList.find((c) =>
    (c.phones || []).some(
      (p) => normalize(p.number) === normalize(activeChatId)
    )
  );

  const activeChat = activeChatBase
    ? { ...activeChatBase, phone: normalize(activeChatId) }
    : activeChatId
    ? { phone: normalize(activeChatId), phones: [] }
    : null;

  return (
    <div className="page-shell">

      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <button
          onClick={() => setShowModal(true)}
          style={{
            margin: '10px',
            padding: '10px',
            background: '#1d9bf0',
            color: '#fff',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontWeight: 'bold',
          }}
        >
          ➕ New Message
        </button>

        <ContactsList
          list={sortedList}
          activeId={normalize(activeChatId)}
          onSelect={(num) => setActiveChatId(normalize(num))}
        />
      </div>

      <ChatWindow
        chat={activeChat}
        messages={messages}
        setMessages={setMessages}
      />

      <NewMessageModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onStart={handleStartChat}
      />
    </div>
  );
}

export default MessagesPage;