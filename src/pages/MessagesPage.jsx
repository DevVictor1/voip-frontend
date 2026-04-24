import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import ContactsList from '../components/ContactsList';
import ChatWindow from '../components/ChatWindow';
import NewMessageModal from '../components/NewMessageModal';
import socket from '../socket';
import BASE_URL from '../config/api';
import { Plus, Search } from 'lucide-react';
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
  const rawId = String(conversationId || '');
  const safeId = conversationType === 'customer'
    ? (rawId.includes('|') ? rawId : normalize(rawId))
    : rawId;
  return `${conversationType}:${safeId}`;
};

const normalizeUnreadCount = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

const parseTextingGroupConversationId = (value) => {
  const raw = String(value || '');
  if (!raw.includes('|')) {
    return {
      textingGroupId: '',
      phone: normalize(raw),
    };
  }

  const [textingGroupId, phone] = raw.split('|');
  return {
    textingGroupId: String(textingGroupId || '').trim().toLowerCase(),
    phone: normalize(phone),
  };
};

const getCustomerMessagePhone = (message) => normalize(
  message?.conversationId || message?.from || message?.to || ''
);

const findMatchingOptimisticOutboundIndex = (messages, nextMessage) => {
  if (!nextMessage || nextMessage.direction !== 'outbound') return -1;

  const nextBody = String(nextMessage.body || '').trim();
  const nextConversationId = String(nextMessage.conversationId || '');
  const nextTextingGroupId = String(nextMessage.textingGroupId || '').trim().toLowerCase();
  const nextCreatedAt = nextMessage.createdAt ? new Date(nextMessage.createdAt).getTime() : null;

  return (messages || []).findIndex((item) => {
    if (!item?._id || !String(item._id).startsWith('temp-')) return false;
    if (item.status !== 'sending') return false;
    if (item.direction !== 'outbound') return false;
    if (String(item.conversationType || 'customer') !== String(nextMessage.conversationType || 'customer')) return false;
    if (String(item.conversationId || '') !== nextConversationId) return false;
    if (String(item.textingGroupId || '').trim().toLowerCase() !== nextTextingGroupId) return false;
    if (String(item.body || '').trim() !== nextBody) return false;

    if (!nextCreatedAt || !item.createdAt) return true;

    const optimisticCreatedAt = new Date(item.createdAt).getTime();
    return Math.abs(optimisticCreatedAt - nextCreatedAt) < 120000;
  });
};

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
  const textingGroupId = chat?.textingGroupId || contact?.textingGroupId || '';
  const conversationId = textingGroupId ? `${textingGroupId}|${primaryPhone}` : primaryPhone;
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
    lastMessageSenderName: chat?.lastMessageSenderName || '',
    lastMessageAt,
    updatedAt: lastMessageAt,
    unreadCount,
    unread: unreadCount,
    _id: persistedContactId,
    assignedTo: resolvedAssignedTo,
    isUnassigned: resolvedIsUnassigned,
    assignmentStatus: resolvedAssignmentStatus,
    textingGroupId: textingGroupId || null,
    textingGroupName: chat?.textingGroupName || contact?.textingGroupName || null,
    assignedNumber: chat?.assignedNumber || '',
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
  const lastMessageSenderName = conversationType === 'team'
    ? (conversation?.lastMessageSenderName || '')
    : '';

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
    lastMessageSenderName,
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

const INTERNAL_CHAT_RECENTS_STORAGE_KEY = 'voip_internal_chat_recent_searches';
const INTERNAL_CHAT_RECENTS_LIMIT = 5;

