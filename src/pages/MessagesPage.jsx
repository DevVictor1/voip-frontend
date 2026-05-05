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
import { resolveEffectiveAvailabilityStatus } from '../utils/presence';

const normalize = (phone) => {
  if (!phone) return '';
  return phone.toString().replace(/\D/g, '').slice(-10);
};

const getContactDisplayName = (contact, fallbackPhone = '') => {
  const fullName = [contact?.firstName, contact?.lastName].filter(Boolean).join(' ').trim();
  return fullName || contact?.name || contact?.dba || fallbackPhone || 'Unknown contact';
};

const getPrimaryContactPhone = (contact) => {
  const phones = Array.isArray(contact?.phones) ? contact.phones : [];
  return phones.find((phone) => normalize(phone?.number))?.number || '';
};

const emptySmsContactForm = {
  name: '',
  phone: '',
  business: '',
  merchantId: '',
  notes: '',
};

const emptyTeamCalendarForm = {
  title: '',
  date: '',
  startTime: '',
  endTime: '',
  description: '',
};

const toLocalDateInputValue = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const toLocalTimeInputValue = (date = new Date()) => {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
};

const buildDefaultTeamCalendarForm = () => {
  const now = new Date();
  const start = new Date(now.getTime() + 60 * 60 * 1000);
  start.setMinutes(0, 0, 0);
  const end = new Date(start.getTime() + 60 * 60 * 1000);

  return {
    ...emptyTeamCalendarForm,
    date: toLocalDateInputValue(start),
    startTime: toLocalTimeInputValue(start),
    endTime: toLocalTimeInputValue(end),
  };
};

const buildEventDateTime = (dateValue, timeValue) => {
  if (!dateValue || !timeValue) return '';
  return new Date(`${dateValue}T${timeValue}`).toISOString();
};

const formatCalendarEventDate = (value) => {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return '';

  return date.toLocaleDateString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

const formatCalendarEventTime = (value) => {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return '';

  return date.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });
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

