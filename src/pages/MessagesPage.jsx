import { useEffect, useState, useCallback } from 'react';
import ContactsList from '../components/ContactsList';
import ChatWindow from '../components/ChatWindow';
import NewMessageModal from '../components/NewMessageModal';
import socket from '../socket';
import BASE_URL from '../config/api';
import { Plus } from 'lucide-react';

// NORMALIZE PHONE
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

  const [activeTab, setActiveTab] = useState('all');

  const fetchConversations = useCallback(async () => {
    try {
      const res = await fetch(`${BASE_URL}/api/sms/conversations`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setChats(data || []);
    } catch (err) {
      console.error('Fetch conversations error:', err);
    }
  }, []);

  const fetchContacts = useCallback(async () => {
    try {
      const role = 'admin';
      const userId = 'user_1';

      const res = await fetch(
        `${BASE_URL}/api/contacts?role=${role}&userId=${userId}`
      );

      if (!res.ok) throw new Error();

      const data = await res.json();
      setContacts(data || []);
    } catch (err) {
      console.error('Fetch contacts error:', err);
    }
  }, []);

  const markChatRead = useCallback((phone) => {
    const target = normalize(phone);
    setChats((prev) =>
      prev.map((c) =>
        normalize(c.phone) === target ? { ...c, unread: 0 } : c
      )
    );
  }, []);

  const fetchMessages = async (phone) => {
    try {
      const res = await fetch(`${BASE_URL}/api/sms/messages/${phone}`);
      if (!res.ok) throw new Error();

      const data = await res.json();
      setMessages(data || []);
    } catch (err) {
      console.error('Fetch messages error:', err);
      setMessages([]);
    }
  };

  // ✅ 🔥 NEW: LIVE ASSIGN UPDATE
  const handleAssignContact = async (contactId) => {
    try {
      await fetch(`${BASE_URL}/api/contacts/${contactId}/assign`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: "user_1" })
      });

      // 🔥 UPDATE LOCAL STATE (NO RELOAD)
      setContacts((prev) =>
        prev.map((c) =>
          c._id === contactId
            ? { ...c, isUnassigned: false }
            : c
        )
      );

    } catch (err) {
      console.error("Assign error:", err);
    }
  };

  useEffect(() => {
    fetchConversations();
    fetchContacts();
  }, [fetchConversations, fetchContacts]);

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
  }, [activeChatId, fetchConversations, markChatRead]);

  useEffect(() => {
    const handler = (e) => {
      const normalized = normalize(e.detail);
      setActiveChatId(normalized);
      markChatRead(normalized);
    };

    window.addEventListener('switchChatNumber', handler);
    return () => window.removeEventListener('switchChatNumber', handler);
  }, [markChatRead]);

  useEffect(() => {
    const handleMessage = (msg) => {
      const msgFrom = normalize(msg.from);
      const msgTo = normalize(msg.to);
      const active = normalize(activeChatId);

      if (msgFrom === active || msgTo === active) {
        setMessages((prev) => {
          const exists = prev.find(
            (m) => m._id === msg._id || m.sid === msg.sid
          );
          if (exists) return prev;
          return [...prev, msg];
        });
        markChatRead(active);
      } else if (!msg.direction || msg.direction === 'inbound') {
        const target = normalize(msg.from);
        setChats((prev) => {
          let found = false;
          const next = prev.map((c) => {
            if (normalize(c.phone) === target) {
              found = true;
              return {
                ...c,
                unread: (c.unread || 0) + 1,
                lastMessage: msg.body || c.lastMessage,
                updatedAt: msg.createdAt || c.updatedAt,
              };
            }
            return c;
          });

          if (!found && target) {
            next.push({
              phone: target,
              name: target,
              lastMessage: msg.body || '',
              unread: 1,
              updatedAt: msg.createdAt || new Date().toISOString(),
              isInternal: false
            });
          }

          return next;
        });
      }

      fetchConversations();
    };

    socket.on('newMessage', handleMessage);
    return () => socket.off('newMessage', handleMessage);
  }, [activeChatId, fetchConversations]);

  const handleStartChat = (phone) => {
    const normalized = normalize(phone);
    setActiveChatId(normalized);
    setMessages([]);
    markChatRead(normalized);
  };

  const handleSelectChat = (phone) => {
    const normalized = normalize(phone);
    setActiveChatId(normalized);
    markChatRead(normalized);
  };

  const mergedList = contacts.map((contact) => {
    const phones = contact.phones || [];
    const numbers = phones.map((p) => normalize(p.number));

    const chat = chats.find((c) =>
      numbers.includes(normalize(c.phone))
    );

    return {
      ...contact,
      phones,
      phone: phones[0]?.number || '',
      dba: contact.dba,
      lastMessage: chat?.lastMessage || '',
      unread: chat?.unread || 0,
      updatedAt: chat?.updatedAt || 0,
      isInternal: false
    };
  });

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
        isInternal: false
      });
    }
  });

  const sortedList = [...mergedList].sort((a, b) => {
    if (b.unread !== a.unread) {
      return b.unread - a.unread;
    }
    return new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0);
  });

  const unreadCount = sortedList.filter(c => c.unread > 0).length;
  const allCount = sortedList.length;
  const teamCount = sortedList.filter(c => c.isInternal).length;

  let filteredList = sortedList;

  if (activeTab === 'unread') {
    filteredList = sortedList.filter(c => c.unread > 0);
  }

  if (activeTab === 'team') {
    filteredList = sortedList.filter(c => c.isInternal);
  }

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

  const isChatOpen = Boolean(activeChatId);

  return (
    <div className={`page-shell messages-shell${isChatOpen ? ' is-chat-open' : ''}`}>

      <div className="messages-contacts-pane">

        <div style={{ display: 'flex', gap: '8px', padding: '10px' }}>

          <button
            onClick={() => setActiveTab('all')}
            style={{
              padding: '6px 12px',
              borderRadius: '6px',
              border: 'none',
              cursor: 'pointer',
              background: activeTab === 'all' ? '#1d9bf0' : '#333',
              color: '#fff'
            }}
          >
            All ({allCount})
          </button>

          <button
            onClick={() => setActiveTab('unread')}
            style={{
              padding: '6px 12px',
              borderRadius: '6px',
              border: 'none',
              cursor: 'pointer',
              background: activeTab === 'unread' ? '#1d9bf0' : '#333',
              color: '#fff'
            }}
          >
            Unread ({unreadCount})
          </button>

          <button
            onClick={() => setActiveTab('team')}
            style={{
              padding: '6px 12px',
              borderRadius: '6px',
              border: 'none',
              cursor: 'pointer',
              background: activeTab === 'team' ? '#1d9bf0' : '#333',
              color: '#fff'
            }}
          >
            Team ({teamCount})
          </button>

        </div>

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
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}
        >
          <Plus size={16} />
          New Message
        </button>

        <ContactsList
          list={filteredList}
          activeId={normalize(activeChatId)}
          onSelect={handleSelectChat}
        />
      </div>

      <div className="messages-chat-pane">
        <ChatWindow
          chat={activeChat}
          messages={messages}
          setMessages={setMessages}
          onSwitchNumber={(num) => setActiveChatId(normalize(num))}
          onAssignContact={handleAssignContact} // ✅ PASS DOWN
          onBack={() => setActiveChatId(null)}
          showBack={isChatOpen}
        />
      </div>

      <NewMessageModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onStart={handleStartChat}
      />
    </div>
  );
}

export default MessagesPage;