function MessagesPage({
  currentRole: providedRole,
  currentUserId: providedUserId,
  viewMode = 'customers',
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const [chats, setChats] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [internalChats, setInternalChats] = useState([]);
  const [textingGroups, setTextingGroups] = useState([]);
  const [textingGroupThreads, setTextingGroupThreads] = useState([]);
  const [selectedTextingGroupId, setSelectedTextingGroupId] = useState(null);
  const [smsMode, setSmsMode] = useState('direct');
  const [textingGroupSearchQuery, setTextingGroupSearchQuery] = useState('');
  const [textingGroupThreadSearch, setTextingGroupThreadSearch] = useState('');
  const [textingGroupLoading, setTextingGroupLoading] = useState(false);
  const [textingGroupThreadsLoading, setTextingGroupThreadsLoading] = useState(false);
  const [showSmsModeChooser, setShowSmsModeChooser] = useState(false);
  const [activeChatId, setActiveChatId] = useState(null);
  const [activeCustomerContactId, setActiveCustomerContactId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [teamThreadLoading, setTeamThreadLoading] = useState(false);
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
  const [internalChatFilter, setInternalChatFilter] = useState('all');
  const [internalTeamsFilter, setInternalTeamsFilter] = useState('all');
  const [teammatePickerQuery, setTeammatePickerQuery] = useState('');
  const [recentInternalSearches, setRecentInternalSearches] = useState(() => {
    if (typeof window === 'undefined') return [];

    try {
      const stored = JSON.parse(window.localStorage.getItem(INTERNAL_CHAT_RECENTS_STORAGE_KEY) || '[]');
      return Array.isArray(stored) ? stored.slice(0, INTERNAL_CHAT_RECENTS_LIMIT) : [];
    } catch (error) {
      return [];
    }
  });

  const currentRole = providedRole || getEffectiveRole();
  const currentUserId = providedUserId || getEffectiveAgentId() || 'agent_1';
  const storedAuthUser = getStoredAuthUser();
  const currentAuthUserDbId = storedAuthUser?.id || storedAuthUser?._id || '';
  const isSmsPage = resolvedViewMode === 'customers';
  const isInternalChatPage = resolvedViewMode === 'internal';
  const isInternalTeamsPage = resolvedViewMode === 'teams';
  const [showTeamCreator, setShowTeamCreator] = useState(false);
  const [teamCreatorQuery, setTeamCreatorQuery] = useState('');
  const [teamCreatorName, setTeamCreatorName] = useState('');
  const [selectedTeamMembers, setSelectedTeamMembers] = useState([]);
  const [creatingTeam, setCreatingTeam] = useState(false);
  const [showTeamDetails, setShowTeamDetails] = useState(false);
  const [teamDetailsLoading, setTeamDetailsLoading] = useState(false);
  const [teamDetailsSaving, setTeamDetailsSaving] = useState(false);
  const [teamDetailsError, setTeamDetailsError] = useState('');
  const [teamDetailsSuccess, setTeamDetailsSuccess] = useState('');
  const [teamDetailsData, setTeamDetailsData] = useState(null);
  const [teamDetailsName, setTeamDetailsName] = useState('');
  const [teamDetailsMembers, setTeamDetailsMembers] = useState([]);
  const [teamDetailsSearch, setTeamDetailsSearch] = useState('');
  const [showDeleteTeamConfirm, setShowDeleteTeamConfirm] = useState(false);
  const [deletingTeam, setDeletingTeam] = useState(false);
  const [toast, setToast] = useState(null);
  const teamMessagesCacheRef = useRef({});
  const activeTeamRequestRef = useRef('');
  const pendingDirectorySmsPhoneRef = useRef(
    normalize(location.state?.phone || '')
  );

  useEffect(() => {
    setActiveSection(viewConfig.section);
    setActiveChatId(null);
    setActiveCustomerContactId(null);
    setMessages([]);
    setTeamThreadLoading(false);
    setShowModal(false);
    setSmsMode('direct');
    setTextingGroups([]);
    setTextingGroupThreads([]);
    setSelectedTextingGroupId(null);
    setTextingGroupSearchQuery('');
    setTextingGroupThreadSearch('');
    setTextingGroupLoading(false);
    setTextingGroupThreadsLoading(false);
    setShowSmsModeChooser(false);
    setShowTeammatePicker(false);
    setShowUnreadOnly(false);
    setShowToolsMenu(false);
    setInternalChatFilter('all');
    setInternalTeamsFilter('all');
    setTeammatePickerQuery('');
    setShowTeamCreator(false);
    setTeamCreatorQuery('');
    setTeamCreatorName('');
    setSelectedTeamMembers([]);
    setCreatingTeam(false);
    setShowTeamDetails(false);
    setTeamDetailsLoading(false);
    setTeamDetailsSaving(false);
    setTeamDetailsError('');
    setTeamDetailsSuccess('');
    setTeamDetailsData(null);
    setTeamDetailsName('');
    setTeamDetailsMembers([]);
    setTeamDetailsSearch('');
    setShowDeleteTeamConfirm(false);
    setDeletingTeam(false);
    setToast(null);
  }, [viewConfig.section]);

  useEffect(() => {
    if (!toast) return undefined;

    const timeoutId = window.setTimeout(() => {
      setToast(null);
    }, 2500);

    return () => window.clearTimeout(timeoutId);
  }, [toast]);

  useEffect(() => {
    if (!teamDetailsSuccess) return undefined;

    const timeoutId = window.setTimeout(() => {
      setTeamDetailsSuccess('');
    }, 2500);

    return () => window.clearTimeout(timeoutId);
  }, [teamDetailsSuccess]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    window.localStorage.setItem(
      INTERNAL_CHAT_RECENTS_STORAGE_KEY,
      JSON.stringify(recentInternalSearches.slice(0, INTERNAL_CHAT_RECENTS_LIMIT))
    );
  }, [recentInternalSearches]);

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

  const fetchTextingGroups = useCallback(async () => {
    if (!isSmsPage) return [];

    try {
      setTextingGroupLoading(true);
      const params = new URLSearchParams({
        userId: currentUserId,
        role: currentRole,
      });
      const res = await fetch(`${BASE_URL}/api/sms/texting-groups?${params.toString()}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      const nextGroups = Array.isArray(data) ? data : [];
      setTextingGroups(nextGroups);
      return nextGroups;
    } catch (err) {
      console.error('Fetch texting groups error:', err);
      setTextingGroups([]);
      return [];
    } finally {
      setTextingGroupLoading(false);
    }
  }, [currentRole, currentUserId, isSmsPage]);

  const fetchTextingGroupThreads = useCallback(async (groupId) => {
    if (!groupId) {
      setTextingGroupThreads([]);
      return [];
    }

    try {
      setTextingGroupThreadsLoading(true);
      const params = new URLSearchParams({
        userId: currentUserId,
        role: currentRole,
      });
      const res = await fetch(
        `${BASE_URL}/api/sms/texting-groups/${encodeURIComponent(groupId)}/conversations?${params.toString()}`
      );
      if (!res.ok) throw new Error();
      const data = await res.json();
      const nextThreads = Array.isArray(data)
        ? data.map((chat) => normalizeCustomerConversation({ chat }))
        : [];
      setTextingGroupThreads(nextThreads);
      return nextThreads;
    } catch (err) {
      console.error('Fetch texting group conversations error:', err);
      setTextingGroupThreads([]);
      return [];
    } finally {
      setTextingGroupThreadsLoading(false);
    }
  }, [currentRole, currentUserId]);

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

  const fetchTextingGroupMessages = useCallback(async (groupId, phone) => {
    if (!groupId || !phone) {
      setMessages([]);
      return [];
    }

    try {
      const params = new URLSearchParams({
        userId: currentUserId,
        role: currentRole,
      });
      const res = await fetch(
        `${BASE_URL}/api/sms/texting-groups/${encodeURIComponent(groupId)}/messages/${encodeURIComponent(phone)}?${params.toString()}`
      );
      if (!res.ok) throw new Error();

      const data = await res.json();
      setMessages(data || []);
      return data || [];
    } catch (err) {
      console.error('Fetch texting group messages error:', err);
      setMessages([]);
      return [];
    }
  }, [currentRole, currentUserId]);

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
      return data || [];
    } catch (err) {
      console.error('Fetch internal messages error:', err);
      return [];
    }
  }, [currentRole, currentUserId]);

  const markChatRead = useCallback((conversation) => {
    if (!conversation) return;

    if (conversation.conversationType === 'customer') {
      const { textingGroupId, phone } = parseTextingGroupConversationId(
        conversation.conversationId || conversation.phone
      );
      const target = normalize(phone || conversation.phone || conversation.conversationId);

      if (textingGroupId) {
        setTextingGroupThreads((prev) =>
          prev.map((item) =>
            item.textingGroupId === textingGroupId && normalize(item.phone) === target
              ? { ...item, unread: 0, unreadCount: 0 }
              : item
          )
        );
        setTextingGroups((prev) =>
          prev.map((item) =>
            (item.groupId || item.id) === textingGroupId
              ? { ...item, unread: Math.max(0, Number(item.unread || 0) - Number(conversation.unread || 0)) }
              : item
          )
        );
      } else {
        setChats((prev) =>
          prev.map((item) =>
            normalize(item.phone) === target ? { ...item, unread: 0 } : item
          )
        );
      }
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
    fetchTextingGroups();
    fetchContacts();
    fetchInternalConversations();
    fetchTeammates();
  }, [fetchContacts, fetchConversations, fetchInternalConversations, fetchTeammates, fetchTextingGroups]);

  useEffect(() => {
    if (!isSmsPage) return;

    const wantsChooser = Boolean(location.state?.openSmsModeChooser);
    if (wantsChooser) {
      setShowSmsModeChooser(true);
      return;
    }

    if (location.state?.smsMode === 'texting-group' && textingGroups.length > 0) {
      setSmsMode('texting-group');
      setSelectedTextingGroupId((prev) => prev || textingGroups[0]?.groupId || textingGroups[0]?.id || null);
    }
  }, [isSmsPage, location.state, textingGroups]);

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

  const teammatePickerOptions = useMemo(() => {
    const normalizedQuery = teammatePickerQuery.trim().toLowerCase();
    if (!normalizedQuery) return teammateOptions;

    return teammateOptions.filter((agent) => {
      const haystack = [agent.name, agent.role, agent.agentId]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return haystack.includes(normalizedQuery);
    });
  }, [teammateOptions, teammatePickerQuery]);

  const teamCreatorOptions = useMemo(() => {
    const normalizedQuery = teamCreatorQuery.trim().toLowerCase();
    if (!normalizedQuery) return teammateOptions;

    return teammateOptions.filter((agent) => {
      const haystack = [agent.name, agent.role, agent.agentId]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return haystack.includes(normalizedQuery);
    });
  }, [teammateOptions, teamCreatorQuery]);

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

  const removeInternalConversation = useCallback((conversationId) => {
    if (!conversationId) return;

    setInternalChats((prev) => prev.filter((item) => item.conversationId !== conversationId));
  }, []);

  const rememberInternalSearch = useCallback((entry) => {
    if (!entry?.agentId) return;

    setRecentInternalSearches((prev) => {
      const nextEntry = {
        agentId: entry.agentId,
        name: entry.name || entry.agentId,
        role: entry.role || 'Teammate',
      };

      return [
        nextEntry,
        ...prev.filter((item) => item.agentId !== nextEntry.agentId),
      ].slice(0, INTERNAL_CHAT_RECENTS_LIMIT);
    });
  }, []);

  const toggleTeamMemberSelection = useCallback((agentId) => {
    if (!agentId) return;

    setSelectedTeamMembers((prev) => (
      prev.includes(agentId)
        ? prev.filter((item) => item !== agentId)
        : [...prev, agentId]
    ));
  }, []);

  const handleCreateGroupChat = useCallback(async () => {
    const trimmedName = teamCreatorName.trim();
    const participantIds = teammateOptions
      .filter((agent) => selectedTeamMembers.includes(agent.agentId))
      .map((agent) => agent.agentId);

    if (!trimmedName || participantIds.length === 0 || creatingTeam) {
      return;
    }

    try {
      setCreatingTeam(true);

      const res = await fetch(`${BASE_URL}/api/messages/team`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: currentUserId,
          role: currentRole,
          teamName: trimmedName,
          participantIds,
        }),
      });

      const payload = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(payload?.error || 'Failed to create group chat');
      }

      upsertInternalConversation({
        conversationType: 'team',
        type: 'team',
        id: payload.conversationId,
        conversationId: payload.conversationId,
        teamId: payload.teamId,
        teamName: payload.teamName,
        name: payload.teamName,
        role: 'Group chat',
        participants: payload.members?.map((member) => member.agentId) || [],
        lastMessage: '',
        updatedAt: payload.updatedAt || new Date().toISOString(),
        unread: 0,
        isInternal: true,
        isTeam: true,
        previewFallback: `Start the conversation in ${payload.teamName}`,
      });

      setActiveSection('teams');
      setActiveChatId(buildConversationKey('team', payload.conversationId));
      setMessages([]);
      setShowTeamCreator(false);
      setTeamCreatorQuery('');
      setTeamCreatorName('');
      setSelectedTeamMembers([]);
      setToast({ type: 'success', message: 'Group created successfully' });
      fetchInternalConversations();
    } catch (error) {
      console.error('Create group chat error:', error);
      window.alert(error.message || 'Failed to create group chat');
    } finally {
      setCreatingTeam(false);
    }
  }, [creatingTeam, currentRole, currentUserId, fetchInternalConversations, selectedTeamMembers, teamCreatorName, teammateOptions, upsertInternalConversation]);

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
      setTeammatePickerQuery('');
      rememberInternalSearch({
        agentId: otherAgent.agentId,
        name: otherAgent.name,
        role: otherAgent.role,
      });
      fetchInternalConversations();
    } catch (err) {
      console.error('Start direct chat error:', err);
    } finally {
      setStartingDirectChat(false);
    }
  }, [currentUserId, fetchInternalConversations, rememberInternalSearch, startingDirectChat, upsertInternalConversation, workspaceUserDirectory]);

  const conversationList = buildConversationList({
    contacts,
    chats,
    internalChats,
    currentUserId,
    userDirectory: workspaceUserDirectory,
  });

  const fetchTeamDetails = useCallback(async (conversationId) => {
    if (!conversationId) return null;

    setTeamDetailsLoading(true);
    setTeamDetailsError('');
    setTeamDetailsSuccess('');

    try {
      const params = new URLSearchParams({
        userId: currentUserId,
        role: currentRole,
      });
      const res = await fetch(
        `${BASE_URL}/api/messages/team/${encodeURIComponent(conversationId)}/details?${params.toString()}`
      );
      const payload = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(payload?.error || 'Failed to load group details');
      }

      setTeamDetailsData(payload);
      setTeamDetailsName(payload.teamName || '');
      setTeamDetailsMembers((payload.members || []).map((member) => member.agentId));
      return payload;
    } catch (error) {
      console.error('Fetch team details error:', error);
      setTeamDetailsError(error.message || 'Failed to load group details');
      return null;
    } finally {
      setTeamDetailsLoading(false);
    }
  }, [currentRole, currentUserId]);

  const toggleTeamDetailsMember = useCallback((agentId) => {
    if (!agentId) return;

    setTeamDetailsMembers((prev) => (
      prev.includes(agentId)
        ? prev.filter((item) => item !== agentId)
        : [...prev, agentId]
    ));
  }, []);

  const handleSaveTeamDetails = useCallback(async () => {
    if (!teamDetailsData?.conversationId || teamDetailsSaving) return;

    try {
      setTeamDetailsSaving(true);
      setTeamDetailsError('');
      setTeamDetailsSuccess('');
      const previousName = teamDetailsData.teamName || '';
      const previousMembers = (teamDetailsData.members || []).map((member) => member.agentId);

      const res = await fetch(`${BASE_URL}/api/messages/team/${encodeURIComponent(teamDetailsData.conversationId)}/details`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: currentUserId,
          role: currentRole,
          teamName: teamDetailsName.trim(),
          memberIds: teamDetailsMembers,
        }),
      });
      const payload = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(payload?.error || 'Failed to save group details');
      }

      setTeamDetailsData(payload);
      setTeamDetailsName(payload.teamName || '');
      setTeamDetailsMembers((payload.members || []).map((member) => member.agentId));
      const nextMembers = (payload.members || []).map((member) => member.agentId);
      const addedCount = nextMembers.filter((memberId) => !previousMembers.includes(memberId)).length;
      const removedCount = previousMembers.filter((memberId) => !nextMembers.includes(memberId)).length;
      const nameChanged = previousName.trim() !== (payload.teamName || '').trim();
      upsertInternalConversation({
        conversationType: 'team',
        conversationId: payload.conversationId,
        teamId: payload.teamId,
        teamName: payload.teamName,
        name: payload.teamName,
        participants: (payload.members || []).map((member) => member.agentId),
        role: 'Group chat',
        isInternal: true,
        isTeam: true,
      });
      if (addedCount > 0 && removedCount === 0 && !nameChanged) {
        setTeamDetailsSuccess(addedCount === 1 ? 'Member added' : 'Members added');
      } else if (removedCount > 0 && addedCount === 0 && !nameChanged) {
        setTeamDetailsSuccess(removedCount === 1 ? 'Member removed' : 'Members removed');
      } else if (nameChanged && addedCount === 0 && removedCount === 0) {
        setTeamDetailsSuccess('Group renamed successfully');
      } else {
        setTeamDetailsSuccess('Group updated successfully');
      }
      fetchInternalConversations();
    } catch (error) {
      console.error('Save team details error:', error);
      setTeamDetailsError(error.message || 'Failed to save group details');
    } finally {
      setTeamDetailsSaving(false);
    }
  }, [currentRole, currentUserId, fetchInternalConversations, teamDetailsData, teamDetailsMembers, teamDetailsName, teamDetailsSaving, upsertInternalConversation]);

  const handleLeaveTeam = useCallback(async () => {
    if (!teamDetailsData?.conversationId || teamDetailsSaving) return;
    if (!window.confirm(`Leave ${teamDetailsData.teamName}?`)) return;

    try {
      setTeamDetailsSaving(true);
      setTeamDetailsError('');

      const res = await fetch(`${BASE_URL}/api/messages/team/${encodeURIComponent(teamDetailsData.conversationId)}/leave`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: currentUserId,
          role: currentRole,
        }),
      });
      const payload = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(payload?.error || 'Failed to leave group');
      }

      setShowTeamDetails(false);
      setTeamDetailsData(null);
      setTeamDetailsName('');
      setTeamDetailsMembers([]);
      setTeamDetailsSearch('');
      setShowDeleteTeamConfirm(false);
      removeInternalConversation(teamDetailsData.conversationId);
      setActiveChatId((prev) => (
        prev === buildConversationKey('team', teamDetailsData.conversationId)
          ? null
          : prev
      ));
      setMessages([]);
      setToast({ type: 'success', message: 'You left the group' });
      fetchInternalConversations();
    } catch (error) {
      console.error('Leave team error:', error);
      setTeamDetailsError(error.message || 'Failed to leave group');
    } finally {
      setTeamDetailsSaving(false);
    }
  }, [currentRole, currentUserId, fetchInternalConversations, removeInternalConversation, teamDetailsData, teamDetailsSaving]);

  const handleDeleteTeam = useCallback(async () => {
    if (!teamDetailsData?.conversationId || deletingTeam) return;

    try {
      setDeletingTeam(true);
      setTeamDetailsError('');

      const res = await fetch(`${BASE_URL}/api/messages/team/${encodeURIComponent(teamDetailsData.conversationId)}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: currentUserId,
          role: currentRole,
        }),
      });
      const payload = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(payload?.error || 'Failed to delete group');
      }

      removeInternalConversation(teamDetailsData.conversationId);
      setShowDeleteTeamConfirm(false);
      setShowTeamDetails(false);
      setTeamDetailsData(null);
      setTeamDetailsName('');
      setTeamDetailsMembers([]);
      setTeamDetailsSearch('');
      setActiveChatId((prev) => (
        prev === buildConversationKey('team', teamDetailsData.conversationId)
          ? null
          : prev
      ));
      setMessages([]);
      setToast({ type: 'success', message: 'Group deleted' });
      fetchInternalConversations();
    } catch (error) {
      console.error('Delete team error:', error);
      setTeamDetailsError(error.message || 'Failed to delete group');
    } finally {
      setDeletingTeam(false);
    }
  }, [currentRole, currentUserId, deletingTeam, fetchInternalConversations, removeInternalConversation, teamDetailsData]);

  let filteredList = conversationList;

  if (activeSection === 'customers') {
    filteredList = conversationList.filter((item) => item.conversationType === 'customer');
  } else if (activeSection === 'internal') {
    filteredList = conversationList.filter((item) => item.conversationType === 'internal_dm');
  } else if (activeSection === 'teams') {
    filteredList = conversationList.filter((item) => item.conversationType === 'team');
  }

  const effectiveShowUnreadOnly = isInternalChatPage
    ? internalChatFilter === 'unread'
    : isInternalTeamsPage
      ? internalTeamsFilter === 'unread'
      : showUnreadOnly;

  if (effectiveShowUnreadOnly) {
    filteredList = filteredList.filter(
      (item) => !isDirectoryOnlyCustomer(item) && hasUnreadConversation(item)
    );
  }

  if (searchQuery.trim()) {
    filteredList = filteredList.filter((item) => matchesConversationSearch(item, searchQuery));
  }

  const matchedActiveChat = conversationList.find((item) => item.key === activeChatId) || null;
  const matchedTextingGroupThread = textingGroupThreads.find((item) => item.key === activeChatId) || null;
  const activeChat = matchedActiveChat
    || matchedTextingGroupThread
    || (activeChatId?.startsWith('customer:')
      ? (() => {
          const activeConversationKey = activeChatId.replace('customer:', '');
          const { textingGroupId, phone: parsedPhone } = parseTextingGroupConversationId(activeConversationKey);
          const activePhone = parsedPhone;
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
                textingGroupId: textingGroupId || persistedContact?.textingGroupId || '',
              },
            });
          }

          return {
            id: activeChatId,
            conversationType: 'customer',
            conversationId: textingGroupId ? `${textingGroupId}|${activePhone}` : activePhone,
            key: activeChatId,
            title: activePhone,
            name: activePhone,
            phone: activePhone,
            textingGroupId: textingGroupId || null,
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
  const canUseTextingGroups = isSmsPage && textingGroups.length > 0;
  const selectedTextingGroup = textingGroups.find(
    (group) => (group.groupId || group.id) === selectedTextingGroupId
  ) || null;
  const filteredTextingGroups = textingGroups.filter((group) => {
    const normalizedQuery = textingGroupSearchQuery.trim().toLowerCase();
    if (!normalizedQuery) return true;

    const haystack = [
      group.name,
      group.assignedNumber,
      ...(group.members || []),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    return haystack.includes(normalizedQuery);
  });
  const filteredTextingGroupThreads = textingGroupThreads.filter((item) => {
    if (showUnreadOnly && !hasUnreadConversation(item)) {
      return false;
    }

    return matchesConversationSearch(item, textingGroupThreadSearch || searchQuery);
  });

  const handleOpenTeamDetails = useCallback(async () => {
    if (!isInternalTeamsPage || activeChat?.conversationType !== 'team') return;

      setShowTeamDetails(true);
      setTeamDetailsSearch('');
      setTeamDetailsSuccess('');
      await fetchTeamDetails(activeChat.conversationId);
  }, [activeChat, fetchTeamDetails, isInternalTeamsPage]);

  useEffect(() => {
    if (!isSmsPage || smsMode !== 'texting-group') return;

    if (!selectedTextingGroupId) {
      if (textingGroups.length > 0) {
        setSelectedTextingGroupId(textingGroups[0]?.groupId || textingGroups[0]?.id || null);
      }
      return;
    }

    fetchTextingGroupThreads(selectedTextingGroupId);
  }, [fetchTextingGroupThreads, isSmsPage, selectedTextingGroupId, smsMode, textingGroups]);

  useEffect(() => {
    if (!activeConversationType) return;

    const loadChat = async () => {
      if (activeConversationType === 'customer') {
        const { textingGroupId, phone } = parseTextingGroupConversationId(activeConversationId || activeCustomerPhone);

        if (textingGroupId) {
          await fetchTextingGroupMessages(textingGroupId, phone);
          await fetch(`${BASE_URL}/api/sms/texting-groups/${encodeURIComponent(textingGroupId)}/read/${encodeURIComponent(phone)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: currentUserId }),
          });
          fetchTextingGroupThreads(textingGroupId);
          fetchTextingGroups();
        } else {
          await fetchCustomerMessages(phone);
          await fetch(`${BASE_URL}/api/sms/read/${phone}`, {
            method: 'PUT',
          });
          fetchConversations();
        }
      } else {
        const requestKey = buildConversationKey(activeConversationType, activeConversationId);
        const isTeamThread = activeConversationType === 'team';

        if (isTeamThread) {
          activeTeamRequestRef.current = requestKey;
          setTeamThreadLoading(true);
        }

        const data = await fetchInternalMessages(activeConversationId);

        if (!isTeamThread || activeTeamRequestRef.current === requestKey) {
          if (isTeamThread) {
            teamMessagesCacheRef.current[requestKey] = data || [];
            setTeamThreadLoading(false);
          }

          setMessages(data || []);
        }

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
    fetchTextingGroupMessages,
    fetchTextingGroupThreads,
    fetchTextingGroups,
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

      if (msg.textingGroupId) {
        const groupConversationId = `${msg.textingGroupId}|${normalize(msg.conversationId || msg.from || msg.to)}`;
        const groupConversationKey = buildConversationKey('customer', groupConversationId);
        const isActiveTextingGroupThread = activeConversationType === 'customer'
          && activeChatId === groupConversationKey;

        if (isActiveTextingGroupThread) {
          setMessages((prev) => {
            const exists = prev.find(
              (item) =>
                (msg._id && item._id === msg._id)
                || (msg.sid && item.sid === msg.sid)
            );
            if (exists) return prev;

            const optimisticIndex = findMatchingOptimisticOutboundIndex(prev, msg);
            if (optimisticIndex !== -1) {
              const next = [...prev];
              next[optimisticIndex] = msg;
              return next;
            }

            return [...prev, msg];
          });

          if (msg.direction === 'inbound') {
            fetch(`${BASE_URL}/api/sms/texting-groups/${encodeURIComponent(msg.textingGroupId)}/read/${encodeURIComponent(normalize(msg.conversationId || msg.from || msg.to))}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ userId: currentUserId }),
            }).catch((error) => console.error('Mark texting group read error:', error));
          }
        }

        if (selectedTextingGroupId === msg.textingGroupId) {
          fetchTextingGroupThreads(msg.textingGroupId);
        }

        fetchTextingGroups();
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
    fetchTextingGroupThreads,
    fetchTextingGroups,
    fetchInternalConversations,
    markChatRead,
    selectedTextingGroupId,
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

  useEffect(() => {
    const handleInternalMessageStatus = (payload) => {
      if (!payload?.conversationId || !payload?.conversationType || !Array.isArray(payload?.messageIds)) {
        return;
      }

      const messageIdSet = new Set(
        payload.messageIds
          .map((id) => String(id || '').trim())
          .filter(Boolean)
      );

      if (messageIdSet.size === 0) {
        return;
      }

      const applyStatus = (items = []) => items.map((item) => {
        const itemId = String(item?._id || '').trim();
        if (!itemId || !messageIdSet.has(itemId)) {
          return item;
        }

        const nextReadBy = payload.userId
          ? [...new Set([...(item.readBy || []), payload.userId].filter(Boolean))]
          : (item.readBy || []);

        return {
          ...item,
          status: payload.status || item.status,
          read: payload.status === 'read' ? true : item.read,
          readBy: nextReadBy,
        };
      });

      setMessages((prev) => applyStatus(prev));

      if (payload.conversationType === 'team') {
        const cacheKey = buildConversationKey(payload.conversationType, payload.conversationId);
        const cachedThread = teamMessagesCacheRef.current[cacheKey];

        if (Array.isArray(cachedThread)) {
          teamMessagesCacheRef.current[cacheKey] = applyStatus(cachedThread);
        }
      }
    };

    socket.on('internalMessageStatus', handleInternalMessageStatus);
    return () => socket.off('internalMessageStatus', handleInternalMessageStatus);
  }, []);

  const handleStartChat = (phone) => {
    const normalized = normalize(phone);
    setSmsMode('direct');
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

  const handleSelectTextingGroup = (groupId) => {
    setSmsMode('texting-group');
    setSelectedTextingGroupId(groupId);
    setActiveChatId(null);
    setActiveCustomerContactId(null);
    setMessages([]);
  };

  const handleStartTextingGroupChat = useCallback((phone, groupId = selectedTextingGroupId) => {
    const normalizedPhone = normalize(phone);
    if (!normalizedPhone || !groupId) return;

    setSmsMode('texting-group');
    setSelectedTextingGroupId(groupId);
    setActiveChatId(buildConversationKey('customer', `${groupId}|${normalizedPhone}`));
    setActiveCustomerContactId(null);
    setMessages([]);
    markChatRead({
      conversationType: 'customer',
      conversationId: `${groupId}|${normalizedPhone}`,
      phone: normalizedPhone,
      textingGroupId: groupId,
      unread: 0,
    });
  }, [markChatRead, selectedTextingGroupId]);

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

    if ((conversation.conversationType || '') === 'team') {
      const cachedMessages = teamMessagesCacheRef.current[nextKey];
      activeTeamRequestRef.current = nextKey;
      setMessages(Array.isArray(cachedMessages) ? cachedMessages : []);
      setTeamThreadLoading(!Array.isArray(cachedMessages));
    }

    markChatRead(conversation);

    if (isInternalChatPage && searchQuery.trim() && (conversation.conversationType || '') === 'internal_dm') {
      rememberInternalSearch({
        agentId: conversation.agentId,
        name: conversation.name || conversation.title || conversation.agentId,
        role: conversation.subtitle || conversation.role || 'Teammate',
      });
    }
  };

  const isChatOpen = Boolean(activeChatId);
  const smsVisibleList = isSmsPage && smsMode === 'texting-group'
    ? filteredTextingGroupThreads
    : filteredList;
  const threadCount = smsVisibleList.length;
  const unreadThreadCount = smsVisibleList.filter(hasUnreadConversation).length;
  const canCreateCustomerMessage = activeSection === 'customers';
  const canStartDirectMessage = activeSection === 'internal';
  const hasMoreActions = canStartDirectMessage;
  const internalRecentSearches = recentInternalSearches.filter((entry) => Boolean(entry?.agentId));
  const internalChatFilterTabs = [
    { id: 'all', label: 'All' },
    { id: 'unread', label: 'Unread' },
    { id: 'favorites', label: 'Favorites' },
  ];
  const internalTeamsFilterTabs = [
    { id: 'all', label: 'All' },
    { id: 'unread', label: 'Unread' },
    { id: 'favorites', label: 'Favorites' },
  ];
  const selectedTeamMemberRecords = teammateOptions.filter((agent) => selectedTeamMembers.includes(agent.agentId));
  const canCreateGroupDraft = teamCreatorName.trim() && selectedTeamMemberRecords.length > 0;
  const teamDetailsMemberMap = new Set(teamDetailsMembers);
  const teamDetailsMemberDirectory = teamDetailsMembers.map((agentId) => {
    const existingMember = (teamDetailsData?.members || []).find((member) => member.agentId === agentId);
    const teammate = teammateOptions.find((member) => member.agentId === agentId);

    return {
      agentId,
      name: existingMember?.name || teammate?.name || agentId,
      role: existingMember?.role || teammate?.role || 'Teammate',
      department: existingMember?.department || '',
      isCurrentUser: existingMember?.isCurrentUser || agentId === currentUserId,
    };
  });
  const filteredAvailableTeamMembers = teammateOptions.filter((agent) => {
    if (teamDetailsMemberMap.has(agent.agentId)) return false;

    const normalizedQuery = teamDetailsSearch.trim().toLowerCase();
    if (!normalizedQuery) return true;

    const haystack = [agent.name, agent.role, agent.agentId]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    return haystack.includes(normalizedQuery);
  });

  const closeSmsModeChooser = () => {
    setShowSmsModeChooser(false);
    navigate(location.pathname, { replace: true, state: {} });
  };

  const handleDirectorySmsChoice = (mode, groupId = null) => {
    const pendingPhone = pendingDirectorySmsPhoneRef.current;

    if (mode === 'texting-group' && groupId) {
      setSmsMode('texting-group');
      setSelectedTextingGroupId(groupId);

      const existingThread = textingGroupThreads.find(
        (item) => item.textingGroupId === groupId && normalize(item.phone) === pendingPhone
      );

      if (existingThread) {
        handleSelectChat(existingThread);
      } else if (pendingPhone) {
        handleStartTextingGroupChat(pendingPhone, groupId);
      }
    } else if (pendingPhone) {
      handleStartChat(pendingPhone);
    } else {
      setSmsMode('direct');
    }

    closeSmsModeChooser();
  };

  return (
    <div className={`page-shell messages-shell${isChatOpen ? ' is-chat-open' : ''}${isSmsPage ? ' is-sms-page' : ''}${isInternalChatPage ? ' is-internal-chat-page' : ''}${isInternalTeamsPage ? ' is-internal-teams-page' : ''}`}>
      {toast ? (
        <div className={`numbers-toast numbers-toast-${toast.type} messages-toast`}>
          {toast.message}
        </div>
      ) : null}

      <div className={`messages-contacts-pane${isSmsPage ? ' is-sms-pane' : ''}${isInternalChatPage ? ' is-internal-chat-pane' : ''}${isInternalTeamsPage ? ' is-internal-teams-pane' : ''}`}>
        <div className="messages-panel-header">
          <div className="messages-panel-title-row">
            <h1 className="page-title">{viewConfig.pageTitle}</h1>
            <span className="tag">{threadCount} threads</span>
            <span className="tag">{unreadThreadCount} unread</span>
          </div>
          <p className="page-subtitle">{viewConfig.pageSubtitle}</p>
        </div>

        {isInternalChatPage ? (
          <div className="internal-chat-toolbar">
            <div className="internal-chat-search-row">
              <label className="messages-search internal-chat-search" htmlFor="messages-search">
                <Search size={16} />
                <input
                  id="messages-search"
                  type="search"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search or start a new chat"
                />
              </label>

              <button
                onClick={() => setShowTeammatePicker(true)}
                className="internal-chat-new-chat"
                type="button"
                aria-label="Start a new chat"
              >
                <Plus size={16} />
                <span>New Chat</span>
              </button>
            </div>

            <div className="internal-chat-recents">
              <div className="internal-chat-recents-head">
                <span className="internal-chat-recents-label">Recent searches</span>
                <button
                  type="button"
                  className="internal-chat-clear"
                  onClick={() => setRecentInternalSearches([])}
                  disabled={internalRecentSearches.length === 0}
                >
                  Clear all
                </button>
              </div>

              {internalRecentSearches.length > 0 ? (
                <div className="internal-chat-recent-list">
                  {internalRecentSearches.map((entry) => (
                    <button
                      key={entry.agentId}
                      type="button"
                      className="internal-chat-recent-item"
                      onClick={() => handleStartDirectChat(entry.agentId)}
                    >
                      <span className="internal-chat-recent-avatar" aria-hidden="true">
                        {(entry.name || entry.agentId).trim().charAt(0).toUpperCase()}
                      </span>
                      <span className="internal-chat-recent-name">{entry.name || entry.agentId}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="internal-chat-recents-empty">
                  Recent teammate searches will appear here.
                </div>
              )}
            </div>

            <div className="internal-chat-filters" role="tablist" aria-label="Internal chat filters">
              {internalChatFilterTabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  className={`internal-chat-filter-tab${internalChatFilter === tab.id ? ' is-active' : ''}`}
                  onClick={() => setInternalChatFilter(tab.id)}
                  aria-pressed={internalChatFilter === tab.id}
                >
                  <span>{tab.label}</span>
                  {tab.id === 'unread' && unreadThreadCount > 0 ? (
                    <span className="internal-chat-filter-count">{unreadThreadCount}</span>
                  ) : null}
                </button>
              ))}
            </div>
          </div>
        ) : isInternalTeamsPage ? (
          <div className="internal-teams-toolbar">
            <div className="internal-teams-search-row">
              <label className="messages-search internal-teams-search" htmlFor="messages-search">
                <Search size={16} />
                <input
                  id="messages-search"
                  type="search"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search group chats"
                />
              </label>

              <button
                onClick={() => setShowTeamCreator(true)}
                className="internal-teams-new-group"
                type="button"
                aria-label="Create a new group chat"
              >
                <Plus size={16} />
                <span>New Group Chat</span>
              </button>
            </div>

            <div className="internal-teams-filters" role="tablist" aria-label="Internal team filters">
              {internalTeamsFilterTabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  className={`internal-teams-filter-tab${internalTeamsFilter === tab.id ? ' is-active' : ''}`}
                  onClick={() => setInternalTeamsFilter(tab.id)}
                  aria-pressed={internalTeamsFilter === tab.id}
                >
                  <span>{tab.label}</span>
                  {tab.id === 'unread' && unreadThreadCount > 0 ? (
                    <span className="internal-teams-filter-count">{unreadThreadCount}</span>
                  ) : null}
                </button>
              ))}
            </div>
          </div>
        ) : isSmsPage ? (
          <div className="sms-toolbar">
            <div className="sms-mode-switcher" role="tablist" aria-label="SMS inbox mode">
              <button
                type="button"
                className={`sms-mode-tab${smsMode === 'direct' ? ' is-active' : ''}`}
                onClick={() => {
                  setSmsMode('direct');
                  setActiveChatId(null);
                  setActiveCustomerContactId(null);
                  setMessages([]);
                }}
              >
                Direct
              </button>
              <button
                type="button"
                className={`sms-mode-tab${smsMode === 'texting-group' ? ' is-active' : ''}`}
                onClick={() => {
                  if (canUseTextingGroups) {
                    setSmsMode('texting-group');
                    setActiveChatId(null);
                    setActiveCustomerContactId(null);
                    setMessages([]);
                  }
                }}
                disabled={!canUseTextingGroups}
                title={canUseTextingGroups ? 'Open shared texting groups' : 'You do not belong to a texting group yet'}
              >
                Texting Group
              </button>
            </div>

            <label className="messages-search sms-search" htmlFor="messages-search">
              <Search size={16} />
              <input
                id="messages-search"
                type="search"
                value={smsMode === 'texting-group' ? textingGroupSearchQuery : searchQuery}
                onChange={(event) => {
                  if (smsMode === 'texting-group') {
                    setTextingGroupSearchQuery(event.target.value);
                  } else {
                    setSearchQuery(event.target.value);
                  }
                }}
                placeholder={smsMode === 'texting-group'
                  ? 'Search texting groups'
                  : 'Search conversations or phone number'}
              />
            </label>

            <div className="sms-toolbar-actions-row">
              <div className="sms-filters" role="tablist" aria-label="SMS inbox filters">
                {[
                  { id: 'all', label: 'All', count: threadCount },
                  { id: 'unread', label: 'Unread', count: unreadThreadCount },
                ].map((filter) => {
                  const isActive = filter.id === 'unread' ? showUnreadOnly : !showUnreadOnly;

                  return (
                    <button
                      key={filter.id}
                      type="button"
                      className={`sms-filter-tab${isActive ? ' is-active' : ''}`}
                      onClick={() => setShowUnreadOnly(filter.id === 'unread')}
                    >
                      <span>{filter.label}</span>
                      {filter.count > 0 ? (
                        <span className="sms-filter-count">{filter.count}</span>
                      ) : null}
                    </button>
                  );
                })}
              </div>

              {smsMode === 'direct' ? (
                <button
                  onClick={() => setShowModal(true)}
                  className="sms-new-message"
                  type="button"
                >
                  <Plus size={16} />
                  <span>New SMS</span>
                </button>
              ) : null}
            </div>
          </div>
        ) : (
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
                    <span>•••</span>
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
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        )}

        {isSmsPage && smsMode === 'texting-group' ? (
          <div className="sms-group-list">
            <div className="sms-group-list-scroll">
              {textingGroupLoading ? (
                <div className="empty-state contacts-empty-state">
                  <div className="empty-title">Loading texting groups</div>
                  <div className="empty-subtitle">Fetching shared inbox groups assigned to your user.</div>
                </div>
              ) : filteredTextingGroups.length > 0 ? (
                filteredTextingGroups.map((group) => {
                  const isActive = (group.groupId || group.id) === selectedTextingGroupId;
                  return (
                    <button
                      key={group.groupId || group.id}
                      type="button"
                      className={`sms-group-item${isActive ? ' is-active' : ''}`}
                      onClick={() => handleSelectTextingGroup(group.groupId || group.id)}
                    >
                      <div className="sms-group-item-name">{group.name}</div>
                      <div className="sms-group-item-meta">{group.assignedNumber || 'Assigned number pending'}</div>
                      <div className="sms-group-item-foot">
                        <span>{group.memberCount || 0} members</span>
                        {Number(group.unread || 0) > 0 ? (
                          <span className="unread-badge sms-group-unread-badge">{group.unread}</span>
                        ) : null}
                      </div>
                    </button>
                  );
                })
              ) : (
                <div className="empty-state contacts-empty-state">
                  <div className="empty-title">No texting groups yet</div>
                  <div className="empty-subtitle">Texting Group mode will appear here when a shared assigned-number group includes your user.</div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <ContactsList
            list={filteredList}
            activeId={activeChatId}
            activeContactId={activeChat?.conversationType === 'customer' ? (activeChat?._id || activeCustomerContactId) : null}
            onSelect={handleSelectChat}
            activeSection={activeSection}
            showUnreadOnly={effectiveShowUnreadOnly}
            emptyTitle={viewConfig.emptyLabel}
            emptySubtitle={viewConfig.emptySubtitle}
            hideHeader={isSmsPage || isInternalChatPage || isInternalTeamsPage}
            listVariant={isSmsPage ? 'sms' : isInternalChatPage ? 'internal-chat' : isInternalTeamsPage ? 'internal-teams' : 'default'}
          />
        )}
      </div>

      {isSmsPage ? (
        <div className={`messages-sms-region${smsMode === 'texting-group' ? ' is-texting-group-region' : ' is-direct-region'}`}>
          {smsMode === 'texting-group' ? (
            <aside className="sms-group-threads-pane">
              <div className="sms-group-threads-header">
                <div>
                  <div className="sms-group-threads-label">Recents</div>
                  <div className="sms-group-threads-title">
                    {selectedTextingGroup?.name ? `${selectedTextingGroup.name} inbox` : 'Select a group'}
                  </div>
                  <div className="sms-group-threads-subtitle">
                    {selectedTextingGroup
                      ? 'Shared customer and phone threads for this texting group'
                      : 'Choose a texting group to view its recent customer threads'}
                  </div>
                </div>
                {selectedTextingGroup?.assignedNumber ? (
                  <div className="sms-group-assigned-number">{selectedTextingGroup.assignedNumber}</div>
                ) : null}
              </div>

              <label className="messages-search sms-group-thread-search" htmlFor="sms-group-thread-search">
                <Search size={15} />
                <input
                  id="sms-group-thread-search"
                  type="search"
                  value={textingGroupThreadSearch}
                  onChange={(event) => setTextingGroupThreadSearch(event.target.value)}
                  placeholder="Search people"
                />
              </label>

              <ContactsList
                list={filteredTextingGroupThreads}
                activeId={activeChatId}
                activeContactId={null}
                onSelect={handleSelectChat}
                activeSection="customers"
                showUnreadOnly={effectiveShowUnreadOnly}
                emptyTitle={textingGroupThreadsLoading ? 'Loading shared threads' : (selectedTextingGroup ? 'No shared threads found' : 'Select a texting group')}
                emptySubtitle={textingGroupThreadsLoading ? 'Fetching shared customer conversations for this texting group.' : (selectedTextingGroup ? 'Shared customer SMS threads for this assigned number will appear here.' : 'Choose a texting group from the left to open its inbox.')}
                hideHeader
                listVariant="sms-group-threads"
              />
            </aside>
          ) : null}

          <div className="messages-chat-pane is-sms-chat-pane">
              <ChatWindow
                chat={activeChat}
                messages={messages}
                setMessages={setMessages}
                currentUserId={currentUserId}
                currentUserRole={currentRole}
                isSmsPage={isSmsPage}
                isTextingGroupThread={smsMode === 'texting-group' && Boolean(activeChat?.textingGroupId)}
                isDirectSmsThread={smsMode === 'direct'}
                selectedTextingGroup={smsMode === 'texting-group' ? selectedTextingGroup : null}
                threadLoading={false}
                showTeamDetailsAction={false}
                onOpenTeamDetails={handleOpenTeamDetails}
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
        </div>
      ) : (
        <div className="messages-chat-pane">
          <ChatWindow
            chat={activeChat}
            messages={messages}
            setMessages={setMessages}
            currentUserId={currentUserId}
            currentUserRole={currentRole}
            isSmsPage={false}
            threadLoading={isInternalTeamsPage && activeChat?.conversationType === 'team' ? teamThreadLoading : false}
            showTeamDetailsAction={isInternalTeamsPage && activeChat?.conversationType === 'team'}
            onOpenTeamDetails={handleOpenTeamDetails}
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
      )}

      <NewMessageModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onStart={handleStartChat}
      />

      {showSmsModeChooser ? (
        <div className="messages-picker-overlay" onClick={closeSmsModeChooser}>
          <div className="messages-picker-modal sms-mode-chooser-modal" onClick={(event) => event.stopPropagation()}>
            <div className="messages-picker-header">
              <h3>Open SMS / MMS</h3>
              <p>Choose how you want to handle this client conversation.</p>
            </div>

            <div className="messages-picker-list sms-mode-chooser-list">
              <button
                type="button"
                className="messages-picker-option"
                onClick={() => handleDirectorySmsChoice('direct')}
              >
                <span className="messages-picker-option-name">Direct</span>
                <span className="messages-picker-option-role">Open the standard one-to-one SMS inbox.</span>
              </button>

              {canUseTextingGroups ? (
                textingGroups.map((group) => (
                  <button
                    key={group.groupId || group.id}
                    type="button"
                    className="messages-picker-option"
                    onClick={() => handleDirectorySmsChoice('texting-group', group.groupId || group.id)}
                  >
                    <span className="messages-picker-option-name">{group.name}</span>
                    <span className="messages-picker-option-role">
                      Texting Group · {group.assignedNumber || 'assigned number pending'}
                    </span>
                  </button>
                ))
              ) : null}
            </div>

            <div className="messages-picker-footer">
              <button type="button" className="messages-picker-cancel" onClick={closeSmsModeChooser}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showTeamCreator && (
        <div
          className="messages-picker-overlay"
          onClick={() => setShowTeamCreator(false)}
        >
          <div
            className="messages-picker-modal internal-teams-creator-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="messages-picker-header">
              <h3>New Group Chat</h3>
              <p>Create a new internal group chat with your teammates.</p>
            </div>

            <div className="internal-teams-creator-body">
              <div className="internal-teams-creator-field">
                <label htmlFor="team-group-name">Group name</label>
                <input
                  id="team-group-name"
                  type="text"
                  value={teamCreatorName}
                  onChange={(event) => setTeamCreatorName(event.target.value)}
                  placeholder="Enter a group name"
                />
              </div>

              <div className="internal-teams-creator-field">
                <label htmlFor="team-member-search">Add teammates</label>
                <div className="messages-picker-search">
                  <label className="messages-picker-search-field" htmlFor="team-member-search">
                    <Search size={15} />
                    <input
                      id="team-member-search"
                      type="search"
                      value={teamCreatorQuery}
                      onChange={(event) => setTeamCreatorQuery(event.target.value)}
                      placeholder="Search teammates"
                    />
                  </label>
                </div>
              </div>

              {selectedTeamMemberRecords.length > 0 ? (
                <div className="internal-teams-selected-members">
                  {selectedTeamMemberRecords.map((member) => (
                    <button
                      key={member.agentId}
                      type="button"
                      className="internal-teams-selected-pill"
                      onClick={() => toggleTeamMemberSelection(member.agentId)}
                    >
                      <span>{member.name}</span>
                      <span aria-hidden="true">×</span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="internal-teams-selected-empty">
                  Select one or more teammates to start the group.
                </div>
              )}

              <div className="internal-teams-member-list">
                {teamCreatorOptions.length === 0 ? (
                  <div className="messages-picker-empty">
                    {teammateOptions.length === 0 ? 'No teammates available.' : 'No teammates match your search.'}
                  </div>
                ) : (
                  teamCreatorOptions.map((agent) => {
                    const isSelected = selectedTeamMembers.includes(agent.agentId);

                    return (
                      <button
                        key={agent.agentId}
                        type="button"
                        className={`internal-teams-member-option${isSelected ? ' is-selected' : ''}`}
                        onClick={() => toggleTeamMemberSelection(agent.agentId)}
                      >
                        <span className="internal-teams-member-copy">
                          <span className="internal-teams-member-name">{agent.name}</span>
                          <span className="internal-teams-member-role">{agent.role}</span>
                        </span>
                        <span className="internal-teams-member-check" aria-hidden="true">
                          {isSelected ? 'Selected' : 'Select'}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            <div className="messages-picker-footer internal-teams-creator-footer">
              <button
                type="button"
                className="messages-picker-cancel"
                onClick={() => setShowTeamCreator(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="internal-teams-create-btn"
                onClick={handleCreateGroupChat}
                disabled={!canCreateGroupDraft || creatingTeam}
              >
                {creatingTeam ? 'Creating...' : 'Start Group Chat'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showTeamDetails && (
        <div
          className="messages-picker-overlay"
          onClick={() => !teamDetailsSaving && setShowTeamDetails(false)}
        >
          <div
            className="messages-picker-modal internal-teams-details-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="messages-picker-header">
              <h3>Group Details</h3>
              <p>View and manage this internal team chat.</p>
            </div>

            <div className="internal-teams-details-body">
              {teamDetailsLoading ? (
                <div className="messages-picker-empty">Loading group details…</div>
              ) : teamDetailsData ? (
                <>
                  {teamDetailsSuccess ? (
                    <div className="internal-teams-details-success">
                      {teamDetailsSuccess}
                    </div>
                  ) : null}

                  <div className="internal-teams-details-hero">
                    <div className="internal-teams-details-avatar" aria-hidden="true">
                      #
                    </div>
                    <div className="internal-teams-details-copy">
                      <div className="internal-teams-details-name">{teamDetailsName || teamDetailsData.teamName}</div>
                      <div className="internal-teams-details-meta">
                        {teamDetailsMemberDirectory.length} member{teamDetailsMemberDirectory.length === 1 ? '' : 's'}
                      </div>
                    </div>
                  </div>

                  {teamDetailsData.managementNote ? (
                    <div className="internal-teams-details-note">
                      {teamDetailsData.managementNote}
                    </div>
                  ) : null}

                  <div className="internal-teams-details-field">
                    <label htmlFor="team-details-name">Group name</label>
                    <input
                      id="team-details-name"
                      type="text"
                      value={teamDetailsName}
                      onChange={(event) => setTeamDetailsName(event.target.value)}
                      disabled={!teamDetailsData.canManage || teamDetailsSaving}
                      placeholder="Enter a group name"
                    />
                  </div>

                  <div className="internal-teams-details-section">
                    <div className="internal-teams-details-section-head">
                      <span>Members</span>
                      <span>{teamDetailsMemberDirectory.length}</span>
                    </div>
                    <div className="internal-teams-details-member-list">
                      {teamDetailsMemberDirectory.map((member) => {
                        const canRemove = teamDetailsData.canManage && !member.isCurrentUser;

                        return (
                          <div key={member.agentId} className="internal-teams-details-member-row">
                            <div className="internal-teams-details-member-copy">
                              <div className="internal-teams-details-member-name">
                                {member.name}
                                {member.isCurrentUser ? <span className="internal-teams-member-self">You</span> : null}
                              </div>
                              <div className="internal-teams-details-member-meta">
                                {member.department || member.role || member.agentId}
                              </div>
                            </div>
                            {canRemove ? (
                              <button
                                type="button"
                                className="internal-teams-member-remove"
                                onClick={() => toggleTeamDetailsMember(member.agentId)}
                                disabled={teamDetailsSaving}
                              >
                                Remove
                              </button>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="internal-teams-details-section">
                    <div className="internal-teams-details-section-head">
                      <span>Add members</span>
                    </div>
                    <label className="messages-picker-search-field internal-teams-details-search" htmlFor="team-details-search">
                      <Search size={15} />
                      <input
                        id="team-details-search"
                        type="search"
                        value={teamDetailsSearch}
                        onChange={(event) => setTeamDetailsSearch(event.target.value)}
                        placeholder="Search teammates"
                        disabled={!teamDetailsData.canManage || teamDetailsSaving}
                      />
                    </label>

                    <div className="internal-teams-member-list is-details">
                      {filteredAvailableTeamMembers.length === 0 ? (
                        <div className="messages-picker-empty">
                          {teamDetailsSearch.trim() ? 'No teammates match your search.' : 'No more teammates available to add.'}
                        </div>
                      ) : (
                        filteredAvailableTeamMembers.map((agent) => (
                          <button
                            key={agent.agentId}
                            type="button"
                            className="internal-teams-member-option"
                            onClick={() => toggleTeamDetailsMember(agent.agentId)}
                            disabled={!teamDetailsData.canManage || teamDetailsSaving}
                          >
                            <span className="internal-teams-member-copy">
                              <span className="internal-teams-member-name">{agent.name}</span>
                              <span className="internal-teams-member-role">{agent.role}</span>
                            </span>
                            <span className="internal-teams-member-check" aria-hidden="true">
                              Add
                            </span>
                          </button>
                        ))
                      )}
                    </div>
                  </div>

                  {teamDetailsData.canDelete ? (
                    <div className="internal-teams-danger-zone">
                      <div className="internal-teams-danger-copy">
                        <div className="internal-teams-danger-title">Delete Group</div>
                        <div className="internal-teams-danger-text">
                          Permanently remove this custom group from Internal Teams.
                        </div>
                      </div>
                      <button
                        type="button"
                        className="internal-teams-delete-btn"
                        onClick={() => setShowDeleteTeamConfirm(true)}
                        disabled={teamDetailsSaving || deletingTeam}
                      >
                        Delete Group
                      </button>
                    </div>
                  ) : null}
                </>
              ) : (
                <div className="messages-picker-empty">
                  {teamDetailsError || 'Group details are unavailable right now.'}
                </div>
              )}

              {teamDetailsError && teamDetailsData ? (
                <div className="internal-teams-details-error">{teamDetailsError}</div>
              ) : null}
            </div>

            <div className="messages-picker-footer internal-teams-details-footer">
              <button
                type="button"
                className="messages-picker-cancel"
                onClick={() => setShowTeamDetails(false)}
                disabled={teamDetailsSaving}
              >
                Close
              </button>
              {teamDetailsData?.canLeave ? (
                <button
                  type="button"
                  className="internal-teams-leave-btn"
                  onClick={handleLeaveTeam}
                  disabled={teamDetailsSaving || deletingTeam}
                >
                  {teamDetailsSaving ? 'Working…' : 'Leave Group'}
                </button>
              ) : null}
              {teamDetailsData?.canManage ? (
                <button
                  type="button"
                  className="internal-teams-create-btn"
                  onClick={handleSaveTeamDetails}
                  disabled={teamDetailsSaving || deletingTeam || !teamDetailsName.trim() || teamDetailsMembers.length === 0}
                >
                  {teamDetailsSaving ? 'Saving…' : 'Save Changes'}
                </button>
              ) : null}
            </div>
          </div>
        </div>
      )}

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

            <div className="messages-picker-search">
              <label className="messages-picker-search-field" htmlFor="teammate-picker-search">
                <Search size={15} />
                <input
                  id="teammate-picker-search"
                  type="search"
                  value={teammatePickerQuery}
                  onChange={(event) => setTeammatePickerQuery(event.target.value)}
                  placeholder="Search teammates"
                />
              </label>
            </div>

            <div className="messages-picker-list">
              {teammatePickerOptions.length === 0 ? (
                <div className="messages-picker-empty">
                  {teammateOptions.length === 0 ? 'No teammates available.' : 'No teammates match your search.'}
                </div>
              ) : (
                teammatePickerOptions.map((agent) => (
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

      {showDeleteTeamConfirm ? (
        <div
          className="messages-picker-overlay"
          onClick={() => !deletingTeam && setShowDeleteTeamConfirm(false)}
        >
          <div
            className="messages-picker-modal internal-teams-confirm-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="messages-picker-header">
              <h3>Delete Group</h3>
              <p>Are you sure you want to delete this group?</p>
            </div>

            <div className="internal-teams-confirm-body">
              <div className="internal-teams-confirm-warning">
                This action cannot be undone.
              </div>
            </div>

            <div className="messages-picker-footer internal-teams-confirm-footer">
              <button
                type="button"
                className="messages-picker-cancel"
                onClick={() => setShowDeleteTeamConfirm(false)}
                disabled={deletingTeam}
              >
                Cancel
              </button>
              <button
                type="button"
                className="internal-teams-delete-btn"
                onClick={handleDeleteTeam}
                disabled={deletingTeam}
              >
                {deletingTeam ? 'Deleting…' : 'Delete Group'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default MessagesPage;
