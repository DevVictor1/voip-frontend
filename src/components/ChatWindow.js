import { useEffect, useRef, useState, useCallback } from 'react';
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
  isSmsPage = false,
  isTextingGroupThread = false,
  threadLoading = false,
  showTeamDetailsAction = false,
  onOpenTeamDetails,
  onSwitchNumber,
  onAssignContact,
  onUpdateAssignmentStatus,
  assignableAgents,
  onBack,
  showBack
}) {
  const bottomRef = useRef(null);
  const [callLogs, setCallLogs] = useState([]);
  const [callStatus, setCallStatus] = useState(null);
  const [currentCallSid, setCurrentCallSid] = useState(null);

  const safeMessages = messages || [];
  const isCustomerChat = !chat?.conversationType || chat?.conversationType === 'customer';

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

  const mergedTimeline = [
    ...safeMessages.map((message) => ({ ...message, type: 'message' })),
    ...(isCustomerChat ? callLogs.map((call) => ({ ...call, type: 'call' })) : [])
  ].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

  const scrollToBottom = useCallback((behavior = 'smooth') => {
    window.requestAnimationFrame(() => {
      bottomRef.current?.scrollIntoView({ behavior, block: 'end' });
    });
  }, []);

  useEffect(() => {
    scrollToBottom('smooth');
  }, [mergedTimeline, scrollToBottom]);

  useEffect(() => {
    if (!chat?.conversationId && !chat?.phone) return;
    scrollToBottom('auto');
  }, [chat?.conversationId, chat?.phone, scrollToBottom]);

  if (!chat) {
    return (
      <div className="panel chat-window">
        <div className="chat-window-empty">
          <div className="empty-state chat-window-empty-card">
            <div className="empty-title">Select a conversation</div>
            <div className="empty-subtitle">
              Open a customer thread, teammate chat, or team channel to continue messaging.
            </div>
          </div>
        </div>
      </div>
    );
  }

  const displayName = chat.name
    || (chat.firstName || chat.lastName
      ? `${chat.firstName || ''} ${chat.lastName || ''}`.trim()
      : chat.phone);
  const smsSystemHints = isSmsPage && isCustomerChat ? [
    {
      key: 'received',
      title: `SMS received from ${chat?.phone || 'this number'}`,
      body: isTextingGroupThread
        ? `Shared replies from ${chat?.textingGroupName || 'this texting group'} will continue in this thread.`
        : 'Messages from this contact will continue to appear in this thread.',
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
    <div className={`panel chat-window chat-window-shell${isSmsPage && isCustomerChat ? ' is-sms-chat-window' : ''}`}>
      <Header
        title={displayName}
        status={isCustomerChat ? 'Active' : (chat.conversationType === 'team' ? 'Team Chat' : 'Internal Chat')}
        chat={chat}
        callStatus={callStatus}
        callLabel={getCallLabel()}
        onCall={handleCall}
        showTeamDetailsAction={showTeamDetailsAction}
        onOpenTeamDetails={onOpenTeamDetails}
        onSwitchNumber={onSwitchNumber}
        onAssignContact={onAssignContact}
        onUpdateAssignmentStatus={onUpdateAssignmentStatus}
        assignableAgents={assignableAgents}
        onBack={onBack}
        showBack={showBack}
      />

      <div className="chat-messages-container">
        <div className="chat-thread-backdrop" />
        <div className="message-list">
          {threadLoading && safeMessages.length === 0 ? (
            <div className="chat-thread-loading">
              <div className="chat-thread-loading-title">Loading conversation…</div>
              <div className="chat-thread-loading-copy">
                Swapping to the selected team chat.
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
              return <MessageBubble key={item._id || index} message={item} onRetry={handleRetry} />;
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
                        src={`${process.env.REACT_APP_API_URL}/api/recordings/${item.recordingSid}`}
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
        teamName={chat.conversationType === 'team' ? (chat.teamName || chat.name || '') : ''}
        textingGroupId={chat?.textingGroupId || ''}
        allowAttachments={isCustomerChat}
        setMessages={setMessages}
        onFocusInput={() => {
          window.setTimeout(() => {
            scrollToBottom('smooth');
          }, 160);
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
    </div>
  );
}

export default ChatWindow;