const normalizeCustomerConversation = ({ contact = null, chat = null, includeTextingGroupContext = true }) => {
  const phones = contact?.phones || [];
  const normalizedPhones = phones.map((phone) => ({
    ...phone,
    number: normalize(phone.number),
  }));
  const primaryPhone = normalize(chat?.phone || phones[0]?.number || '');
  const textingGroupId = includeTextingGroupContext
    ? (chat?.textingGroupId || contact?.textingGroupId || '')
    : '';
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

const sortConversationsByUnreadAndTime = (conversations = []) => {
  return [...conversations].sort((a, b) => {
    if ((b.unreadCount || 0) !== (a.unreadCount || 0)) {
      return (b.unreadCount || 0) - (a.unreadCount || 0);
    }

    return new Date(b.lastMessageAt || 0) - new Date(a.lastMessageAt || 0);
  });
};

const buildDirectSmsConversationList = ({ contacts, chats }) => {
  const normalizedCustomers = [];
  const matchedPhones = new Set();

  contacts.forEach((contact) => {
    const contactPhones = (contact.phones || []).map((phone) => normalize(phone.number));
    const chat = (chats || []).find((item) => contactPhones.includes(normalize(item.phone)));
    const normalizedConversation = normalizeCustomerConversation({
      contact,
      chat,
      includeTextingGroupContext: false,
    });

    normalizedCustomers.push(normalizedConversation);
    contactPhones.forEach((phone) => matchedPhones.add(phone));
    if (chat?.phone) {
      matchedPhones.add(normalize(chat.phone));
    }
  });

  (chats || []).forEach((chat) => {
    const phone = normalize(chat?.phone);
    if (!phone || matchedPhones.has(phone)) return;

    normalizedCustomers.push(
      normalizeCustomerConversation({
        chat,
        contact: {
          name: chat?.name || phone,
          phones: [{ number: phone, label: 'mobile' }],
          isUnassigned: true,
        },
        includeTextingGroupContext: false,
      })
    );
  });

  return sortConversationsByUnreadAndTime(
    normalizedCustomers.map((conversation) => ({
      ...conversation,
      previewFallback: conversation?.rawConversation ? (conversation.previewFallback || 'No messages yet') : 'No messages yet',
      unread: conversation?.rawConversation ? conversation.unread : 0,
      unreadCount: conversation?.rawConversation ? conversation.unreadCount : 0,
      lastMessage: conversation?.rawConversation ? conversation.lastMessage : '',
      lastMessageAt: conversation?.rawConversation ? conversation.lastMessageAt : 0,
      updatedAt: conversation?.rawConversation ? conversation.updatedAt : 0,
      rawConversation: conversation?.rawConversation || null,
      ...(conversation?.rawConversation ? {} : {
        isUnassigned: true,
      }),
    }))
  );
};

const getDirectoryAgentMeta = (agentId, userDirectory = {}) => {
  const matchedUser = agentId ? userDirectory[agentId] : null;
  const fallbackMeta = getAgentMeta(agentId);

  if (!matchedUser) {
    return {
      name: fallbackMeta?.name || agentId,
      role: fallbackMeta?.role || '',
      availabilityStatus: 'online',
      connected: undefined,
      presenceStatus: 'offline',
      effectiveAvailabilityStatus: 'offline',
    };
  }

  const department = getDepartmentLabel(matchedUser.department) || fallbackMeta?.department || fallbackMeta?.role || '';
  const roleLabel = department || (matchedUser.role === 'admin' ? 'Admin' : matchedUser.role || 'Agent');

  return {
    name: matchedUser.name || fallbackMeta?.name || agentId,
    role: roleLabel,
    availabilityStatus: matchedUser.availabilityStatus || 'online',
    connected: typeof matchedUser.connected === 'boolean' ? matchedUser.connected : undefined,
    presenceStatus: matchedUser.presenceStatus || 'offline',
    effectiveAvailabilityStatus: matchedUser.effectiveAvailabilityStatus || resolveEffectiveAvailabilityStatus(matchedUser),
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
  const unreadMentionCount = normalizeUnreadCount(conversation?.unreadMentionCount);
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
    unreadMentionCount,
    hasUnreadMention: conversationType === 'team' && unreadMentionCount > 0,
    latestUnreadMentionMessageId: conversation?.latestUnreadMentionMessageId || '',
    teamId: conversation?.teamId || null,
    teamName: conversation?.teamName || null,
    participants,
    agentId: conversationType === 'internal_dm'
      ? (otherParticipant || conversation?.agentId || null)
      : (conversation?.agentId || null),
    availabilityStatus: otherAgent?.availabilityStatus || 'online',
    connected: typeof otherAgent?.connected === 'boolean' ? otherAgent.connected : undefined,
    presenceStatus: otherAgent?.presenceStatus || 'offline',
    effectiveAvailabilityStatus: otherAgent?.effectiveAvailabilityStatus || resolveEffectiveAvailabilityStatus(otherAgent || {}),
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

  return sortConversationsByUnreadAndTime([...normalizedCustomers, ...normalizedInternal]);
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
  const isActiveTeamConversation = String(activeChatId || '').startsWith('team:');
  const activeTeamConversationId = isActiveTeamConversation
    ? String(activeChatId || '').replace(/^team:/, '')
    : '';
  const [activeCustomerContactId, setActiveCustomerContactId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [teamThreadLoading, setTeamThreadLoading] = useState(false);
  const [pendingMentionJump, setPendingMentionJump] = useState(null);
  const [mentionNotifications, setMentionNotifications] = useState([]);
  const [teammates, setTeammates] = useState([]);
  const [presenceSnapshotsByAgentId, setPresenceSnapshotsByAgentId] = useState({});
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
  const [showTeamCalendar, setShowTeamCalendar] = useState(false);
  const [teamCalendarLoading, setTeamCalendarLoading] = useState(false);
  const [teamCalendarSaving, setTeamCalendarSaving] = useState(false);
  const [teamCalendarError, setTeamCalendarError] = useState('');
  const [teamCalendarSuccess, setTeamCalendarSuccess] = useState('');
  const [teamCalendarData, setTeamCalendarData] = useState(null);
  const [teamCalendarEvents, setTeamCalendarEvents] = useState([]);
  const [teamCalendarForm, setTeamCalendarForm] = useState(() => buildDefaultTeamCalendarForm());
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
  const [showSmsContactModal, setShowSmsContactModal] = useState(false);
  const [smsContactForm, setSmsContactForm] = useState(emptySmsContactForm);
  const [savingSmsContact, setSavingSmsContact] = useState(false);
  const [smsContactModalSuccess, setSmsContactModalSuccess] = useState('');
  const [smsContactModalError, setSmsContactModalError] = useState('');
  const teamMessagesCacheRef = useRef({});
  const activeTeamRequestRef = useRef('');
  const activeCustomerRequestRef = useRef('');
  const messagesRef = useRef([]);
  const smsContactSuccessTimeoutRef = useRef(null);
  const mentionNotificationTimeoutsRef = useRef({});
  const pendingDirectorySmsPhoneRef = useRef(
    normalize(location.state?.phone || '')
  );

  useEffect(() => {
    messagesRef.current = Array.isArray(messages) ? messages : [];
  }, [messages]);

  useEffect(() => () => {
    if (smsContactSuccessTimeoutRef.current) {
      window.clearTimeout(smsContactSuccessTimeoutRef.current);
    }
  }, []);

  const closeSmsContactModal = useCallback(() => {
    if (smsContactSuccessTimeoutRef.current) {
      window.clearTimeout(smsContactSuccessTimeoutRef.current);
      smsContactSuccessTimeoutRef.current = null;
    }

    setShowSmsContactModal(false);
    setSmsContactForm(emptySmsContactForm);
    setSmsContactModalSuccess('');
    setSmsContactModalError('');
  }, []);

  const closeTeamCalendarModal = useCallback(() => {
    setShowTeamCalendar(false);
    setTeamCalendarLoading(false);
    setTeamCalendarSaving(false);
    setTeamCalendarError('');
    setTeamCalendarSuccess('');
    setTeamCalendarData(null);
    setTeamCalendarEvents([]);
    setTeamCalendarForm(buildDefaultTeamCalendarForm());
  }, []);

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
    setShowTeamCalendar(false);
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
    if (isActiveTeamConversation) return;
    if (showTeamCalendar) {
      closeTeamCalendarModal();
    }
  }, [closeTeamCalendarModal, isActiveTeamConversation, showTeamCalendar]);

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
      setChats(Array.isArray(data) ? data : []);
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
        setPresenceSnapshotsByAgentId({});
        return;
      }

      const payload = await fetchTeammatesRequest(token);
      const nextTeammates = Array.isArray(payload?.teammates) ? payload.teammates : [];
      setTeammates(nextTeammates);
      setPresenceSnapshotsByAgentId(
        nextTeammates.reduce((acc, user) => {
          if (!user?.agentId) return acc;

          acc[user.agentId] = {
            availabilityStatus: user.availabilityStatus || 'online',
            connected: typeof user.connected === 'boolean' ? user.connected : undefined,
            presenceStatus: user.presenceStatus || 'offline',
            effectiveAvailabilityStatus: user.effectiveAvailabilityStatus || resolveEffectiveAvailabilityStatus(user),
          };
          return acc;
        }, {})
      );
    } catch (err) {
      console.error('Fetch teammates error:', err);
      setTeammates([]);
      setPresenceSnapshotsByAgentId({});
    }
  }, []);

  const applyPresenceSnapshotToConversation = useCallback((conversation, agentId, snapshot) => {
    if (!conversation || !agentId) return conversation;

    const participants = Array.isArray(conversation.participants) ? conversation.participants : [];
    const matchesDirectConversation = (
      (conversation.conversationType === 'internal_dm' || conversation.type === 'internal_dm')
      && participants.includes(agentId)
    );

    if (!matchesDirectConversation) {
      return conversation;
    }

    return {
      ...conversation,
      availabilityStatus: snapshot.availabilityStatus,
      connected: snapshot.connected,
      presenceStatus: snapshot.presenceStatus,
      effectiveAvailabilityStatus: snapshot.effectiveAvailabilityStatus,
    };
  }, []);

  const fetchCustomerMessages = useCallback(async (phone, options = {}) => {
    const { requestKey = '' } = options;

    if (!phone) {
      if (!requestKey || activeCustomerRequestRef.current === requestKey) {
        setMessages([]);
      }
      return [];
    }

    try {
      const res = await fetch(`${BASE_URL}/api/sms/messages/${phone}`);
      if (!res.ok) throw new Error();

      const data = await res.json();
      const nextMessages = mergeCustomerMessages(messagesRef.current, data || [], phone);

      if (!requestKey || activeCustomerRequestRef.current === requestKey) {
        setMessages(nextMessages);
      }

      return nextMessages;
    } catch (err) {
      console.error('Fetch customer messages error:', err);
      if (!requestKey || activeCustomerRequestRef.current === requestKey) {
        setMessages([]);
      }
      return [];
    }
  }, []);

  const fetchTextingGroupMessages = useCallback(async (groupId, phone, options = {}) => {
    const { requestKey = '' } = options;

    if (!groupId || !phone) {
      if (!requestKey || activeCustomerRequestRef.current === requestKey) {
        setMessages([]);
      }
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
      if (!requestKey || activeCustomerRequestRef.current === requestKey) {
        setMessages(data || []);
      }
      return data || [];
    } catch (err) {
      console.error('Fetch texting group messages error:', err);
      if (!requestKey || activeCustomerRequestRef.current === requestKey) {
        setMessages([]);
      }
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
          ? {
              ...item,
              unread: 0,
              unreadMentionCount: 0,
              latestUnreadMentionMessageId: '',
            }
          : item
      )
    );
  }, []);

  const upsertDirectConversationPreview = useCallback((message, options = {}) => {
    const {
      markAsRead = false,
    } = options;
    const phone = normalize(
      message?.conversationId || message?.to || message?.from || ''
    );

    if (!phone) return;

    setChats((prev) => {
      const nextPreview = {
        phone,
        name: message?.name || phone,
        lastMessage: message?.body || '',
        unread: message?.direction === 'inbound' && !markAsRead ? 1 : 0,
        updatedAt: message?.createdAt || new Date().toISOString(),
      };

      const existingIndex = prev.findIndex((item) => normalize(item.phone) === phone);
      if (existingIndex === -1) {
        return [...prev, nextPreview];
      }

      const next = [...prev];
      next[existingIndex] = {
        ...next[existingIndex],
        ...nextPreview,
        unread: markAsRead
          ? 0
          : message?.direction === 'inbound'
            ? Math.max(Number(next[existingIndex]?.unread || 0) + 1, 1)
            : Number(next[existingIndex]?.unread || 0),
      };
      return next;
    });
  }, []);

  const handleOpenSmsContactModal = useCallback((payload = {}) => {
    const fallbackName = String(payload.name || payload.displayName || '').trim();

    if (smsContactSuccessTimeoutRef.current) {
      window.clearTimeout(smsContactSuccessTimeoutRef.current);
      smsContactSuccessTimeoutRef.current = null;
    }

    setSmsContactForm({
      name: fallbackName && normalize(fallbackName) !== normalize(payload.phone || '')
        ? fallbackName
        : '',
      phone: String(payload.phone || '').trim(),
      business: String(payload.business || payload.dba || '').trim(),
      merchantId: String(payload.merchantId || payload.mid || '').trim(),
      notes: String(payload.notes || '').trim(),
    });
    setSmsContactModalSuccess('');
    setSmsContactModalError('');
    setShowSmsContactModal(true);
  }, []);

  function applySavedContactToSmsState(contact) {
    if (!contact?._id) return;

    const contactPhone = normalize(getPrimaryContactPhone(contact));
    const contactName = getContactDisplayName(contact, contactPhone);

    setContacts((prev) => {
      const existingIndex = prev.findIndex((item) => item?._id === contact._id);
      if (existingIndex === -1) {
        return [contact, ...prev];
      }

      const next = [...prev];
      next[existingIndex] = {
        ...next[existingIndex],
        ...contact,
      };
      return next;
    });

    if (contactPhone) {
      setChats((prev) => prev.map((item) => (
        normalize(item.phone) === contactPhone
          ? {
              ...item,
              _id: contact._id,
              name: contactName,
              assignedTo: contact.assignedTo ?? item.assignedTo ?? null,
              isUnassigned: typeof contact.isUnassigned === 'boolean' ? contact.isUnassigned : item.isUnassigned,
              assignmentStatus: contact.assignmentStatus || item.assignmentStatus || 'open',
            }
          : item
      )));

      setTextingGroupThreads((prev) => prev.map((item) => (
        normalize(item.phone) === contactPhone
          ? {
              ...item,
              _id: contact._id,
              name: contactName,
              dba: contact.dba || item.dba || '',
              mid: contact.mid || item.mid || '',
              assignedTo: contact.assignedTo ?? item.assignedTo ?? null,
              isUnassigned: typeof contact.isUnassigned === 'boolean' ? contact.isUnassigned : item.isUnassigned,
              assignmentStatus: contact.assignmentStatus || item.assignmentStatus || 'open',
            }
          : item
      )));

      if (activeConversationType === 'customer' && normalize(activeCustomerPhone) === contactPhone) {
        setActiveCustomerContactId(contact._id);
      }
    }
  }

  const handleSaveSmsContact = async () => {
    if (savingSmsContact) return;

    try {
      setSavingSmsContact(true);
      setSmsContactModalError('');
      setSmsContactModalSuccess('');

      const res = await fetch(`${BASE_URL}/api/contacts/upsert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: smsContactForm.name,
          phone: smsContactForm.phone,
          business: smsContactForm.business,
          merchantId: smsContactForm.merchantId,
          notes: smsContactForm.notes,
        }),
      });

      const payload = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(payload?.error || 'Failed to save contact');
      }

      const savedContact = payload?.contact || null;
      if (!savedContact) {
        throw new Error('Contact save did not return a contact');
      }

      applySavedContactToSmsState(savedContact);
      setSmsContactModalSuccess(
        payload?.created ? 'Contact saved successfully' : 'Contact updated successfully'
      );

      fetchContacts();

      if (smsMode === 'texting-group' && selectedTextingGroupId) {
        fetchTextingGroupThreads(selectedTextingGroupId);
      }

      if (smsContactSuccessTimeoutRef.current) {
        window.clearTimeout(smsContactSuccessTimeoutRef.current);
      }

      smsContactSuccessTimeoutRef.current = window.setTimeout(() => {
        closeSmsContactModal();
      }, 1400);
    } catch (error) {
      console.error('Save SMS contact error:', error);
      setSmsContactModalError(error.message || 'Failed to save contact');
    } finally {
      setSavingSmsContact(false);
    }
  };

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

  useEffect(() => {
    const handlePresenceStatus = (payload) => {
      const userId = String(payload?.userId || '').trim();
      const presenceStatus = String(payload?.status || '').trim().toLowerCase();
      if (!userId || !presenceStatus) return;

      const nextSnapshot = {
        connected: presenceStatus !== 'offline',
        presenceStatus,
      };

      setPresenceSnapshotsByAgentId((prev) => {
        const current = prev[userId] || {};
        const connected = nextSnapshot.connected;
        return {
          ...prev,
          [userId]: {
            ...current,
            connected,
            presenceStatus,
            effectiveAvailabilityStatus: connected
              ? resolveEffectiveAvailabilityStatus({ ...current, connected, presenceStatus })
              : 'offline',
          },
        };
      });

      setTeammates((prev) => prev.map((user) => {
        if (user?.agentId !== userId) return user;

        const connected = nextSnapshot.connected;
        return {
          ...user,
          connected,
          presenceStatus,
          effectiveAvailabilityStatus: connected
            ? resolveEffectiveAvailabilityStatus({ ...user, connected, presenceStatus })
            : 'offline',
        };
      }));

      setInternalChats((prev) => prev.map((conversation) => {
        const updatedConversation = applyPresenceSnapshotToConversation(conversation, userId, {
          availabilityStatus: conversation?.availabilityStatus || 'online',
          connected: nextSnapshot.connected,
          presenceStatus,
          effectiveAvailabilityStatus: nextSnapshot.connected
            ? resolveEffectiveAvailabilityStatus({
              ...conversation,
              connected: nextSnapshot.connected,
              presenceStatus,
            })
            : 'offline',
        });

        return updatedConversation;
      }));

      setTeamDetailsData((prev) => {
        if (!prev?.members?.length) return prev;

        const nextMembers = prev.members.map((member) => {
          if (member?.agentId !== userId) return member;

          const connected = nextSnapshot.connected;
          return {
            ...member,
            connected,
            presenceStatus,
            effectiveAvailabilityStatus: connected
              ? resolveEffectiveAvailabilityStatus({ ...member, connected, presenceStatus })
              : 'offline',
          };
        });

        return { ...prev, members: nextMembers };
      });
    };

    const handleAvailabilityStatus = (payload) => {
      const userId = String(payload?.userId || '').trim();
      const availabilityStatus = String(payload?.availabilityStatus || '').trim().toLowerCase();
      if (!userId || !availabilityStatus) return;

      setPresenceSnapshotsByAgentId((prev) => {
        const current = prev[userId] || {};
        return {
          ...prev,
          [userId]: {
            ...current,
            availabilityStatus,
            effectiveAvailabilityStatus: resolveEffectiveAvailabilityStatus({
              ...current,
              availabilityStatus,
            }),
          },
        };
      });

      setTeammates((prev) => prev.map((user) => {
        if (user?.agentId !== userId) return user;

        return {
          ...user,
          availabilityStatus,
          effectiveAvailabilityStatus: resolveEffectiveAvailabilityStatus({
            ...user,
            availabilityStatus,
          }),
        };
      }));

      setInternalChats((prev) => prev.map((conversation) => (
        applyPresenceSnapshotToConversation(conversation, userId, {
          availabilityStatus,
          connected: typeof conversation?.connected === 'boolean' ? conversation.connected : true,
          presenceStatus: conversation?.presenceStatus || 'online',
          effectiveAvailabilityStatus: resolveEffectiveAvailabilityStatus({
            ...conversation,
            availabilityStatus,
          }),
        })
      )));

      setTeamDetailsData((prev) => {
        if (!prev?.members?.length) return prev;

        const nextMembers = prev.members.map((member) => {
          if (member?.agentId !== userId) return member;

          return {
            ...member,
            availabilityStatus,
            effectiveAvailabilityStatus: resolveEffectiveAvailabilityStatus({
              ...member,
              availabilityStatus,
            }),
          };
        });

        return { ...prev, members: nextMembers };
      });
    };

    socket.on('agentStatus', handlePresenceStatus);
    socket.on('agentAvailabilityStatus', handleAvailabilityStatus);

    return () => {
      socket.off('agentStatus', handlePresenceStatus);
      socket.off('agentAvailabilityStatus', handleAvailabilityStatus);
    };
  }, [applyPresenceSnapshotToConversation]);

  useEffect(() => {
    if (!isSmsPage) return;
    if (smsMode !== 'texting-group' && !showSmsModeChooser && location.state?.smsMode !== 'texting-group') return;

    fetchTextingGroups();
  }, [fetchTextingGroups, isSmsPage, location.state, showSmsModeChooser, smsMode]);

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

  const workspaceUserDirectory = useMemo(() => {
    const directory = teammates.reduce((acc, user) => {
      if (user?.agentId) {
        acc[user.agentId] = {
          ...user,
          ...(presenceSnapshotsByAgentId[user.agentId] || {}),
        };
      }
      return acc;
    }, {});

    Object.entries(presenceSnapshotsByAgentId).forEach(([agentId, snapshot]) => {
      if (!agentId) return;
      directory[agentId] = {
        ...(directory[agentId] || {}),
        agentId,
        ...(snapshot || {}),
      };
    });

    return directory;
  }, [presenceSnapshotsByAgentId, teammates]);

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
          availabilityStatus: user.availabilityStatus || 'online',
          connected: typeof user.connected === 'boolean' ? user.connected : undefined,
          presenceStatus: user.presenceStatus || 'offline',
          effectiveAvailabilityStatus: user.effectiveAvailabilityStatus || resolveEffectiveAvailabilityStatus(user),
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name)),
    [currentAuthUserDbId, currentUserId, teammates]
  );

  const internalForwardTargets = useMemo(
    () => internalChats
      .map((conversation) => normalizeInternalConversation(conversation, currentUserId, workspaceUserDirectory))
      .filter((conversation) => Boolean(conversation?.conversationId))
      .sort((left, right) => String(left?.name || '').localeCompare(String(right?.name || ''))),
    [currentUserId, internalChats, workspaceUserDirectory]
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
      const hasActivityTimestamp = Boolean(conversation?.lastMessageAt || conversation?.updatedAt);

      if (index === -1) {
        return hasActivityTimestamp ? [conversation, ...next] : [...next, conversation];
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
        updatedAt: payload.updatedAt || null,
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
        updatedAt: conversation.lastMessageAt || conversation.updatedAt || null,
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

  const conversationList = isSmsPage && smsMode === 'direct'
    ? buildDirectSmsConversationList({
        contacts,
        chats,
      })
    : buildConversationList({
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

  const fetchTeamCalendarEvents = useCallback(async (conversationId) => {
    if (!conversationId) return null;

    setTeamCalendarLoading(true);
    setTeamCalendarError('');
    setTeamCalendarSuccess('');

    try {
      const params = new URLSearchParams({
        userId: currentUserId,
        role: currentRole,
      });
      const res = await fetch(
        `${BASE_URL}/api/messages/team/${encodeURIComponent(conversationId)}/calendar?${params.toString()}`
      );
      const payload = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(payload?.error || 'Failed to load group calendar');
      }

      setTeamCalendarData({
        conversationId: payload.conversationId || conversationId,
        teamId: payload.teamId || conversationId,
        teamName: payload.teamName || 'Group calendar',
      });
      setTeamCalendarEvents(Array.isArray(payload?.events) ? payload.events : []);
      return payload;
    } catch (error) {
      console.error('Fetch team calendar error:', error);
      setTeamCalendarError(error.message || 'Failed to load group calendar');
      return null;
    } finally {
      setTeamCalendarLoading(false);
    }
  }, [currentRole, currentUserId]);

  const handleOpenTeamCalendar = useCallback(async () => {
    if (!isInternalTeamsPage || !activeTeamConversationId) return;

    setShowTeamCalendar(true);
    setTeamCalendarForm(buildDefaultTeamCalendarForm());
    await fetchTeamCalendarEvents(activeTeamConversationId);
  }, [activeTeamConversationId, fetchTeamCalendarEvents, isInternalTeamsPage]);

  const handleCreateTeamCalendarEvent = useCallback(async () => {
    const conversationId = activeTeamConversationId || teamCalendarData?.conversationId;

    if (!conversationId || teamCalendarSaving) return;

    try {
      setTeamCalendarSaving(true);
      setTeamCalendarError('');
      setTeamCalendarSuccess('');

      const title = String(teamCalendarForm.title || '').trim();
      const description = String(teamCalendarForm.description || '').trim();
      const startAt = buildEventDateTime(teamCalendarForm.date, teamCalendarForm.startTime);
      const endAt = buildEventDateTime(teamCalendarForm.date, teamCalendarForm.endTime);

      if (!title || !teamCalendarForm.date || !teamCalendarForm.startTime || !teamCalendarForm.endTime) {
        throw new Error('Fill in the event title, date, start time, and end time');
      }

      const res = await fetch(`${BASE_URL}/api/messages/team/${encodeURIComponent(conversationId)}/calendar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: currentUserId,
          role: currentRole,
          title,
          description,
          startAt,
          endAt,
        }),
      });
      const payload = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(payload?.error || 'Failed to create calendar event');
      }

      setTeamCalendarEvents((prev) => (
        [...prev, payload].sort((left, right) => new Date(left.startAt) - new Date(right.startAt))
      ));
      setTeamCalendarForm(buildDefaultTeamCalendarForm());
      setTeamCalendarSuccess('Event added to the group calendar');
    } catch (error) {
      console.error('Create team calendar event error:', error);
      setTeamCalendarError(error.message || 'Failed to create calendar event');
    } finally {
      setTeamCalendarSaving(false);
    }
  }, [activeTeamConversationId, currentRole, currentUserId, teamCalendarData?.conversationId, teamCalendarForm, teamCalendarSaving]);

  const handleDeleteTeamCalendarEvent = useCallback(async (eventId) => {
    const conversationId = activeTeamConversationId || teamCalendarData?.conversationId;
    if (!conversationId || !eventId || teamCalendarSaving) return;
    if (!window.confirm('Delete this event from the group calendar?')) return;

    try {
      setTeamCalendarSaving(true);
      setTeamCalendarError('');
      setTeamCalendarSuccess('');

      const res = await fetch(`${BASE_URL}/api/messages/team/${encodeURIComponent(conversationId)}/calendar/${encodeURIComponent(eventId)}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: currentUserId,
          role: currentRole,
        }),
      });
      const payload = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(payload?.error || 'Failed to delete calendar event');
      }

      setTeamCalendarEvents((prev) => prev.filter((event) => event._id !== eventId));
      setTeamCalendarSuccess('Event removed from the group calendar');
    } catch (error) {
      console.error('Delete team calendar event error:', error);
      setTeamCalendarError(error.message || 'Failed to delete calendar event');
    } finally {
      setTeamCalendarSaving(false);
    }
  }, [activeTeamConversationId, currentRole, currentUserId, teamCalendarData?.conversationId, teamCalendarSaving]);

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
  const matchedTextingGroupThread = smsMode === 'texting-group'
    ? textingGroupThreads.find((item) => item.key === activeChatId) || null
    : null;
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
            const resolvedTextingGroupId = smsMode === 'texting-group'
              ? (textingGroupId || persistedContact?.textingGroupId || '')
              : '';

            return normalizeCustomerConversation({
              contact: persistedContact,
              chat: {
                ...(matchingChat || {}),
                phone: activePhone,
                textingGroupId: resolvedTextingGroupId,
              },
              includeTextingGroupContext: smsMode === 'texting-group',
            });
          }

          const resolvedTextingGroupId = smsMode === 'texting-group' ? textingGroupId : '';

          return {
            id: activeChatId,
            conversationType: 'customer',
            conversationId: resolvedTextingGroupId ? `${resolvedTextingGroupId}|${activePhone}` : activePhone,
            key: activeChatId,
            title: activePhone,
            name: activePhone,
            phone: activePhone,
            textingGroupId: resolvedTextingGroupId || null,
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
  const activeSmsSavedContact = useMemo(() => {
    if (!isSmsPage || activeConversationType !== 'customer') return null;

    const activePhone = normalize(activeChat?.phone || activeCustomerPhone || '');
    if (!activePhone) return null;

    const contactFromId = activeCustomerContactId
      ? contacts.find((contact) => contact?._id === activeCustomerContactId) || null
      : null;

    if (contactFromId) {
      const idContactMatchesPhone = (Array.isArray(contactFromId.phones) ? contactFromId.phones : [])
        .some((phone) => normalize(phone?.number) === activePhone);

      if (idContactMatchesPhone) {
        return contactFromId;
      }
    }

    return contacts.find((contact) => {
      const phones = Array.isArray(contact?.phones) ? contact.phones : [];
      return phones.some((phone) => normalize(phone?.number) === activePhone);
    }) || null;
  }, [activeChat, activeConversationType, activeCustomerContactId, activeCustomerPhone, contacts, isSmsPage]);
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
        const { textingGroupId: parsedTextingGroupId, phone: parsedPhone } = parseTextingGroupConversationId(
          activeConversationId || activeCustomerPhone
        );
        const textingGroupId = smsMode === 'texting-group' ? parsedTextingGroupId : '';
        const phone = normalize(parsedPhone || activeCustomerPhone || activeConversationId);
        const requestKey = buildConversationKey('customer', activeConversationId || activeCustomerPhone || phone);
        activeCustomerRequestRef.current = requestKey;

        if (textingGroupId) {
          await fetchTextingGroupMessages(textingGroupId, phone, { requestKey });
          fetch(`${BASE_URL}/api/sms/texting-groups/${encodeURIComponent(textingGroupId)}/read/${encodeURIComponent(phone)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: currentUserId }),
          }).catch((error) => {
            console.error('Mark texting group thread read error:', error);
          });
          fetchTextingGroupThreads(textingGroupId);
          fetchTextingGroups();
        } else {
          await fetchCustomerMessages(phone, { requestKey });
          fetch(`${BASE_URL}/api/sms/read/${phone}`, {
            method: 'PUT',
          }).catch((error) => {
            console.error('Mark direct SMS thread read error:', error);
          });
          fetchConversations();
        }
      } else {
        activeCustomerRequestRef.current = '';
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
    smsMode,
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

  useEffect(() => () => {
    Object.values(mentionNotificationTimeoutsRef.current).forEach((timeoutId) => {
      window.clearTimeout(timeoutId);
    });
  }, []);

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
        if (smsMode !== 'texting-group') {
          return;
        }

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

      const customerConversationId = normalize(msg.conversationId || msg.from || msg.to);
      const customerConversationKey = buildConversationKey('customer', customerConversationId);
      const activePhone = activeCustomerPhone;
      const isActiveCustomerConversation = activeConversationType === 'customer'
        && customerConversationKey === activeChatId;

      upsertDirectConversationPreview(msg, {
        markAsRead: isActiveCustomerConversation || msg.direction === 'outbound',
      });

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
    smsMode,
    upsertDirectConversationPreview,
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
    const handleTeamMentionNotification = (payload) => {
      const conversationId = String(payload?.conversationId || payload?.teamId || '').trim();
      const messageId = String(payload?.messageId || '').trim();

      if (!conversationId || !messageId) {
        return;
      }

      const notificationId = `${conversationId}:${messageId}:${Date.now()}`;
      const nextNotification = {
        id: notificationId,
        conversationId,
        messageId,
        senderName: payload?.senderName || 'Teammate',
        previewText: payload?.previewText || '',
      };

      setMentionNotifications((prev) => [nextNotification, ...prev].slice(0, 3));

      mentionNotificationTimeoutsRef.current[notificationId] = window.setTimeout(() => {
        setMentionNotifications((prev) => prev.filter((item) => item.id !== notificationId));
        delete mentionNotificationTimeoutsRef.current[notificationId];
      }, 8000);
    };

    socket.on('teamMentionNotification', handleTeamMentionNotification);
    return () => socket.off('teamMentionNotification', handleTeamMentionNotification);
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

  useEffect(() => {
    const applyMutation = (payload) => {
      if (!payload?._id || !payload?.conversationId || !payload?.conversationType) {
        return;
      }

      const conversationKey = buildConversationKey(payload.conversationType, payload.conversationId);
      const normalizedPayload = {
        ...payload,
        direction: payload.senderId === currentUserId ? 'outbound' : 'inbound',
      };

      if (conversationKey === activeChatId) {
        setMessages((prev) => prev.map((item) => (
          item._id === payload._id ? { ...item, ...normalizedPayload } : item
        )));
      }

      if (payload.conversationType === 'team') {
        const cachedThread = teamMessagesCacheRef.current[conversationKey];
        if (Array.isArray(cachedThread)) {
          teamMessagesCacheRef.current[conversationKey] = cachedThread.map((item) => (
            item._id === payload._id ? { ...item, ...normalizedPayload } : item
          ));
        }
      }

      fetchInternalConversations();
    };

    socket.on('internalMessageUpdated', applyMutation);
    socket.on('internalMessageDeleted', applyMutation);

    return () => {
      socket.off('internalMessageUpdated', applyMutation);
      socket.off('internalMessageDeleted', applyMutation);
    };
  }, [activeChatId, currentUserId, fetchInternalConversations]);

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

  const handleSelectChat = useCallback((conversation) => {
    if (!conversation) return;

    const normalizedConversation = (
      smsMode === 'direct' && (conversation.conversationType || 'customer') === 'customer'
    )
      ? {
          ...conversation,
          textingGroupId: null,
          textingGroupName: null,
          conversationId: normalize(conversation.phone || conversation.conversationId),
        }
      : conversation;

    const nextKey = buildConversationKey(
      normalizedConversation.conversationType || 'customer',
      normalizedConversation.conversationId || normalizedConversation.phone
    );
    const nextMentionMessageId = (
      (normalizedConversation.conversationType || '') === 'team'
      && Number(normalizedConversation.unreadMentionCount || 0) > 0
    )
      ? String(normalizedConversation.latestUnreadMentionMessageId || '').trim()
      : '';

    if ((normalizedConversation.conversationType || 'customer') === 'customer') {
      setActiveSection('customers');
    } else if ((normalizedConversation.conversationType || '') === 'internal_dm') {
      setActiveSection('internal');
    } else if ((normalizedConversation.conversationType || '') === 'team') {
      setActiveSection('teams');
    }

    setActiveChatId(nextKey);
    setActiveCustomerContactId(
      (normalizedConversation.conversationType || 'customer') === 'customer'
        ? (normalizedConversation._id || null)
        : null
    );

    if ((normalizedConversation.conversationType || '') === 'customer') {
      activeCustomerRequestRef.current = nextKey;
      setMessages([]);
      setTeamThreadLoading(false);
      setPendingMentionJump(null);
    } else if ((normalizedConversation.conversationType || '') === 'team') {
      const cachedMessages = teamMessagesCacheRef.current[nextKey];
      activeTeamRequestRef.current = nextKey;
      setMessages(Array.isArray(cachedMessages) ? cachedMessages : []);
      setTeamThreadLoading(!Array.isArray(cachedMessages));
      setPendingMentionJump(
        nextMentionMessageId
          ? { conversationKey: nextKey, messageId: nextMentionMessageId }
          : null
      );
    } else {
      activeCustomerRequestRef.current = '';
      setMessages([]);
      setTeamThreadLoading(false);
      setPendingMentionJump(null);
    }

    markChatRead(normalizedConversation);

    if (isInternalChatPage && searchQuery.trim() && (normalizedConversation.conversationType || '') === 'internal_dm') {
      rememberInternalSearch({
        agentId: normalizedConversation.agentId,
        name: normalizedConversation.name || normalizedConversation.title || normalizedConversation.agentId,
        role: normalizedConversation.subtitle || normalizedConversation.role || 'Teammate',
      });
    }
  }, [isInternalChatPage, markChatRead, rememberInternalSearch, searchQuery, smsMode]);

  const handleOpenMentionTarget = useCallback((conversationId, messageId = '') => {
    const normalizedConversationId = String(conversationId || '').trim();
    if (!normalizedConversationId) return;

    const targetConversation = conversationList.find(
      (item) => item.conversationType === 'team' && item.conversationId === normalizedConversationId
    );

    if (!targetConversation) return;

    const conversationKey = buildConversationKey('team', normalizedConversationId);
    const normalizedMessageId = String(messageId || targetConversation.latestUnreadMentionMessageId || '').trim();
    handleSelectChat(targetConversation);
    setPendingMentionJump(
      normalizedMessageId
        ? { conversationKey, messageId: normalizedMessageId }
        : null
    );
  }, [conversationList, handleSelectChat]);

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
      availabilityStatus: existingMember?.availabilityStatus || teammate?.availabilityStatus || 'online',
      connected: typeof existingMember?.connected === 'boolean'
        ? existingMember.connected
        : teammate?.connected,
      presenceStatus: existingMember?.presenceStatus || teammate?.presenceStatus || 'offline',
      effectiveAvailabilityStatus: existingMember?.effectiveAvailabilityStatus
        || teammate?.effectiveAvailabilityStatus
        || resolveEffectiveAvailabilityStatus(existingMember || teammate || {}),
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
  const activeTeamMentionMembers = useMemo(() => {
    if (activeChat?.conversationType !== 'team') return [];

    const participantIds = Array.isArray(activeChat?.participants) ? activeChat.participants : [];
    const participantSet = new Set(participantIds.filter(Boolean));
    const detailMembers = Array.isArray(teamDetailsData?.members) ? teamDetailsData.members : [];

    const merged = teammateOptions
      .filter((agent) => participantSet.has(agent.agentId))
      .map((agent) => ({
        agentId: agent.agentId,
        name: agent.name || agent.agentId,
        role: agent.role || 'Teammate',
      }));

    detailMembers.forEach((member) => {
      if (!member?.agentId || member.agentId === currentUserId) return;
      if (merged.some((entry) => entry.agentId === member.agentId)) return;
      merged.push({
        agentId: member.agentId,
        name: member.name || member.agentId,
        role: member.role || 'Teammate',
      });
    });

    return merged
      .filter((member) => member.agentId !== currentUserId)
      .sort((left, right) => left.name.localeCompare(right.name));
  }, [activeChat?.conversationType, activeChat?.participants, currentUserId, teamDetailsData?.members, teammateOptions]);
  const sortedTeamCalendarEvents = useMemo(() => (
    [...teamCalendarEvents].sort((left, right) => new Date(left.startAt) - new Date(right.startAt))
  ), [teamCalendarEvents]);

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

      {mentionNotifications.length > 0 ? (
        <div className="mention-toast-stack" role="status" aria-live="polite">
          {mentionNotifications.map((notification) => (
            <button
              key={notification.id}
              type="button"
              className="mention-toast"
              onClick={() => {
                window.clearTimeout(mentionNotificationTimeoutsRef.current[notification.id]);
                delete mentionNotificationTimeoutsRef.current[notification.id];
                setMentionNotifications((prev) => prev.filter((item) => item.id !== notification.id));
                handleOpenMentionTarget(notification.conversationId, notification.messageId);
              }}
            >
              <div className="mention-toast-label">You were mentioned</div>
              <div className="mention-toast-title">{notification.senderName}</div>
              <div className="mention-toast-preview">{notification.previewText || 'Open team chat'}</div>
            </button>
          ))}
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
                onClick={async () => {
                  const availableGroups = textingGroups.length > 0 ? textingGroups : await fetchTextingGroups();

                  if ((availableGroups || []).length > 0) {
                    setSmsMode('texting-group');
                    setActiveChatId(null);
                    setActiveCustomerContactId(null);
                    setMessages([]);
                  }
                }}
                disabled={textingGroupLoading}
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
                hasSavedContact={Boolean(activeSmsSavedContact)}
                selectedTextingGroup={smsMode === 'texting-group' ? selectedTextingGroup : null}
                threadLoading={false}
                showTeamDetailsAction={false}
                onOpenTeamDetails={handleOpenTeamDetails}
                onOpenTeamCalendar={handleOpenTeamCalendar}
                onSwitchNumber={(num) => {
                  setActiveChatId(buildConversationKey('customer', normalize(num)));
                setActiveCustomerContactId(activeChat?._id || null);
              }}
                onAssignContact={handleAssignContact}
                onUpdateAssignmentStatus={handleUpdateAssignmentStatus}
                onAddUserToContacts={(payload) => handleOpenSmsContactModal(payload)}
                onCustomerMessageSent={(message) => {
                  if (smsMode !== 'direct') return;
                  if (message?.textingGroupId) return;
                  upsertDirectConversationPreview(message, { markAsRead: true });
                }}
                assignableAgents={assignableAgents}
                internalForwardTargets={[]}
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
            onOpenTeamCalendar={handleOpenTeamCalendar}
            onSwitchNumber={(num) => {
              setActiveChatId(buildConversationKey('customer', normalize(num)));
              setActiveCustomerContactId(activeChat?._id || null);
            }}
            onAssignContact={handleAssignContact}
            onUpdateAssignmentStatus={handleUpdateAssignmentStatus}
            onAddUserToContacts={(payload) => handleOpenSmsContactModal(payload)}
            assignableAgents={assignableAgents}
            internalForwardTargets={internalForwardTargets}
            teamMentionMembers={activeTeamMentionMembers}
            jumpToMessageId={pendingMentionJump?.conversationKey === activeChatId ? pendingMentionJump.messageId : ''}
            onJumpToMessageHandled={(messageId) => {
              setPendingMentionJump((current) => (
                current?.messageId === messageId ? null : current
              ));
            }}
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

      {showSmsContactModal ? (
        <div className="directory-modal-overlay" onClick={() => !savingSmsContact && closeSmsContactModal()}>
          <div className="directory-modal" onClick={(event) => event.stopPropagation()}>
            <div className="directory-modal-header">
              <div>
                <h3>Add user to contacts</h3>
                <p>Save this SMS number to the Directory clients list.</p>
              </div>
              <button
                type="button"
                className="directory-modal-close"
                onClick={() => !savingSmsContact && closeSmsContactModal()}
                aria-label="Close add contact form"
              >
                ×
              </button>
            </div>

            <div className="directory-modal-body">
              {smsContactModalSuccess ? (
                <div className="directory-modal-feedback is-success">
                  {smsContactModalSuccess}
                </div>
              ) : null}
              {smsContactModalError ? (
                <div className="directory-modal-feedback is-error">
                  {smsContactModalError}
                </div>
              ) : null}
              <input
                className="numbers-input"
                placeholder="Client name"
                value={smsContactForm.name}
                onChange={(event) => setSmsContactForm((prev) => ({ ...prev, name: event.target.value }))}
              />
              <input
                className="numbers-input"
                placeholder="Phone number"
                value={smsContactForm.phone}
                onChange={(event) => setSmsContactForm((prev) => ({ ...prev, phone: event.target.value }))}
              />
              <input
                className="numbers-input"
                placeholder="Business name"
                value={smsContactForm.business}
                onChange={(event) => setSmsContactForm((prev) => ({ ...prev, business: event.target.value }))}
              />
              <input
                className="numbers-input"
                placeholder="Merchant ID"
                value={smsContactForm.merchantId}
                onChange={(event) => setSmsContactForm((prev) => ({ ...prev, merchantId: event.target.value }))}
              />
              <textarea
                className="numbers-input numbers-textarea"
                placeholder="Notes (optional)"
                value={smsContactForm.notes}
                onChange={(event) => setSmsContactForm((prev) => ({ ...prev, notes: event.target.value }))}
                rows={4}
              />
            </div>

            <div className="directory-modal-footer">
              <button
                type="button"
                className="directory-client-toolbar-btn"
                onClick={closeSmsContactModal}
                disabled={savingSmsContact}
              >
                Cancel
              </button>
              <button
                type="button"
                className="directory-client-toolbar-btn is-accent"
                onClick={handleSaveSmsContact}
                disabled={savingSmsContact || !smsContactForm.phone.trim()}
              >
                {savingSmsContact ? 'Saving...' : 'Save contact'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

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
                                <span
                                  className={`presence-dot is-${member.effectiveAvailabilityStatus || 'offline'}`}
                                  aria-hidden="true"
                                />
                                {member.name}
                                {member.isCurrentUser ? <span className="internal-teams-member-self">You</span> : null}
                              </div>
                              <div className="internal-teams-details-member-meta">
                                {[member.department || member.role || member.agentId, member.effectiveAvailabilityStatus ? `${member.effectiveAvailabilityStatus.charAt(0).toUpperCase()}${member.effectiveAvailabilityStatus.slice(1)}` : '']
                                  .filter(Boolean)
                                  .join(' • ')}
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
                              <span className="internal-teams-member-name">
                                <span
                                  className={`presence-dot is-${agent.effectiveAvailabilityStatus || 'offline'}`}
                                  aria-hidden="true"
                                />
                                {agent.name}
                              </span>
                              <span className="internal-teams-member-role">
                                {[agent.role, agent.effectiveAvailabilityStatus ? `${agent.effectiveAvailabilityStatus.charAt(0).toUpperCase()}${agent.effectiveAvailabilityStatus.slice(1)}` : '']
                                  .filter(Boolean)
                                  .join(' • ')}
                              </span>
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

      {showTeamCalendar && (
        <div
          className="messages-picker-overlay"
          onClick={() => !teamCalendarSaving && closeTeamCalendarModal()}
        >
          <div
            className="messages-picker-modal team-calendar-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="messages-picker-header">
              <h3>Group Calendar</h3>
              <p>{teamCalendarData?.teamName || activeChat?.teamName || activeChat?.name || 'Shared team events'}.</p>
            </div>

            <div className="team-calendar-body">
              {teamCalendarSuccess ? (
                <div className="internal-teams-details-success">
                  {teamCalendarSuccess}
                </div>
              ) : null}

              {teamCalendarError ? (
                <div className="internal-teams-details-error">
                  {teamCalendarError}
                </div>
              ) : null}

              <div className="team-calendar-section">
                <div className="team-calendar-section-head">
                  <span>Upcoming Events</span>
                  <span>{sortedTeamCalendarEvents.length}</span>
                </div>

                {teamCalendarLoading ? (
                  <div className="messages-picker-empty">Loading calendar events…</div>
                ) : sortedTeamCalendarEvents.length === 0 ? (
                  <div className="messages-picker-empty">
                    No events yet for this group. Add the first one below.
                  </div>
                ) : (
                  <div className="team-calendar-event-list">
                    {sortedTeamCalendarEvents.map((event) => {
                      const canDeleteEvent = currentRole === 'admin' || event.createdBy === currentUserId;

                      return (
                        <div key={event._id} className="team-calendar-event-card">
                          <div className="team-calendar-event-copy">
                            <div className="team-calendar-event-title-row">
                              <div className="team-calendar-event-title">{event.title}</div>
                              <div className="team-calendar-event-date">{formatCalendarEventDate(event.startAt)}</div>
                            </div>
                            <div className="team-calendar-event-time">
                              {formatCalendarEventTime(event.startAt)} to {formatCalendarEventTime(event.endAt)}
                            </div>
                            {event.description ? (
                              <div className="team-calendar-event-description">{event.description}</div>
                            ) : null}
                            <div className="team-calendar-event-meta">
                              Created by {event.createdByName || event.createdBy || 'Teammate'}
                            </div>
                          </div>
                          {canDeleteEvent ? (
                            <button
                              type="button"
                              className="team-calendar-event-delete"
                              onClick={() => handleDeleteTeamCalendarEvent(event._id)}
                              disabled={teamCalendarSaving}
                            >
                              Delete
                            </button>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="team-calendar-section">
                <div className="team-calendar-section-head">
                  <span>Add Event</span>
                </div>

                <div className="team-calendar-form-grid">
                  <label className="team-calendar-field">
                    <span>Title</span>
                    <input
                      type="text"
                      value={teamCalendarForm.title}
                      onChange={(event) => setTeamCalendarForm((prev) => ({ ...prev, title: event.target.value }))}
                      placeholder="Sprint review"
                      disabled={teamCalendarSaving}
                    />
                  </label>

                  <label className="team-calendar-field">
                    <span>Date</span>
                    <input
                      type="date"
                      value={teamCalendarForm.date}
                      onChange={(event) => setTeamCalendarForm((prev) => ({ ...prev, date: event.target.value }))}
                      disabled={teamCalendarSaving}
                    />
                  </label>

                  <label className="team-calendar-field">
                    <span>Start time</span>
                    <input
                      type="time"
                      value={teamCalendarForm.startTime}
                      onChange={(event) => setTeamCalendarForm((prev) => ({ ...prev, startTime: event.target.value }))}
                      disabled={teamCalendarSaving}
                    />
                  </label>

                  <label className="team-calendar-field">
                    <span>End time</span>
                    <input
                      type="time"
                      value={teamCalendarForm.endTime}
                      onChange={(event) => setTeamCalendarForm((prev) => ({ ...prev, endTime: event.target.value }))}
                      disabled={teamCalendarSaving}
                    />
                  </label>

                  <label className="team-calendar-field is-full">
                    <span>Description / notes</span>
                    <textarea
                      value={teamCalendarForm.description}
                      onChange={(event) => setTeamCalendarForm((prev) => ({ ...prev, description: event.target.value }))}
                      placeholder="Agenda, location, or anything teammates should know"
                      rows={3}
                      disabled={teamCalendarSaving}
                    />
                  </label>
                </div>
              </div>
            </div>

            <div className="messages-picker-footer team-calendar-footer">
              <button
                type="button"
                className="messages-picker-cancel"
                onClick={closeTeamCalendarModal}
                disabled={teamCalendarSaving}
              >
                Close
              </button>
              <button
                type="button"
                className="internal-teams-create-btn"
                onClick={handleCreateTeamCalendarEvent}
                disabled={teamCalendarSaving}
              >
                {teamCalendarSaving ? 'Saving…' : 'Add Event'}
              </button>
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
