import { useEffect, useState, useCallback } from 'react';
import ContactsList from '../components/ContactsList';
import ChatWindow from '../components/ChatWindow';
import NewMessageModal from '../components/NewMessageModal';
import socket from '../socket';
import BASE_URL from '../config/api';
import { Plus } from 'lucide-react';

const normalize = (phone) => {
  if (!phone) return '';
  return phone.toString().replace(/\D/g, '').slice(-10);
};

const getStoredRole = () => {
  if (typeof window === 'undefined') return 'admin';
  return window.localStorage?.getItem('userRole') === 'agent' ? 'agent' : 'admin';
};

const getStoredUserId = () => {
  if (typeof window === 'undefined') return 'agent_1';
  return window.localStorage?.getItem('voiceUserId') || 'agent_1';
};

const buildConversationKey = (conversationType, conversationId) => {
  const safeId = conversationType === 'customer'
    ? normalize(conversationId)
    : conversationId;
  return `${conversationType}:${safeId}`;
};

function MessagesPage() {
  const [chats, setChats] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [internalChats, setInternalChats] = useState([]);
  const [activeChatId, setActiveChatId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [activeTab, setActiveTab] = useState('all');

  const currentRole = getStoredRole();
  const currentUserId = getStoredUserId();

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

  const fetchInternalConversations = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        role: currentRole,
        userId: currentUserId,
      });

      const res = await fetch(`${BASE_URL}/api/messages/conversations?${params.toString()}`);
      if (!res.ok) throw new Error();

      const data = await res.json();
      setInternalChats(data || []);
    } catch (err) {
      console.error('Fetch internal conversations error:', err);
    }
  }, [currentRole, currentUserId]);

  const fetchContacts = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        role: currentRole,
        userId: currentUserId,
      });

      const res = await fetch(`${BASE_URL}/api/contacts?${params.toString()}`);
      if (!res.ok) throw new Error();

      const data = await res.json();
      setContacts(data || []);
    } catch (err) {
      console.error('Fetch contacts error:', err);
    }
  }, [currentRole, currentUserId]);

  const fetchCustomerMessages = useCallback(async (phone) => {
    try {
      const res = await fetch(`${BASE_URL}/api/sms/messages/${phone}`);
      if (!res.ok) throw new Error();

      const data = await res.json();
      setMessages(data || []);
    } catch (err) {
      console.error('Fetch customer messages error:', err);
      setMessages([]);
    }
  }, []);

  const fetchInternalMessages = useCallback(async (conversationId) => {
    try {
      const params = new URLSearchParams({
        role: currentRole,
        userId: currentUserId,
      });

      const res = await fetch(
        `${BASE_URL}/api/messages/thread/${encodeURIComponent(conversationId)}?${params.toString()}`
      );
      if (!res.ok) throw new Error();

      const data = await res.json();
      setMessages(data || []);
    } catch (err) {
      console.error('Fetch internal messages error:', err);
      setMessages([]);
    }
  }, [currentRole, currentUserId]);

  const markChatRead = useCallback((conversation) => {
    if (!conversation) return;

    if (conversation.conversationType === 'customer') {
      const target = normalize(conversation.phone || conversation.conversationId);
      setChats((prev) =>
        prev.map((item) =>
          normalize(item.phone) === target ? { ...item, unread: 0 } : item
        )
      );
      return;
    }

    setInternalChats((prev) =>
      prev.map((item) =>
        item.conversationId === conversation.conversationId
          ? { ...item, unread: 0 }
          : item
      )
    );
  }, []);

  const handleAssignContact = async (contactId, userId) => {
    if (!contactId || !userId) return;

    try {
      await fetch(`${BASE_URL}/api/contacts/${contactId}/assign`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });

      setContacts((prev) =>
        prev.map((contact) =>
          contact._id === contactId
            ? { ...contact, assignedTo: userId, isUnassigned: false }
            : contact
        )
      );
    } catch (err) {
      console.error('Assign error:', err);
    }
  };

  useEffect(() => {
    fetchConversations();
    fetchContacts();
    fetchInternalConversations();
  }, [fetchContacts, fetchConversations, fetchInternalConversations]);

  const customerList = contacts.map((contact) => {
    const phones = contact.phones || [];
    const numbers = phones.map((phone) => normalize(phone.number));

    const chat = chats.find((item) =>
      numbers.includes(normalize(item.phone))
    );

    const primaryPhone = chat?.phone || phones[0]?.number || '';
    const conversationId = normalize(primaryPhone);

    return {
      ...contact,
      conversationType: 'customer',
      conversationId,
      phones,
      phone: primaryPhone,
      lastMessage: chat?.lastMessage || '',
      unread: chat?.unread || 0,
      updatedAt: chat?.updatedAt || 0,
      isInternal: false,
      isTeam: false,
      previewFallback: 'No messages yet',
      key: buildConversationKey('customer', conversationId),
    };
  });

  chats.forEach((chat) => {
    const phone = normalize(chat.phone);
    const exists = customerList.find((item) =>
      (item.phones || []).some((phoneEntry) => normalize(phoneEntry.number) === phone)
    );

    if (!exists) {
      customerList.push({
        conversationType: 'customer',
        conversationId: phone,
        key: buildConversationKey('customer', phone),
        phone,
        name: phone,
        phones: [{ number: phone, label: 'mobile' }],
        lastMessage: chat.lastMessage,
        unread: chat.unread,
        updatedAt: chat.updatedAt,
        isInternal: false,
        isTeam: false,
        previewFallback: 'No messages yet',
        isUnassigned: true,
      });
    }
  });

  const internalList = internalChats.map((conversation) => ({
    ...conversation,
    key: buildConversationKey(conversation.conversationType, conversation.conversationId),
  }));

  const combinedList = [...customerList, ...internalList].sort((a, b) => {
    if ((b.unread || 0) !== (a.unread || 0)) {
      return (b.unread || 0) - (a.unread || 0);
    }

    return new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0);
  });

  const unreadCount = combinedList.filter((item) => item.unread > 0).length;
  const allCount = combinedList.length;
  const teamCount = combinedList.filter((item) => item.conversationType === 'team').length;

  let filteredList = combinedList;

  if (activeTab === 'unread') {
    filteredList = combinedList.filter((item) => item.unread > 0);
  } else if (activeTab === 'team') {
    filteredList = combinedList.filter((item) => item.conversationType === 'team');
  }

  const activeChat = combinedList.find((item) => item.key === activeChatId)
    || (activeChatId?.startsWith('customer:')
      ? {
          conversationType: 'customer',
          conversationId: activeChatId.replace('customer:', ''),
          key: activeChatId,
          phone: activeChatId.replace('customer:', ''),
          phones: [],
          isInternal: false,
          isTeam: false,
        }
      : null);
  const activeConversationType = activeChat?.conversationType || null;
  const activeConversationId = activeChat?.conversationId || null;
  const activeCustomerPhone = activeConversationType === 'customer'
    ? normalize(activeChat?.phone || activeConversationId)
    : '';

  useEffect(() => {
    if (!activeConversationType) return;

    const loadChat = async () => {
      if (activeConversationType === 'customer') {
        const phone = activeCustomerPhone;
        await fetchCustomerMessages(phone);
        await fetch(`${BASE_URL}/api/sms/read/${phone}`, {
          method: 'PUT',
        });
        fetchConversations();
      } else {
        await fetchInternalMessages(activeConversationId);
        await fetch(`${BASE_URL}/api/messages/read/${encodeURIComponent(activeConversationId)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: currentUserId }),
        });
        fetchInternalConversations();
      }
    };

    loadChat();
    markChatRead(
      activeConversationType === 'customer'
        ? {
            conversationType: 'customer',
            conversationId: activeConversationId,
            phone: activeCustomerPhone,
          }
        : {
            conversationType: activeConversationType,
            conversationId: activeConversationId,
          }
    );
  }, [
    activeChatId,
    activeConversationId,
    activeConversationType,
    activeCustomerPhone,
    currentUserId,
    fetchConversations,
    fetchCustomerMessages,
    fetchInternalConversations,
    fetchInternalMessages,
    markChatRead,
  ]);

  useEffect(() => {
    const handler = (e) => {
      const normalized = normalize(e.detail);
      const nextChat = {
        conversationType: 'customer',
        conversationId: normalized,
        phone: normalized,
      };

      setActiveChatId(buildConversationKey('customer', normalized));
      markChatRead(nextChat);
    };

    window.addEventListener('switchChatNumber', handler);
    return () => window.removeEventListener('switchChatNumber', handler);
  }, [markChatRead]);

  useEffect(() => {
    const handleMessage = (msg) => {
      if (msg.conversationType === 'internal_dm' || msg.conversationType === 'team') {
        const conversationKey = buildConversationKey(msg.conversationType, msg.conversationId);
        const normalizedMessage = {
          ...msg,
          direction: msg.senderId === currentUserId ? 'outbound' : 'inbound',
        };

        if (conversationKey === activeChatId) {
          setMessages((prev) => {
            const exists = prev.find((item) => item._id === msg._id);
            if (exists) return prev;
            return [...prev, normalizedMessage];
          });

          if (msg.senderId !== currentUserId) {
            fetch(`${BASE_URL}/api/messages/read/${encodeURIComponent(msg.conversationId)}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ userId: currentUserId }),
            }).catch((error) => console.error('Mark internal read error:', error));
          }
        }

        fetchInternalConversations();
        return;
      }

      const msgFrom = normalize(msg.from);
      const msgTo = normalize(msg.to);
      const activePhone = activeCustomerPhone;

      if (msgFrom === activePhone || msgTo === activePhone) {
        setMessages((prev) => {
          const exists = prev.find(
            (item) => item._id === msg._id || item.sid === msg.sid
          );
          if (exists) return prev;

          if (msg.direction === 'outbound') {
            const msgTime = msg.createdAt ? new Date(msg.createdAt).getTime() : null;
            const tempIndex = prev.findIndex((item) => {
              if (item.status !== 'sending') return false;
              if (item.direction !== 'outbound') return false;
              if (item.body !== msg.body) return false;
              if (!msgTime || !item.createdAt) return true;

              const tempTime = new Date(item.createdAt).getTime();
              return Math.abs(tempTime - msgTime) < 120000;
            });

            if (tempIndex !== -1) {
              const next = [...prev];
              next[tempIndex] = msg;
              return next;
            }
          }

          return [...prev, msg];
        });

        if (activeConversationType === 'customer') {
          markChatRead({
            conversationType: 'customer',
            phone: activePhone,
            conversationId: activeConversationId,
          });
        }
      }

      fetchConversations();
    };

    socket.on('newMessage', handleMessage);
    return () => socket.off('newMessage', handleMessage);
  }, [
    activeChatId,
    activeConversationId,
    activeConversationType,
    activeCustomerPhone,
    currentUserId,
    fetchConversations,
    fetchInternalConversations,
    markChatRead,
  ]);

  useEffect(() => {
    const handleStatus = (data) => {
      setMessages((prev) =>
        prev.map((msg) =>
          msg.sid === data.sid
            ? { ...msg, status: data.status }
            : msg
        )
      );
    };

    socket.on('messageStatus', handleStatus);
    return () => socket.off('messageStatus', handleStatus);
  }, []);

  const handleStartChat = (phone) => {
    const normalized = normalize(phone);
    setActiveChatId(buildConversationKey('customer', normalized));
    setMessages([]);
    markChatRead({
      conversationType: 'customer',
      conversationId: normalized,
      phone: normalized,
    });
  };

  const handleSelectChat = (conversation) => {
    if (!conversation) return;

    const nextKey = buildConversationKey(
      conversation.conversationType || 'customer',
      conversation.conversationId || conversation.phone
    );

    setActiveChatId(nextKey);
    markChatRead(conversation);
  };

  const isChatOpen = Boolean(activeChatId);

  return (
    <div className={`page-shell messages-shell${isChatOpen ? ' is-chat-open' : ''}`}>
      <div className="messages-contacts-pane">
        <div className="messages-filters">
          <button
            onClick={() => setActiveTab('all')}
            className={`messages-filter-btn${activeTab === 'all' ? ' is-active' : ''}`}
            type="button"
          >
            All ({allCount})
          </button>

          <button
            onClick={() => setActiveTab('unread')}
            className={`messages-filter-btn${activeTab === 'unread' ? ' is-active' : ''}`}
            type="button"
          >
            Unread ({unreadCount})
          </button>

          <button
            onClick={() => setActiveTab('team')}
            className={`messages-filter-btn${activeTab === 'team' ? ' is-active' : ''}`}
            type="button"
          >
            Team ({teamCount})
          </button>
        </div>

        <button
          onClick={() => setShowModal(true)}
          className="messages-new-button"
          type="button"
        >
          <Plus size={16} />
          New Message
        </button>

        <ContactsList
          list={filteredList}
          activeId={activeChatId}
          onSelect={handleSelectChat}
        />
      </div>

      <div className="messages-chat-pane">
        <ChatWindow
          chat={activeChat}
          messages={messages}
          setMessages={setMessages}
          currentUserId={currentUserId}
          onSwitchNumber={(num) => setActiveChatId(buildConversationKey('customer', normalize(num)))}
          onAssignContact={handleAssignContact}
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
