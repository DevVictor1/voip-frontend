import { useEffect, useState, useCallback, useMemo } from 'react';
import ContactsList from '../components/ContactsList';
import ChatWindow from '../components/ChatWindow';
import NewMessageModal from '../components/NewMessageModal';
import socket from '../socket';
import BASE_URL from '../config/api';
import { MoreHorizontal, Plus, Search } from 'lucide-react';
import { getAgentMeta, getDepartmentLabel } from '../config/agents';
import {
  fetchTeammatesRequest,
  getEffectiveAgentId,
  getEffectiveRole,
  getStoredAuthToken,
  getStoredAuthUser,
} from '../services/auth';

const normalize = (phone) => {
  if (!phone) return '';
  return phone.toString().replace(/\D/g, '').slice(-10);
};

const buildConversationKey = (conversationType, conversationId) => {
  const safeId = conversationType === 'customer'
    ? normalize(conversationId)
    : conversationId;
  return `${conversationType}:${safeId}`;
};

const normalizeUnreadCount = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

const getCustomerMessagePhone = (message) => normalize(
  message?.conversationId || message?.from || message?.to || ''
);

const mergeCustomerMessages = (existingMessages, fetchedMessages, phone) => {
  const normalizedPhone = normalize(phone);
  const nextMessages = Array.isArray(fetchedMessages) ? [...fetchedMessages] : [];

  if (!normalizedPhone) {
    return nextMessages;
  }

  const existingSameThread = (existingMessages || []).filter(
    (message) => getCustomerMessagePhone(message) === normalizedPhone
  );

  existingSameThread.forEach((message) => {
    const exists = nextMessages.find(
      (item) =>
        (message?._id && item?._id === message._id)
        || (message?.sid && item?.sid === message.sid)
    );

    if (!exists) {
      nextMessages.push(message);
    }
  });

  return nextMessages.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
};

const hasUnreadConversation = (conversation) => normalizeUnreadCount(conversation?.unreadCount) > 0;
const isDirectoryOnlyCustomer = (conversation) => (
  conversation?.conversationType === 'customer'
  && !conversation?.rawConversation
  && !conversation?.lastMessage
  && !hasUnreadConversation(conversation)
);

