import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { Phone } from 'lucide-react';
import Header from './Header';
import MessageBubble from './MessageBubble';
import MessageInput, { sendMessageRequest } from './MessageInput';
import BASE_URL from '../config/api';
import socket from '../socket';
import { startCall } from '../services/voice';

const normalize = (num) => num?.replace(/\D/g, '').slice(-10);
const FINAL_CALL_STATUSES = ['completed', 'failed', 'no-answer', 'busy', 'canceled'];

function ChatWindow({
  chat,
  messages,
  setMessages,
  currentUserId,
  currentUserRole = '',
  isSmsPage = false,
  isTextingGroupThread = false,
  isDirectSmsThread = false,
  hasSavedContact = false,
  selectedTextingGroup = null,
  threadLoading = false,
  showTeamDetailsAction = false,
  onOpenTeamDetails,
  onSwitchNumber,
  onAssignContact,
  onUpdateAssignmentStatus,
  onAddUserToContacts,
  onCustomerMessageSent,
  assignableAgents,
  onBack,
  showBack
}) {
  const bottomRef = useRef(null);
  const messageListRef = useRef(null);
  const messageRefs = useRef({});
  const highlightTimeoutRef = useRef(null);
  const suppressAutoScrollUntilRef = useRef(0);
  const isNearBottomRef = useRef(true);
  const searchInputRef = useRef(null);
  const [callLogs, setCallLogs] = useState([]);
  const [callStatus, setCallStatus] = useState(null);
  const [currentCallSid, setCurrentCallSid] = useState(null);
  const [replyTarget, setReplyTarget] = useState(null);
  const [composerFocusNonce, setComposerFocusNonce] = useState(0);
  const [pendingDeleteMessage, setPendingDeleteMessage] = useState(null);
  const [deletingMessageId, setDeletingMessageId] = useState('');
  const [highlightedMessageId, setHighlightedMessageId] = useState('');
  const [currentPinnedIndex, setCurrentPinnedIndex] = useState(0);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentSearchIndex, setCurrentSearchIndex] = useState(0);

  const safeMessages = useMemo(() => messages || [], [messages]);
  const isCustomerChat = !chat?.conversationType || chat?.conversationType === 'customer';
  const isInternalThread = chat?.conversationType === 'internal_dm' || chat?.conversationType === 'team';
  const canAddUserToContacts = Boolean(onAddUserToContacts && isCustomerChat && !hasSavedContact);
  const textingGroupDisplayName = chat?.textingGroupName || selectedTextingGroup?.name || 'Selected texting group';
  const textingGroupAssignedNumber = chat?.assignedNumber || selectedTextingGroup?.assignedNumber || '';
  const textingGroupCustomerLabel = chat?.name
    || [chat?.firstName, chat?.lastName].filter(Boolean).join(' ').trim()
    || chat?.phone
    || 'Unknown customer';

  const formatPhone = (num) => {
    if (!num) return '';

    const cleaned = num.replace(/\D/g, '');

    if (num.startsWith('+')) return num;
    if (cleaned.length === 11 && cleaned.startsWith('0')) return `+234${cleaned.slice(1)}`;
    if (cleaned.length === 10 && /^[789]/.test(cleaned)) return `+234${cleaned}`;
    if (cleaned.length === 10) return `+1${cleaned}`;

    return `+${cleaned}`;
  };

  const fetchCalls = useCallback(async () => {
    if (!chat?.phone || !isCustomerChat) {
      setCallLogs([]);
      return;
    }

    try {
      const res = await fetch(`${BASE_URL}/api/calls/by-number/${chat.phone}`);
      const data = await res.json();
      setCallLogs(data || []);
    } catch (err) {
      console.error('Fetch call logs error:', err);
    }
  }, [chat?.phone, isCustomerChat]);

  useEffect(() => {
    fetchCalls();
  }, [fetchCalls]);

  useEffect(() => {
    const handleStatus = (data) => {
      if (currentCallSid && data.callSid !== currentCallSid) return;

      setCallStatus(data.status);

      if (FINAL_CALL_STATUSES.includes(data.status)) {
        setTimeout(() => {
          setCallStatus(null);
          setCurrentCallSid(null);
        }, 1500);
      }
    };

    socket.on('callStatus', handleStatus);
    return () => socket.off('callStatus', handleStatus);
  }, [currentCallSid]);

  useEffect(() => {
    const handleVoiceState = (e) => {
      const nextState = e.detail?.state;
      if (!nextState) return;

      switch (nextState) {
        case 'connecting':
          setCallStatus('initiated');
          break;
        case 'ringing':
          setCallStatus('ringing');
          break;
        case 'in-call':
          setCallStatus('in-progress');
          break;
        case 'ended':
        case 'failed':
        case 'missed':
          setCallStatus(null);
          setCurrentCallSid(null);
          break;
        default:
          break;
      }
    };

    const handleCallEnded = () => {
      setCallStatus(null);
      setCurrentCallSid(null);
    };

    window.addEventListener('voiceCallState', handleVoiceState);
    window.addEventListener('callEnded', handleCallEnded);

    return () => {
      window.removeEventListener('voiceCallState', handleVoiceState);
      window.removeEventListener('callEnded', handleCallEnded);
    };
  }, []);

  useEffect(() => {
    if (!isCustomerChat) return undefined;

    let refreshTimeoutId = null;

    const refreshCallLogs = () => {
      fetchCalls();
    };

    const handleCallStatusRefresh = (data) => {
      refreshCallLogs();

      if (FINAL_CALL_STATUSES.includes(data?.status)) {
        window.clearTimeout(refreshTimeoutId);

        // A second fetch gives the recording callback time to persist final duration/recording fields.
        refreshTimeoutId = window.setTimeout(() => {
          fetchCalls();
        }, 2000);
      }
    };

    socket.on('callStatus', handleCallStatusRefresh);

    return () => {
      socket.off('callStatus', handleCallStatusRefresh);
      window.clearTimeout(refreshTimeoutId);
    };
  }, [fetchCalls, isCustomerChat]);

  useEffect(() => {
    if (!isCustomerChat) return undefined;

    let refreshTimeoutId = null;

    const handleCallEnded = () => {
      fetchCalls();

      window.clearTimeout(refreshTimeoutId);
      refreshTimeoutId = window.setTimeout(() => {
        fetchCalls();
      }, 2000);
    };

    socket.on('callEnded', handleCallEnded);
    window.addEventListener('callEnded', handleCallEnded);

    return () => {
      socket.off('callEnded', handleCallEnded);
      window.removeEventListener('callEnded', handleCallEnded);
      window.clearTimeout(refreshTimeoutId);
    };
  }, [fetchCalls, isCustomerChat]);

  const mergedTimeline = useMemo(() => [
    ...safeMessages.map((message) => ({ ...message, type: 'message' })),
    ...(isCustomerChat ? callLogs.map((call) => ({ ...call, type: 'call' })) : [])
  ].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)), [callLogs, isCustomerChat, safeMessages]);

  const isNearBottom = useCallback(() => {
    const node = messageListRef.current;
    if (!node) return true;
    const remaining = node.scrollHeight - node.scrollTop - node.clientHeight;
    return remaining <= 72;
  }, []);

  const scrollToBottom = useCallback((behavior = 'smooth', options = {}) => {
    const { force = false } = options;
    if (!force) {
      if (Date.now() < suppressAutoScrollUntilRef.current) return;
      if (!isNearBottomRef.current) return;
    }

    window.requestAnimationFrame(() => {
      bottomRef.current?.scrollIntoView({ behavior, block: 'end' });
    });
  }, []);

  useEffect(() => {
    const node = messageListRef.current;
    if (!node) return undefined;

    const handleScroll = () => {
      isNearBottomRef.current = isNearBottom();
    };

    handleScroll();
    node.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      node.removeEventListener('scroll', handleScroll);
    };
  }, [isNearBottom]);

  useEffect(() => {
    scrollToBottom('smooth');
  }, [mergedTimeline, scrollToBottom]);

  useEffect(() => {
    if (!chat?.conversationId && !chat?.phone) return;
    scrollToBottom('auto', { force: true });
    isNearBottomRef.current = true;
  }, [chat?.conversationId, chat?.phone, scrollToBottom]);

  useEffect(() => {
    setReplyTarget(null);
  }, [chat?.conversationId, chat?.phone, chat?.textingGroupId]);

  useEffect(() => {
    setPendingDeleteMessage(null);
    setDeletingMessageId('');
  }, [chat?.conversationId, chat?.phone, chat?.textingGroupId]);

  useEffect(() => {
    setHighlightedMessageId('');
    setCurrentPinnedIndex(0);
    setCurrentSearchIndex(0);
    setSearchQuery('');
    setIsSearchOpen(false);
    messageRefs.current = {};
    window.clearTimeout(highlightTimeoutRef.current);
  }, [chat?.conversationId, chat?.phone, chat?.textingGroupId]);

  useEffect(() => () => {
    window.clearTimeout(highlightTimeoutRef.current);
  }, []);

  useEffect(() => {
    if (!isSearchOpen) return;
    window.requestAnimationFrame(() => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    });
  }, [isSearchOpen]);

  const focusComposerForMessage = useCallback(() => {
    if (typeof window === 'undefined') return;

    window.dispatchEvent(new CustomEvent('focusMessageComposer', {
      detail: {
        chatId: isCustomerChat ? chat?.phone : chat?.conversationId,
        conversationType: chat?.conversationType || 'customer',
        textingGroupId: chat?.textingGroupId || '',
      },
    }));
  }, [chat?.conversationId, chat?.conversationType, chat?.phone, chat?.textingGroupId, isCustomerChat]);

  const handleReplyMessage = useCallback((message) => {
    if (!message) return;

    const conversationType = chat?.conversationType || 'customer';
    const isTeamChat = conversationType === 'team';
    const isCustomerSms = conversationType === 'customer';
    const isOutbound = message.direction === 'outbound';

    const senderLabel = isCustomerSms
      ? (isOutbound ? (message.senderName || message.senderId || 'Internal teammate') : 'Customer SMS')
      : (isOutbound ? 'You' : (message.senderName || message.senderId || (isTeamChat ? 'Teammate' : 'Contact')));

    const contextLabel = isCustomerSms
      ? (isTextingGroupThread
        ? (isOutbound ? 'Replying to sent SMS' : 'Replying to received SMS')
        : (isOutbound ? 'Replying to sent message' : 'Replying to received message'))
      : (isTeamChat ? 'Replying in team chat' : 'Replying in internal chat');

    setReplyTarget({
      id: message._id || message.sid || `${message.createdAt || Date.now()}`,
      senderLabel,
      contextLabel,
      body: String(message.body || '').trim(),
    });

    focusComposerForMessage();
  }, [chat?.conversationType, focusComposerForMessage, isTextingGroupThread]);

  const handleSendAnotherMessage = useCallback(() => {
    setComposerFocusNonce((prev) => prev + 1);
    focusComposerForMessage();
  }, [focusComposerForMessage]);

  const handleEditMessage = useCallback(async (message, nextBody) => {
    if (!isInternalThread || !message?._id) {
      throw new Error('Editing is only available for internal messages');
    }

    const response = await fetch(`${BASE_URL}/api/messages/message/${encodeURIComponent(message._id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: currentUserId,
        role: currentUserRole,
        body: nextBody,
      }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload?.error || 'Failed to edit message');
    }

    setMessages((prev) => prev.map((item) => (
      item._id === payload._id ? { ...item, ...payload } : item
    )));

    return payload;
  }, [currentUserId, currentUserRole, isInternalThread, setMessages]);

  const handleTogglePinMessage = useCallback(async (message) => {
    if (!isInternalThread || !message?._id) {
      throw new Error('Pinning is only available for internal messages');
    }

    const response = await fetch(`${BASE_URL}/api/messages/message/${encodeURIComponent(message._id)}/pin`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: currentUserId,
        role: currentUserRole,
        pinned: !Boolean(message.isPinned),
      }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload?.error || 'Failed to update pinned message');
    }

    setMessages((prev) => prev.map((item) => (
      item._id === payload._id ? { ...item, ...payload } : item
    )));

    return payload;
  }, [currentUserId, currentUserRole, isInternalThread, setMessages]);

  const requestDeleteMessage = useCallback((message) => {
    if (!isInternalThread || !message?._id) return;
    setPendingDeleteMessage(message);
  }, [isInternalThread]);

  const confirmDeleteMessage = useCallback(async () => {
    if (!pendingDeleteMessage?._id || !isInternalThread) return;

    setDeletingMessageId(pendingDeleteMessage._id);

    try {
      const response = await fetch(`${BASE_URL}/api/messages/message/${encodeURIComponent(pendingDeleteMessage._id)}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: currentUserId,
          role: currentUserRole,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to delete message');
      }

      setMessages((prev) => prev.map((item) => (
        item._id === payload._id ? { ...item, ...payload } : item
      )));
      setPendingDeleteMessage(null);
    } finally {
      setDeletingMessageId('');
    }
  }, [currentUserId, currentUserRole, isInternalThread, pendingDeleteMessage, setMessages]);

  const pinnedMessages = useMemo(() => (
    isInternalThread
      ? [...safeMessages]
        .filter((item) => item?.isPinned && !item?.isDeleted)
        .sort((left, right) => {
          const leftTime = new Date(left?.pinnedAt || left?.updatedAt || left?.createdAt || 0).getTime();
          const rightTime = new Date(right?.pinnedAt || right?.updatedAt || right?.createdAt || 0).getTime();
          return rightTime - leftTime;
        })
      : []
  ), [isInternalThread, safeMessages]);

  useEffect(() => {
    if (pinnedMessages.length === 0) {
      setCurrentPinnedIndex(0);
      return;
    }

    setCurrentPinnedIndex((prev) => (prev >= pinnedMessages.length ? 0 : prev));
  }, [pinnedMessages]);

  const pinnedCount = pinnedMessages.length;
  const activePinnedMessage = pinnedCount > 0
    ? pinnedMessages[currentPinnedIndex] || pinnedMessages[0]
    : null;
  const pinnedPreview = activePinnedMessage
    ? (String(activePinnedMessage.body || '').trim() || 'Pinned message')
    : '';

  const scrollToPinnedMessage = useCallback(() => {
    const pinnedMessageId = activePinnedMessage?._id;
    if (!pinnedMessageId) return;

    suppressAutoScrollUntilRef.current = Date.now() + 1800;
    isNearBottomRef.current = false;

    const runScroll = () => {
      const targetNode = messageRefs.current[pinnedMessageId]
        || (typeof document !== 'undefined'
          ? document.querySelector(`[data-message-id="${pinnedMessageId}"]`)
          : null);

      if (!targetNode) return;

      targetNode.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setHighlightedMessageId(pinnedMessageId);
      setCurrentPinnedIndex((prev) => {
        if (pinnedCount <= 1) return 0;
        return (prev + 1) % pinnedCount;
      });
      window.clearTimeout(highlightTimeoutRef.current);
      highlightTimeoutRef.current = window.setTimeout(() => {
        setHighlightedMessageId((current) => (current === pinnedMessageId ? '' : current));
      }, 1800);
    };

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(runScroll);
    });
  }, [activePinnedMessage?._id, pinnedCount]);

  const normalizedSearchQuery = useMemo(
    () => searchQuery.trim().toLowerCase(),
    [searchQuery]
  );

  const searchMatches = useMemo(() => {
    if (!isInternalThread || !normalizedSearchQuery) return [];

    return safeMessages
      .filter((item) => item?._id && !item?.isDeleted)
      .filter((item) => String(item.body || '').toLowerCase().includes(normalizedSearchQuery))
      .map((item) => item._id);
  }, [isInternalThread, normalizedSearchQuery, safeMessages]);

  useEffect(() => {
    if (searchMatches.length === 0) {
      setCurrentSearchIndex(0);
      return;
    }

    setCurrentSearchIndex((prev) => (prev >= searchMatches.length ? 0 : prev));
  }, [searchMatches]);

  const scrollToSearchMatch = useCallback((messageId) => {
    if (!messageId) return;

    suppressAutoScrollUntilRef.current = Date.now() + 1800;
    isNearBottomRef.current = false;

    const runScroll = () => {
      const targetNode = messageRefs.current[messageId]
        || (typeof document !== 'undefined'
          ? document.querySelector(`[data-message-id="${messageId}"]`)
          : null);

      if (!targetNode) return;

      targetNode.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setHighlightedMessageId(messageId);
      window.clearTimeout(highlightTimeoutRef.current);
      highlightTimeoutRef.current = window.setTimeout(() => {
        setHighlightedMessageId((current) => (current === messageId ? '' : current));
      }, 1800);
    };

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(runScroll);
    });
  }, []);

  const activeSearchMessageId = searchMatches.length > 0
    ? searchMatches[currentSearchIndex] || searchMatches[0]
    : '';

  useEffect(() => {
    if (!isSearchOpen || !activeSearchMessageId) return;
    scrollToSearchMatch(activeSearchMessageId);
  }, [activeSearchMessageId, isSearchOpen, scrollToSearchMatch]);

  const handleToggleSearch = useCallback(() => {
    if (!isInternalThread) return;

    setIsSearchOpen((prev) => {
      if (prev) {
        setSearchQuery('');
        setCurrentSearchIndex(0);
        return false;
      }

      return true;
    });
  }, [isInternalThread]);

  const handleCloseSearch = useCallback(() => {
    setIsSearchOpen(false);
    setSearchQuery('');
    setCurrentSearchIndex(0);
  }, []);

  const handlePreviousSearchMatch = useCallback(() => {
    if (searchMatches.length === 0) return;
    if (searchMatches.length === 1) {
      scrollToSearchMatch(searchMatches[0]);
      return;
    }
    setCurrentSearchIndex((prev) => (prev - 1 + searchMatches.length) % searchMatches.length);
  }, [scrollToSearchMatch, searchMatches]);

  const handleNextSearchMatch = useCallback(() => {
    if (searchMatches.length === 0) return;
    if (searchMatches.length === 1) {
      scrollToSearchMatch(searchMatches[0]);
      return;
    }
    setCurrentSearchIndex((prev) => (prev + 1) % searchMatches.length);
  }, [scrollToSearchMatch, searchMatches]);

  const handleSearchInputKeyDown = useCallback((event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      handleCloseSearch();
      return;
    }

    if (event.key !== 'Enter') return;

    event.preventDefault();

    if (event.shiftKey) {
      handlePreviousSearchMatch();
      return;
    }

    handleNextSearchMatch();
  }, [handleCloseSearch, handleNextSearchMatch, handlePreviousSearchMatch]);

  if (!chat) {
    const textingGroupEmptyTitle = selectedTextingGroup ? 'No shared threads found' : 'Select a texting group';
    const textingGroupEmptySubtitle = selectedTextingGroup
      ? 'Choose a customer thread from Recents to open the shared SMS conversation.'
      : 'Pick a texting group from the left column to open its shared inbox.';

    return (
      <div className={`panel chat-window${isTextingGroupThread || selectedTextingGroup ? ' is-texting-group-chat-window' : ''}`}>
        <div className="chat-window-empty">
          <div className="empty-state chat-window-empty-card">
            {isTextingGroupThread || selectedTextingGroup ? (
              <>
                <div className="empty-title">{textingGroupEmptyTitle}</div>
                <div className="empty-subtitle">{textingGroupEmptySubtitle}</div>
              </>
            ) : (
              <>
                <div className="empty-title">{isDirectSmsThread ? 'No text messages yet' : 'Select a conversation'}</div>
                <div className="empty-subtitle">
                  {isDirectSmsThread
                    ? 'Send and received text messages will appear here.'
                    : 'Open a customer thread, teammate chat, or team channel to continue messaging.'}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  const displayName = chat.name
    || (chat.firstName || chat.lastName
      ? `${chat.firstName || ''} ${chat.lastName || ''}`.trim()
      : chat.phone);
  const handleAddUserToContacts = (message = null) => {
    if (!isCustomerChat) return;

    const customerPhone = String(
      message
        ? (message.direction === 'outbound' ? message.toFull || message.to : message.fromFull || message.from)
        : (chat?.phone || '')
    ).trim();

    onAddUserToContacts?.({
      phone: customerPhone || chat?.phone || '',
      name: displayName,
      dba: chat?.dba || '',
      mid: chat?.mid || '',
    });
  };
  const smsSystemHints = isSmsPage && isCustomerChat && isTextingGroupThread ? [
    {
      key: 'received',
      title: `SMS received from ${chat?.phone || 'this number'}`,
      body: `Shared replies from ${chat?.textingGroupName || 'this texting group'} will continue in this thread.`,
    },
    ...(!chat?._id ? [{
      key: 'contact',
      title: 'Add user to contacts',
      body: 'Save this number in Directory when you want it available as a managed contact.',
    }] : []),
    {
      key: 'reply',
      title: 'Send another SMS message',
      body: 'Use the reply box below to continue the conversation.',
    },
  ] : [];

  const handleCall = async () => {
    if (!isCustomerChat || !chat?.phone) return;
    if (callStatus === 'initiated' || callStatus === 'ringing') return;

    try {
      setCallStatus('initiated');
      const formatted = formatPhone(chat.phone);
      await startCall(formatted);
    } catch (err) {
      console.error('Call failed:', err);
      setCallStatus(null);
    }
  };

  const handleRetry = async (message) => {
    if (!message || !message.body) return;

    const retryTime = new Date().toISOString();
    setMessages((prev) =>
      prev.map((item) =>
        item._id === message._id
          ? { ...item, status: 'sending', createdAt: retryTime }
          : item
      )
    );

    try {
      const res = await sendMessageRequest(
        {
          chatId: isCustomerChat ? chat.phone : chat.conversationId,
          conversationType: chat.conversationType || 'customer',
          userId: currentUserId,
          role: currentUserRole,
          textingGroupId: chat?.textingGroupId || '',
        },
        message.body,
        message.media?.[0]
      );

      if (!res) throw new Error('Retry failed');

      setMessages((prev) =>
        prev.map((item) =>
          item._id === message._id
            ? {
                ...res,
                direction: res.senderId && res.senderId !== currentUserId ? 'inbound' : 'outbound',
              }
            : item
        )
      );
    } catch (err) {
      console.error('Retry failed:', err);
      setMessages((prev) =>
        prev.map((item) =>
          item._id === message._id
            ? { ...item, status: 'failed' }
            : item
        )
      );
    }
  };

  const getCallLabel = () => {
    switch (callStatus) {
      case 'initiated': return 'Calling...';
      case 'ringing': return 'Ringing...';
      case 'in-progress': return 'In Call';
      default: return 'Call';
    }
  };

  return (
    <div className={`panel chat-window chat-window-shell${isSmsPage && isCustomerChat ? ' is-sms-chat-window' : ''}${isTextingGroupThread ? ' is-texting-group-chat-window' : ''}`}>
      <Header
        title={isTextingGroupThread ? `${textingGroupDisplayName} with ${textingGroupCustomerLabel}` : displayName}
        subtitle={isTextingGroupThread
          ? [chat?.phone, textingGroupAssignedNumber ? `Assigned number ${textingGroupAssignedNumber}` : ''].filter(Boolean).join(' • ')
          : undefined}
        status={isTextingGroupThread ? null : (isCustomerChat ? 'Active' : (chat.conversationType === 'team' ? 'Team Chat' : 'Internal Chat'))}
        chat={chat}
        hasSavedContact={hasSavedContact}
        mode={isTextingGroupThread ? 'texting-group' : 'default'}
        callStatus={callStatus}
        callLabel={getCallLabel()}
        onCall={handleCall}
        showTeamDetailsAction={showTeamDetailsAction}
        onOpenTeamDetails={onOpenTeamDetails}
        onSwitchNumber={onSwitchNumber}
        onAssignContact={onAssignContact}
        onUpdateAssignmentStatus={onUpdateAssignmentStatus}
        onAddUserToContacts={!isTextingGroupThread && canAddUserToContacts ? handleAddUserToContacts : null}
        assignableAgents={assignableAgents}
        onBack={onBack}
        showBack={showBack}
        onToggleSearch={isInternalThread ? handleToggleSearch : null}
        isSearchOpen={isSearchOpen}
      />

      {isInternalThread && isSearchOpen ? (
        <div className="chat-search-bar">
          <div className="chat-search-input-shell">
            <input
              ref={searchInputRef}
              type="search"
              className="chat-search-input"
              value={searchQuery}
              onChange={(event) => {
                setSearchQuery(event.target.value);
                setCurrentSearchIndex(0);
              }}
              onKeyDown={handleSearchInputKeyDown}
              placeholder="Search this conversation"
              aria-label="Search messages in this conversation"
            />
          </div>

          <div className="chat-search-toolbar">
            <span className={`chat-search-count${normalizedSearchQuery && searchMatches.length === 0 ? ' is-empty' : ''}`}>
              {normalizedSearchQuery
                ? (searchMatches.length > 0 ? `${currentSearchIndex + 1}/${searchMatches.length}` : '0 results')
                : 'Type to search'}
            </span>
            <button
              type="button"
              className="chat-search-nav"
              onClick={handlePreviousSearchMatch}
              disabled={searchMatches.length <= 1}
              aria-label="Previous search result"
            >
              Prev
            </button>
            <button
              type="button"
              className="chat-search-nav"
              onClick={handleNextSearchMatch}
              disabled={searchMatches.length <= 1}
              aria-label="Next search result"
            >
              Next
            </button>
            <button
              type="button"
              className="chat-search-close"
              onClick={handleCloseSearch}
              aria-label="Close message search"
            >
              Clear
            </button>
          </div>
        </div>
      ) : null}

      {activePinnedMessage ? (
        <button
          type="button"
          className="chat-pinned-bar"
          onClick={scrollToPinnedMessage}
        >
          <span className="chat-pinned-label">
            {pinnedCount > 1 ? `📌 ${currentPinnedIndex + 1}/${pinnedCount} Pinned:` : '📌 Pinned:'}
          </span>
          <span className="chat-pinned-preview">{pinnedPreview}</span>
        </button>
      ) : null}

      <div className="chat-messages-container">
        <div className="chat-thread-backdrop" />
        <div ref={messageListRef} className="message-list">
          {threadLoading && safeMessages.length === 0 ? (
            <div className="chat-thread-loading">
              <div className="chat-thread-loading-title">Loading conversation…</div>
              <div className="chat-thread-loading-copy">
                Swapping to the selected team chat.
              </div>
            </div>
          ) : null}

          {isTextingGroupThread && !threadLoading && mergedTimeline.length === 0 ? (
            <div className="chat-thread-loading is-empty">
              <div className="chat-thread-loading-title">No messages yet</div>
              <div className="chat-thread-loading-copy">
                Shared replies for this customer thread will appear here.
              </div>
            </div>
          ) : null}

          {smsSystemHints.length > 0 ? (
            <div className="sms-system-hints" aria-hidden="true">
              {smsSystemHints.map((hint) => (
                <div key={hint.key} className="sms-system-card">
                  <div className="sms-system-title">{hint.title}</div>
                  <div className="sms-system-copy">{hint.body}</div>
                </div>
              ))}
            </div>
          ) : null}

          {mergedTimeline.map((item, index) => {
            if (item.type === 'message') {
              return (
                <MessageBubble
                  key={item._id || index}
                  message={item}
                  onRetry={handleRetry}
                  isTextingGroupThread={isTextingGroupThread}
                  showAddUserToContacts={canAddUserToContacts}
                  onReplyMessage={handleReplyMessage}
                  onSendAnotherMessage={handleSendAnotherMessage}
                  onAddUserToContacts={handleAddUserToContacts}
                  currentUserId={currentUserId}
                  isInternalThread={isInternalThread}
                  onTogglePinMessage={handleTogglePinMessage}
                  onEditMessage={handleEditMessage}
                  onDeleteMessage={requestDeleteMessage}
                  isHighlighted={highlightedMessageId === item._id}
                  searchQuery={isInternalThread ? normalizedSearchQuery : ''}
                  isSearchMatch={searchMatches.includes(item._id)}
                  isActiveSearchMatch={activeSearchMessageId === item._id}
                  messageElementRef={(node) => {
                    if (!item._id) return;
                    if (node) {
                      messageRefs.current[item._id] = node;
                    } else {
                      delete messageRefs.current[item._id];
                    }
                  }}
                />
              );
            }

            const isOutbound = normalize(item.from) === normalize(chat.phone);

            return (
              <div
                key={item._id || item.sid || index}
                className={`call-event-row ${isOutbound ? 'outbound' : 'inbound'}`}
              >
                <div className={`call-event-card ${isOutbound ? 'outbound' : 'inbound'}`}>
                  <div className="call-event-title">
                    <span className="call-event-icon">
                      <Phone size={14} />
                    </span>
                    <span>
                    Call {item.status}
                    {item.duration ? ` - ${item.duration}s` : ''}
                    </span>
                  </div>

                  {item.recordingSid && (
                    <audio controls className="call-event-audio">
                      <source
                        src={`${BASE_URL}/api/recordings/${item.recordingSid}`}
                        type="audio/mpeg"
                      />
                    </audio>
                  )}
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>
      </div>

      <MessageInput
        chatId={isCustomerChat ? chat.phone : chat.conversationId}
        conversationType={chat.conversationType || 'customer'}
        userId={currentUserId}
        role={currentUserRole}
        teamName={chat.conversationType === 'team' ? (chat.teamName || chat.name || '') : ''}
        textingGroupId={chat?.textingGroupId || ''}
        focusNonce={composerFocusNonce}
        allowAttachments={isCustomerChat}
        replyContext={replyTarget}
        onClearReply={() => setReplyTarget(null)}
        setMessages={setMessages}
        onFocusInput={() => {
          window.setTimeout(() => {
            scrollToBottom('smooth');
          }, 160);
        }}
        onSendSuccess={(savedMessage) => {
          if (replyTarget) {
            setReplyTarget(null);
          }

          if (isDirectSmsThread && isCustomerChat) {
            onCustomerMessageSent?.(savedMessage);
          }
        }}
        onMessageSent={(msg) => {
          setMessages((prev) => {
            const exists = prev.find(
              (item) => item._id === msg._id || item.sid === msg.sid
            );
            if (exists) return prev;
            return [
              ...prev,
              {
                ...msg,
                direction: msg.senderId && msg.senderId !== currentUserId ? 'inbound' : 'outbound',
              },
            ];
          });
        }}
      />

      {pendingDeleteMessage ? (
        <div
          className="messages-picker-overlay"
          onClick={() => !deletingMessageId && setPendingDeleteMessage(null)}
        >
          <div
            className="messages-picker-modal internal-teams-confirm-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="messages-picker-header">
              <h3>Delete Message</h3>
              <p>Delete this message?</p>
            </div>

            <div className="internal-teams-confirm-body">
              <div className="internal-teams-confirm-warning">
                The message will stay in the conversation as “This message was deleted”.
              </div>
            </div>

            <div className="messages-picker-footer internal-teams-confirm-footer">
              <button
                type="button"
                className="messages-picker-cancel"
                onClick={() => setPendingDeleteMessage(null)}
                disabled={Boolean(deletingMessageId)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="internal-teams-delete-btn"
                onClick={confirmDeleteMessage}
                disabled={Boolean(deletingMessageId)}
              >
                {deletingMessageId ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default ChatWindow;