const matchesConversationSearch = (conversation, query) => {
  const normalizedQuery = String(query || '').trim().toLowerCase();
  if (!normalizedQuery) return true;

  const haystack = [
    conversation?.name,
    conversation?.title,
    conversation?.teamName,
    conversation?.phone,
    conversation?.agentId,
    conversation?.lastMessage,
    conversation?.previewFallback,
    conversation?.dba,
    conversation?.role,
    conversation?.subtitle,
    conversation?.conversationId,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return haystack.includes(normalizedQuery);
};

const normalizeCustomerConversation = ({ contact = null, chat = null }) => {
  const phones = contact?.phones || [];
  const normalizedPhones = phones.map((phone) => ({
    ...phone,
    number: normalize(phone.number),
  }));
  const primaryPhone = normalize(chat?.phone || phones[0]?.number || '');
  const conversationId = primaryPhone;
  const fullName = [contact?.firstName, contact?.lastName].filter(Boolean).join(' ').trim();
  const title = fullName || contact?.name || chat?.name || primaryPhone;
  const subtitle = [primaryPhone, contact?.dba].filter(Boolean).join(' / ');
  const unreadCount = normalizeUnreadCount(chat?.unread);
  const lastMessageAt = chat?.updatedAt || contact?.updatedAt || 0;
  const persistedContactId = contact?._id || chat?._id || null;
  const resolvedAssignedTo = contact?.assignedTo ?? chat?.assignedTo ?? null;
  const resolvedIsUnassigned = typeof contact?.isUnassigned === 'boolean'
    ? contact.isUnassigned
    : typeof chat?.isUnassigned === 'boolean'
      ? chat.isUnassigned
      : !resolvedAssignedTo;
  const resolvedAssignmentStatus = contact?.assignmentStatus || chat?.assignmentStatus || 'open';

  return {
    ...contact,
    ...(chat?._id || chat?.assignedTo || typeof chat?.isUnassigned === 'boolean' || chat?.assignmentStatus
      ? {
          _id: persistedContactId,
          assignedTo: resolvedAssignedTo,
          isUnassigned: resolvedIsUnassigned,
          assignmentStatus: resolvedAssignmentStatus,
        }
      : {}),
    id: buildConversationKey('customer', conversationId),
    key: buildConversationKey('customer', conversationId),
    conversationId,
    conversationType: 'customer',
    type: 'customer',
    title,
    subtitle,
    name: title,
    phone: primaryPhone,
    phones: normalizedPhones.length > 0 ? normalizedPhones : [{ number: primaryPhone, label: 'mobile' }].filter((item) => item.number),
    lastMessage: chat?.lastMessage || '',
    lastMessageAt,
    updatedAt: lastMessageAt,
    unreadCount,
    unread: unreadCount,
    _id: persistedContactId,
    assignedTo: resolvedAssignedTo,
    isUnassigned: resolvedIsUnassigned,
    assignmentStatus: resolvedAssignmentStatus,
    isInternal: false,
    isTeam: false,
    previewFallback: 'No messages yet',
    sourceType: 'customer',
    rawContact: contact,
    rawConversation: chat,
  };
};

const getDirectoryAgentMeta = (agentId, userDirectory = {}) => {
  const matchedUser = agentId ? userDirectory[agentId] : null;
  const fallbackMeta = getAgentMeta(agentId);

  if (!matchedUser) {
    return {
      name: fallbackMeta?.name || agentId,
      role: fallbackMeta?.role || '',
    };
  }

  const department = getDepartmentLabel(matchedUser.department) || fallbackMeta?.department || fallbackMeta?.role || '';
  const roleLabel = department || (matchedUser.role === 'admin' ? 'Admin' : matchedUser.role || 'Agent');

  return {
    name: matchedUser.name || fallbackMeta?.name || agentId,
    role: roleLabel,
  };
};

const normalizeInternalConversation = (conversation, currentUserId, userDirectory = {}) => {
  const conversationId = conversation?.conversationId || '';
  const conversationType = conversation?.conversationType || conversation?.type || 'internal_dm';
  const participants = conversation?.participants || [];
  const otherParticipant = conversationType === 'internal_dm'
    ? participants.find((participant) => participant && participant !== currentUserId)
    : null;
  const otherAgent = otherParticipant ? getDirectoryAgentMeta(otherParticipant, userDirectory) : null;
  const title = conversationType === 'internal_dm'
    ? (otherAgent?.name || conversation?.name || conversation?.teamName || conversationId)
    : (conversation?.name || conversation?.teamName || conversationId);
  const subtitle = conversationType === 'team'
    ? (conversation?.role || conversation?.teamName || 'Team channel')
    : (otherAgent?.role || conversation?.role || 'Internal chat');
  const unreadCount = normalizeUnreadCount(conversation?.unread);
  const lastMessageAt = conversation?.updatedAt || 0;

  return {
    ...conversation,
    id: buildConversationKey(conversationType, conversationId),
    key: buildConversationKey(conversationType, conversationId),
    conversationId,
    conversationType,
    type: conversationType,
    title,
    subtitle,
    name: title,
    lastMessage: conversation?.lastMessage || '',
    lastMessageAt,
    updatedAt: lastMessageAt,
    unreadCount,
    unread: unreadCount,
    teamId: conversation?.teamId || null,
    teamName: conversation?.teamName || null,
    participants,
    agentId: conversationType === 'internal_dm'
      ? (otherParticipant || conversation?.agentId || null)
      : (conversation?.agentId || null),
    isInternal: true,
    isTeam: conversationType === 'team',
    sourceType: conversationType,
    rawConversation: conversation,
  };
};

const buildConversationList = ({ contacts, chats, internalChats, currentUserId, userDirectory }) => {
  const normalizedCustomers = [];
  const matchedPhones = new Set();

  contacts.forEach((contact) => {
    const contactPhones = (contact.phones || []).map((phone) => normalize(phone.number));
    const chat = chats.find((item) => contactPhones.includes(normalize(item.phone)));
    const normalizedConversation = normalizeCustomerConversation({ contact, chat });

    normalizedCustomers.push(normalizedConversation);
    contactPhones.forEach((phone) => matchedPhones.add(phone));
    if (chat?.phone) {
      matchedPhones.add(normalize(chat.phone));
    }
  });

  chats.forEach((chat) => {
    const phone = normalize(chat.phone);
    if (!phone || matchedPhones.has(phone)) return;

    normalizedCustomers.push(
      normalizeCustomerConversation({
        chat,
        contact: {
          name: chat.name || phone,
          phones: [{ number: phone, label: 'mobile' }],
          isUnassigned: true,
        },
      })
    );
  });

  const normalizedInternal = internalChats.map((conversation) =>
    normalizeInternalConversation(conversation, currentUserId, userDirectory)
  );

  return [...normalizedCustomers, ...normalizedInternal].sort((a, b) => {
    if ((b.unreadCount || 0) !== (a.unreadCount || 0)) {
      return (b.unreadCount || 0) - (a.unreadCount || 0);
    }

    return new Date(b.lastMessageAt || 0) - new Date(a.lastMessageAt || 0);
  });
};

const VIEW_MODE_CONFIG = {
  customers: {
    pageTitle: 'SMS / MMS',
    pageSubtitle: 'Customer and contact conversations only.',
    section: 'customers',
    primaryActionLabel: 'New Message',
    emptyLabel: 'No SMS / MMS conversations yet',
    emptySubtitle: 'Imported contacts and customer threads will appear in this panel.',
  },
  internal: {
    pageTitle: 'Internal Chat',
    pageSubtitle: 'Direct teammate conversations only.',
    section: 'internal',
    primaryActionLabel: 'Message Teammate',
    emptyLabel: 'No internal chats yet',
    emptySubtitle: 'Direct teammate chats will appear here once opened.',
  },
  teams: {
    pageTitle: 'Internal Teams',
    pageSubtitle: 'Shared team and group conversations only.',
    section: 'teams',
    primaryActionLabel: '',
    emptyLabel: 'No team conversations yet',
    emptySubtitle: 'Team channels will appear here when available.',
  },
};

function MessagesPage({
  currentRole: providedRole,
  currentUserId: providedUserId,
  viewMode = 'customers',
}) {
  const [chats, setChats] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [internalChats, setInternalChats] = useState([]);
  const [activeChatId, setActiveChatId] = useState(null);
  const [activeCustomerContactId, setActiveCustomerContactId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [teammates, setTeammates] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [showTeammatePicker, setShowTeammatePicker] = useState(false);
  const [startingDirectChat, setStartingDirectChat] = useState(false);
  const resolvedViewMode = VIEW_MODE_CONFIG[viewMode] ? viewMode : 'customers';
  const viewConfig = VIEW_MODE_CONFIG[resolvedViewMode];
  const [activeSection, setActiveSection] = useState(viewConfig.section);
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showToolsMenu, setShowToolsMenu] = useState(false);
  const [showImportTools, setShowImportTools] = useState(false);

  const currentRole = providedRole || getEffectiveRole();
  const currentUserId = providedUserId || getEffectiveAgentId() || 'agent_1';
  const storedAuthUser = getStoredAuthUser();
  const currentAuthUserDbId = storedAuthUser?.id || storedAuthUser?._id || '';

  useEffect(() => {
    setActiveSection(viewConfig.section);
    setActiveChatId(null);
    setActiveCustomerContactId(null);
    setMessages([]);
    setShowModal(false);
    setShowTeammatePicker(false);
    setShowToolsMenu(false);
    setShowImportTools(false);
  }, [viewConfig.section]);

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

  const fetchTeammates = useCallback(async () => {
    try {
      const token = getStoredAuthToken();
      if (!token) {
        setTeammates([]);
        return;
      }

      const payload = await fetchTeammatesRequest(token);
      setTeammates(Array.isArray(payload?.teammates) ? payload.teammates : []);
    } catch (err) {
      console.error('Fetch teammates error:', err);
      setTeammates([]);
    }
  }, []);

  const fetchCustomerMessages = useCallback(async (phone) => {
    try {
      const res = await fetch(`${BASE_URL}/api/sms/messages/${phone}`);
      if (!res.ok) throw new Error();

      const data = await res.json();
      setMessages((prev) => mergeCustomerMessages(prev, data || [], phone));
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
      const res = await fetch(`${BASE_URL}/api/contacts/${contactId}/assign`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });

      const updatedContact = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(updatedContact?.error || 'Failed to assign contact');
      }

      setContacts((prev) =>
        prev.map((contact) =>
          contact._id === contactId
            ? { ...contact, ...(updatedContact || {}), assignedTo: userId, isUnassigned: false }
            : contact
        )
      );
    } catch (err) {
      console.error('Assign error:', err);
      throw err;
    }
  };

  const handleUpdateAssignmentStatus = async (contactId, assignmentStatus) => {
    if (!contactId || !assignmentStatus) return;

    try {
      const res = await fetch(`${BASE_URL}/api/contacts/${contactId}/assignment-status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignmentStatus }),
      });

      const updatedContact = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(updatedContact?.error || 'Failed to update assignment status');
      }

      setContacts((prev) =>
        prev.map((contact) =>
          contact._id === contactId
            ? { ...contact, ...(updatedContact || {}), assignmentStatus }
            : contact
        )
      );
    } catch (err) {
      console.error('Assignment status error:', err);
      throw err;
    }
  };

  useEffect(() => {
    fetchConversations();
    fetchContacts();
    fetchInternalConversations();
    fetchTeammates();
  }, [fetchContacts, fetchConversations, fetchInternalConversations, fetchTeammates]);

  const workspaceUserDirectory = useMemo(
    () => teammates.reduce((acc, user) => {
      if (user?.agentId) {
        acc[user.agentId] = user;
      }
      return acc;
    }, {}),
    [teammates]
  );

  const teammateOptions = useMemo(
    () => teammates
      .filter((user) => user?.isActive !== false)
      .filter((user) => Boolean(user?.agentId))
      .filter((user) => user.agentId !== currentUserId)
      .filter((user) => !currentAuthUserDbId || user.id !== currentAuthUserDbId)
      .map((user) => {
        const agentMeta = getAgentMeta(user.agentId);
        const secondaryParts = [];
        const departmentLabel = getDepartmentLabel(user.department);

        if (departmentLabel) {
          secondaryParts.push(departmentLabel);
        } else if (agentMeta?.department || agentMeta?.role) {
          secondaryParts.push(agentMeta.department || agentMeta.role);
        } else if (user.role) {
          secondaryParts.push(user.role);
        }

        return {
          agentId: user.agentId,
          name: user.name || user.agentId,
          role: secondaryParts.join(' - ') || 'Teammate',
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name)),
    [currentAuthUserDbId, currentUserId, teammates]
  );

  const assignableAgents = useMemo(() => {
    const currentUser = storedAuthUser?.agentId
      ? {
          id: storedAuthUser.id || storedAuthUser._id || '',
          name: storedAuthUser.name || storedAuthUser.agentId,
          role: storedAuthUser.role || currentRole,
          agentId: storedAuthUser.agentId,
          department: storedAuthUser.department || '',
          isActive: storedAuthUser.isActive !== false,
        }
      : null;

    const directory = [currentUser, ...teammates]
      .filter((user) => user?.isActive !== false)
      .filter((user) => Boolean(user?.agentId))
      .reduce((acc, user) => {
        if (!acc[user.agentId]) {
          const agentMeta = getAgentMeta(user.agentId);
          const secondary = getDepartmentLabel(user.department)
            || agentMeta.department
            || agentMeta.role
            || (user.role === 'admin' ? 'Admin' : user.role)
            || 'Workspace user';

          acc[user.agentId] = {
            agentId: user.agentId,
            name: user.name || agentMeta.name || user.agentId,
            role: secondary,
          };
        }

        return acc;
      }, {});

    return Object.values(directory).sort((a, b) => a.name.localeCompare(b.name));
  }, [currentRole, teammates, storedAuthUser]);

  const upsertInternalConversation = useCallback((conversation) => {
    if (!conversation?.conversationId) return;

    setInternalChats((prev) => {
      const next = [...prev];
      const index = next.findIndex((item) => item.conversationId === conversation.conversationId);

      if (index === -1) {
        return [conversation, ...next];
      }

      next[index] = {
        ...next[index],
        ...conversation,
      };

      return next;
    });
  }, []);

  const handleStartDirectChat = useCallback(async (targetUserId) => {
    if (!targetUserId || startingDirectChat) return;

    try {
      setStartingDirectChat(true);

      const res = await fetch(`${BASE_URL}/api/messages/direct/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentUserId,
          targetUserId,
        }),
      });

      const payload = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(payload?.error || 'Failed to start direct chat');
      }

      const conversation = payload;
      const participants = conversation.participants || [currentUserId, targetUserId].sort();
      const otherParticipant = participants.find((participant) => participant !== currentUserId) || targetUserId;
      const otherAgent = getDirectoryAgentMeta(otherParticipant, workspaceUserDirectory);

      upsertInternalConversation({
        conversationType: 'internal_dm',
        conversationId: conversation.conversationId,
        participants,
        name: otherAgent.name,
        role: otherAgent.role,
        agentId: otherParticipant,
        lastMessage: conversation.lastMessagePreview || '',
        updatedAt: conversation.lastMessageAt || conversation.updatedAt || new Date().toISOString(),
        unread: 0,
        isInternal: true,
        isTeam: false,
        previewFallback: `Message ${otherAgent.name}`,
      });

      setActiveSection('internal');
      setActiveChatId(buildConversationKey('internal_dm', conversation.conversationId));
      setMessages([]);
      setShowTeammatePicker(false);
      fetchInternalConversations();
    } catch (err) {
      console.error('Start direct chat error:', err);
    } finally {
      setStartingDirectChat(false);
    }
  }, [currentUserId, fetchInternalConversations, startingDirectChat, upsertInternalConversation, workspaceUserDirectory]);

  const conversationList = buildConversationList({
    contacts,
    chats,
    internalChats,
    currentUserId,
    userDirectory: workspaceUserDirectory,
  });

  let filteredList = conversationList;

  if (activeSection === 'customers') {
    filteredList = conversationList.filter((item) => item.conversationType === 'customer');
  } else if (activeSection === 'internal') {
    filteredList = conversationList.filter((item) => item.conversationType === 'internal_dm');
  } else if (activeSection === 'teams') {
    filteredList = conversationList.filter((item) => item.conversationType === 'team');
  }

  if (showUnreadOnly) {
    filteredList = filteredList.filter(
      (item) => !isDirectoryOnlyCustomer(item) && hasUnreadConversation(item)
    );
  }

  if (searchQuery.trim()) {
    filteredList = filteredList.filter((item) => matchesConversationSearch(item, searchQuery));
  }

  const matchedActiveChat = conversationList.find((item) => item.key === activeChatId) || null;
  const activeChat = matchedActiveChat
    || (activeChatId?.startsWith('customer:')
      ? (() => {
          const activePhone = activeChatId.replace('customer:', '');
          const persistedContact = activeCustomerContactId
            ? contacts.find((contact) => contact?._id === activeCustomerContactId) || null
            : null;
          const matchingChat = chats.find((item) => normalize(item.phone) === normalize(activePhone)) || null;

          if (persistedContact) {
            return normalizeCustomerConversation({
              contact: persistedContact,
              chat: {
                ...(matchingChat || {}),
                phone: activePhone,
              },
            });
          }

          return {
            id: activeChatId,
            conversationType: 'customer',
            conversationId: activePhone,
            key: activeChatId,
            title: activePhone,
            name: activePhone,
            phone: activePhone,
            phones: [],
            isInternal: false,
            isTeam: false,
          };
        })()
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
      setActiveCustomerContactId(activeChat?._id || null);
      markChatRead(nextChat);
    };

    window.addEventListener('switchChatNumber', handler);
    return () => window.removeEventListener('switchChatNumber', handler);
  }, [activeChat?._id, markChatRead]);

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

            if (msg.senderId === currentUserId) {
              const msgTime = msg.createdAt ? new Date(msg.createdAt).getTime() : null;
              const tempIndex = prev.findIndex((item) => {
                if (item.status !== 'sending') return false;
                if (item.direction !== 'outbound') return false;
                if ((item.conversationType || 'customer') !== msg.conversationType) return false;
                if ((item.conversationId || '') !== msg.conversationId) return false;
                if (item.body !== msg.body) return false;
                if (!msgTime || !item.createdAt) return true;

                const tempTime = new Date(item.createdAt).getTime();
                return Math.abs(tempTime - msgTime) < 120000;
              });

              if (tempIndex !== -1) {
                const next = [...prev];
                next[tempIndex] = normalizedMessage;
                return next;
              }
            }

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

      const normalizedCustomerMessage = normalizeCustomerConversation({
        chat: {
          phone: msg.conversationId || msg.from || msg.to,
          lastMessage: msg.body || '',
          unread: !msg.direction || msg.direction === 'inbound' ? 1 : 0,
          updatedAt: msg.createdAt || new Date().toISOString(),
        },
      });
      const customerConversationId = normalize(msg.conversationId || msg.from || msg.to);
      const customerConversationKey = buildConversationKey('customer', customerConversationId);
      const activePhone = activeCustomerPhone;
      const isActiveCustomerConversation = activeConversationType === 'customer'
        && customerConversationKey === activeChatId;

      if (isActiveCustomerConversation) {
        setMessages((prev) => {
          const exists = prev.find(
            (item) =>
              (msg._id && item._id === msg._id)
              || (msg.sid && item.sid === msg.sid)
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

          if (msg.direction === 'inbound') {
            fetch(`${BASE_URL}/api/sms/read/${activePhone}`, {
              method: 'PUT',
            }).catch((error) => console.error('Mark customer read error:', error));
          }
        }
      }

      if (!activePhone && (!msg.direction || msg.direction === 'inbound')) {
        setChats((prev) => {
          const exists = prev.find((item) => normalize(item.phone) === normalize(normalizedCustomerMessage.phone));
          if (exists) return prev;
          return [
            ...prev,
            {
              phone: normalizedCustomerMessage.phone,
              name: normalizedCustomerMessage.title,
              lastMessage: normalizedCustomerMessage.lastMessage,
              unread: normalizedCustomerMessage.unreadCount,
              updatedAt: normalizedCustomerMessage.lastMessageAt,
            },
          ];
        });
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
    setActiveSection('customers');
    setActiveChatId(buildConversationKey('customer', normalized));
    setActiveCustomerContactId(null);
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

    if ((conversation.conversationType || 'customer') === 'customer') {
      setActiveSection('customers');
    } else if ((conversation.conversationType || '') === 'internal_dm') {
      setActiveSection('internal');
    } else if ((conversation.conversationType || '') === 'team') {
      setActiveSection('teams');
    }

    setActiveChatId(nextKey);
    setActiveCustomerContactId(
      (conversation.conversationType || 'customer') === 'customer'
        ? (conversation._id || null)
        : null
    );
    markChatRead(conversation);
  };

  const handleImportContactsSuccess = useCallback(async () => {
    setShowImportTools(false);
    setShowToolsMenu(false);

    await Promise.allSettled([
      fetchContacts(),
      fetchConversations(),
    ]);
  }, [fetchContacts, fetchConversations]);

  const isChatOpen = Boolean(activeChatId);
  const threadCount = filteredList.length;
  const unreadThreadCount = filteredList.filter(hasUnreadConversation).length;
  const canCreateCustomerMessage = activeSection === 'customers';
  const canStartDirectMessage = activeSection === 'internal';
  const canImportContacts = activeSection === 'customers';
  const hasMoreActions = canStartDirectMessage || canImportContacts;

  return (
    <div className={`page-shell messages-shell${isChatOpen ? ' is-chat-open' : ''}`}>
      <div className="messages-contacts-pane">
        <div className="messages-panel-header">
          <div className="messages-panel-title-row">
            <h1 className="page-title">{viewConfig.pageTitle}</h1>
            <span className="tag">{threadCount} threads</span>
            <span className="tag">{unreadThreadCount} unread</span>
          </div>
          <p className="page-subtitle">{viewConfig.pageSubtitle}</p>
        </div>

        <div className="messages-toolbar">
          <label className="messages-search" htmlFor="messages-search">
            <Search size={15} />
            <input
              id="messages-search"
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search conversations"
            />
          </label>

          <div className="messages-toolbar-actions">
            <button
              onClick={() => setShowUnreadOnly((prev) => !prev)}
              className={`messages-filter-btn messages-filter-btn-inline${showUnreadOnly ? ' is-active' : ''}`}
              type="button"
            >
              Unread {unreadThreadCount > 0 ? `(${unreadThreadCount})` : ''}
            </button>

            {canCreateCustomerMessage ? (
              <button
                onClick={() => setShowModal(true)}
                className="messages-new-button"
                type="button"
              >
                <Plus size={16} />
                {viewConfig.primaryActionLabel}
              </button>
            ) : null}

            {canStartDirectMessage ? (
              <button
                onClick={() => setShowTeammatePicker(true)}
                className="messages-new-button"
                type="button"
              >
                <Plus size={16} />
                {viewConfig.primaryActionLabel}
              </button>
            ) : null}

            {hasMoreActions ? (
              <div className="messages-tools-menu">
                <button
                  type="button"
                  className={`messages-tools-trigger${showToolsMenu ? ' is-open' : ''}`}
                  onClick={() => setShowToolsMenu((prev) => !prev)}
                  aria-expanded={showToolsMenu}
                  aria-label="More actions"
                >
                  <MoreHorizontal size={16} />
                  <span className="messages-tools-label">More</span>
                </button>

                {showToolsMenu ? (
                  <div className="messages-tools-dropdown">
                    {canStartDirectMessage ? (
                      <button
                        onClick={() => {
                          setShowTeammatePicker(true);
                          setShowToolsMenu(false);
                        }}
                        className="messages-tools-option"
                        type="button"
                      >
                        Message Teammate
                      </button>
                    ) : null}
                    {canImportContacts ? (
                      <button
                        onClick={() => {
                          setShowImportTools((prev) => !prev);
                          setShowToolsMenu(false);
                        }}
                        className={`messages-tools-option${showImportTools ? ' is-active' : ''}`}
                        type="button"
                      >
                        {showImportTools ? 'Hide Import Contacts' : 'Import Contacts'}
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        <ContactsList
          list={filteredList}
          activeId={activeChatId}
          activeContactId={activeChat?.conversationType === 'customer' ? (activeChat?._id || activeCustomerContactId) : null}
          onSelect={handleSelectChat}
          activeSection={activeSection}
          showUnreadOnly={showUnreadOnly}
          showImportTools={canImportContacts && showImportTools}
          onImportSuccess={handleImportContactsSuccess}
          emptyTitle={viewConfig.emptyLabel}
          emptySubtitle={viewConfig.emptySubtitle}
        />
      </div>

      <div className="messages-chat-pane">
        <ChatWindow
          chat={activeChat}
          messages={messages}
          setMessages={setMessages}
          currentUserId={currentUserId}
          onSwitchNumber={(num) => {
            setActiveChatId(buildConversationKey('customer', normalize(num)));
            setActiveCustomerContactId(activeChat?._id || null);
          }}
          onAssignContact={handleAssignContact}
          onUpdateAssignmentStatus={handleUpdateAssignmentStatus}
          assignableAgents={assignableAgents}
          onBack={() => setActiveChatId(null)}
          showBack={isChatOpen}
        />
      </div>

      <NewMessageModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onStart={handleStartChat}
      />

      {showTeammatePicker && (
        <div
          className="messages-picker-overlay"
          onClick={() => !startingDirectChat && setShowTeammatePicker(false)}
        >
          <div
            className="messages-picker-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="messages-picker-header">
              <h3>Message teammate</h3>
              <p>Start or reopen a direct internal chat.</p>
            </div>

            <div className="messages-picker-list">
              {teammateOptions.length === 0 ? (
                <div className="messages-picker-empty">No teammates available.</div>
              ) : (
                teammateOptions.map((agent) => (
                  <button
                    key={agent.agentId}
                    type="button"
                    className="messages-picker-option"
                    onClick={() => handleStartDirectChat(agent.agentId)}
                    disabled={startingDirectChat}
                  >
                    <span className="messages-picker-option-name">{agent.name}</span>
                    <span className="messages-picker-option-role">{agent.role}</span>
                  </button>
                ))
              )}
            </div>

            <div className="messages-picker-footer">
              <button
                type="button"
                className="messages-picker-cancel"
                onClick={() => setShowTeammatePicker(false)}
                disabled={startingDirectChat}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default MessagesPage;
