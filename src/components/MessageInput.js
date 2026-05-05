import { useEffect, useMemo, useRef, useState } from 'react';
import { FileImage, FileSpreadsheet, FileText, Paperclip, X } from 'lucide-react';
import './MessageInput.css';
import BASE_URL from '../config/api';
import { getStoredAuthToken, getStoredAuthUser } from '../services/auth';

export const sendMessageRequest = async (to, message, mediaUrl, attachment) => {
  const isCustomerChat = !to?.conversationType || to.conversationType === 'customer';
  const endpoint = isCustomerChat ? '/api/sms/send' : '/api/messages/send';
  const payload = isCustomerChat
    ? {
        to: to?.chatId || to,
        message,
        mediaUrl,
        ...(to?.textingGroupId ? { textingGroupId: to.textingGroupId } : {}),
        ...(to?.userId ? { userId: to.userId } : {}),
        ...(to?.senderName ? { senderName: to.senderName } : {}),
        ...(to?.role ? { role: to.role } : {}),
      }
    : {
        conversationType: to.conversationType,
        conversationId: to.chatId,
        userId: to.userId,
        body: message,
        ...(attachment ? { attachment } : {}),
        ...(to.forwardedFromMessageId ? { forwardedFromMessageId: to.forwardedFromMessageId } : {}),
        ...(to.replyTo ? { replyTo: to.replyTo } : {}),
        ...(to.teamName ? { teamName: to.teamName } : {}),
        ...(to.textingGroupId ? { textingGroupId: to.textingGroupId } : {}),
        ...(to.senderName ? { senderName: to.senderName } : {}),
      };

  const res = await fetch(`${BASE_URL}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) throw new Error('Send failed');
  return res.json();
};

const formatFileSize = (value) => {
  const size = Number(value || 0);
  if (!Number.isFinite(size) || size <= 0) return '';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(size < 10 * 1024 ? 1 : 0)} KB`;
  return `${(size / (1024 * 1024)).toFixed(size < 10 * 1024 * 1024 ? 1 : 0)} MB`;
};

const getAttachmentKind = (fileType = '', fileName = '') => {
  const normalizedType = String(fileType || '').toLowerCase();
  const lowerName = String(fileName || '').toLowerCase();

  if (normalizedType.startsWith('image/')) return 'image';
  if (
    normalizedType.includes('sheet')
    || lowerName.endsWith('.csv')
    || lowerName.endsWith('.xls')
    || lowerName.endsWith('.xlsx')
  ) {
    return 'sheet';
  }

  return 'document';
};

function MessageInput({
  chatId,
  conversationType = 'customer',
  userId,
  role = '',
  teamName = '',
  teamMentionMembers = [],
  textingGroupId = '',
  focusNonce = 0,
  allowAttachments = true,
  replyContext = null,
  onClearReply,
  onSendSuccess,
  onMessageSent,
  setMessages,
  onFocusInput,
}) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [mediaUrl, setMediaUrl] = useState('');
  const [selectedAttachment, setSelectedAttachment] = useState(null);
  const [attachmentError, setAttachmentError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [mentionState, setMentionState] = useState({ open: false, query: '', start: -1, end: -1 });
  const fileInputRef = useRef(null);
  const textareaRef = useRef(null);
  const authToken = getStoredAuthToken();
  const currentUserName = getStoredAuthUser()?.name || getStoredAuthUser()?.agentId || '';
  const isTeamChat = conversationType === 'team';
  const isCustomerChat = !conversationType || conversationType === 'customer';
  const isInternalChat = conversationType === 'internal_dm' || conversationType === 'team';

  const filteredMentionMembers = useMemo(() => {
    if (!isTeamChat || !mentionState.open) return [];

    const normalizedQuery = mentionState.query.trim().toLowerCase();
    const list = Array.isArray(teamMentionMembers) ? teamMentionMembers : [];
    if (!normalizedQuery) return list;

    return list.filter((member) => (
      [member?.name, member?.agentId, member?.role]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(normalizedQuery)
    ));
  }, [isTeamChat, mentionState.open, mentionState.query, teamMentionMembers]);

  const updateMentionState = (value, cursorPosition) => {
    if (!isTeamChat) {
      setMentionState({ open: false, query: '', start: -1, end: -1 });
      return;
    }

    const safeValue = String(value || '');
    const cursor = Math.max(0, Math.min(cursorPosition ?? safeValue.length, safeValue.length));
    const prefix = safeValue.slice(0, cursor);
    const triggerIndex = prefix.lastIndexOf('@');

    if (triggerIndex === -1) {
      setMentionState({ open: false, query: '', start: -1, end: -1 });
      return;
    }

    const previousChar = triggerIndex > 0 ? prefix.charAt(triggerIndex - 1) : '';
    if (previousChar && !/\s/.test(previousChar)) {
      setMentionState({ open: false, query: '', start: -1, end: -1 });
      return;
    }

    const query = prefix.slice(triggerIndex + 1);
    if (/\s/.test(query)) {
      setMentionState({ open: false, query: '', start: -1, end: -1 });
      return;
    }

    setMentionState({
      open: true,
      query,
      start: triggerIndex,
      end: cursor,
    });
  };

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.style.height = 'auto';
    textarea.style.overflowY = 'hidden';

    const nextHeight = Math.min(textarea.scrollHeight, 120);
    textarea.style.height = `${nextHeight}px`;
    textarea.style.overflowY = textarea.scrollHeight > 120 ? 'auto' : 'hidden';
  }, [text]);

  useEffect(() => {
    setText('');
    setMediaUrl('');
    setSelectedAttachment(null);
    setAttachmentError('');
    setMentionState({ open: false, query: '', start: -1, end: -1 });

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [chatId, conversationType, textingGroupId]);

  useEffect(() => {
    const handleComposerFocus = (event) => {
      const detail = event.detail || {};
      const matchesChat = String(detail.chatId || '') === String(chatId || '');
      const matchesConversation = String(detail.conversationType || 'customer') === String(conversationType || 'customer');
      const matchesTextingGroup = String(detail.textingGroupId || '') === String(textingGroupId || '');

      if (!matchesChat || !matchesConversation || !matchesTextingGroup) return;

      textareaRef.current?.focus();
      const nextValue = textareaRef.current?.value || '';
      textareaRef.current?.setSelectionRange(nextValue.length, nextValue.length);
      onFocusInput?.();
    };

    window.addEventListener('focusMessageComposer', handleComposerFocus);

    return () => {
      window.removeEventListener('focusMessageComposer', handleComposerFocus);
    };
  }, [chatId, conversationType, onFocusInput, textingGroupId]);

  useEffect(() => {
    if (!focusNonce) return;

    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.focus();
    const nextValue = textarea.value || '';
    textarea.setSelectionRange(nextValue.length, nextValue.length);
    onFocusInput?.();
  }, [focusNonce, onFocusInput]);

  const handleFileChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setAttachmentError('');

    try {
      const formData = new FormData();
      formData.append('file', file);

      if (isCustomerChat) {
        const res = await fetch(`${BASE_URL}/api/sms/upload`, {
          method: 'POST',
          body: formData,
        });

        if (!res.ok) throw new Error('Upload failed');

        const data = await res.json();
        setMediaUrl(data.url);
        setSelectedAttachment({
          fileName: file.name,
          fileType: file.type,
          fileSize: file.size,
          fileUrl: data.url,
          kind: getAttachmentKind(file.type, file.name),
        });
        return;
      }

      const res = await fetch(`${BASE_URL}/api/messages/upload`, {
        method: 'POST',
        headers: authToken ? { Authorization: `Bearer ${authToken}` } : undefined,
        body: formData,
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error || 'Upload failed');
      }

      const attachment = data?.attachment || null;
      if (!attachment?.fileUrl) {
        throw new Error('Upload failed');
      }

      setSelectedAttachment({
        ...attachment,
        kind: getAttachmentKind(attachment.fileType, attachment.fileName),
      });
    } catch (error) {
      console.error('Upload failed:', error);
      setMediaUrl('');
      setSelectedAttachment(null);
      setAttachmentError(error?.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleRemoveMedia = () => {
    setMediaUrl('');
    setSelectedAttachment(null);
    setAttachmentError('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const insertMention = (member) => {
    const textarea = textareaRef.current;
    if (!textarea || !member?.agentId) return;

    const mentionToken = `@${member.agentId} `;
    const currentValue = text;
    const start = mentionState.start;
    const end = mentionState.end;
    const before = currentValue.slice(0, start);
    const after = currentValue.slice(end);
    const nextValue = `${before}${mentionToken}${after}`;
    const nextCursor = before.length + mentionToken.length;

    setText(nextValue);
    setMentionState({ open: false, query: '', start: -1, end: -1 });

    window.requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(nextCursor, nextCursor);
    });
  };

  const handleSend = async () => {
    if (sending || uploading) return;
    if ((!text.trim() && !mediaUrl && !selectedAttachment) || !chatId) return;

    setSending(true);

    const tempId = `temp-${Date.now()}`;
    const tempMessage = {
      _id: tempId,
      body: text,
      media: mediaUrl ? [mediaUrl] : [],
      attachment: selectedAttachment
        ? {
            fileName: selectedAttachment.fileName,
            fileType: selectedAttachment.fileType,
            fileSize: selectedAttachment.fileSize,
            fileUrl: selectedAttachment.fileUrl,
            storagePath: selectedAttachment.storagePath || '',
          }
        : null,
      direction: 'outbound',
      conversationType,
      conversationId: chatId,
      senderId: userId,
      status: 'sending',
      createdAt: new Date().toISOString(),
      ...(replyContext?.messageId
        ? {
            replyTo: {
              messageId: replyContext.messageId,
              senderName: replyContext.senderName || replyContext.senderLabel || '',
              body: replyContext.body || '',
            },
          }
        : {}),
    };

    if (setMessages) {
      setMessages((prev) => [...prev, tempMessage]);
    } else if (onMessageSent) {
      onMessageSent(tempMessage);
    }

    setText('');
    setMentionState({ open: false, query: '', start: -1, end: -1 });

    try {
      const data = await sendMessageRequest(
        {
          chatId,
          conversationType,
          userId,
          role,
          teamName,
          textingGroupId,
          senderName: currentUserName,
          replyTo: replyContext?.messageId
            ? {
                messageId: replyContext.messageId,
                senderName: replyContext.senderName || replyContext.senderLabel || '',
                body: replyContext.body || '',
              }
            : null,
        },
        text,
        mediaUrl || undefined,
        selectedAttachment
          ? {
              fileName: selectedAttachment.fileName,
              fileType: selectedAttachment.fileType,
              fileSize: selectedAttachment.fileSize,
              fileUrl: selectedAttachment.fileUrl,
              storagePath: selectedAttachment.storagePath || '',
            }
          : undefined
      );

      const resolvedMessage = {
        ...data,
        direction: data.direction || (data.senderId && data.senderId !== userId ? 'inbound' : 'outbound'),
        conversationType: data.conversationType || conversationType,
        conversationId: data.conversationId || chatId,
      };

      if (setMessages) {
        setMessages((prev) => {
          const existingResolvedIndex = prev.findIndex(
            (item) =>
              (resolvedMessage._id && item._id === resolvedMessage._id)
              || (resolvedMessage.sid && item.sid === resolvedMessage.sid)
          );
          const tempIndex = prev.findIndex((item) => item._id === tempId);

          if (tempIndex !== -1) {
            if (existingResolvedIndex !== -1 && existingResolvedIndex !== tempIndex) {
              return prev.filter((item) => item._id !== tempId);
            }

            const next = [...prev];
            next[tempIndex] = resolvedMessage;
            return next;
          }

          if (existingResolvedIndex !== -1) return prev;

          return [...prev, resolvedMessage];
        });
      }

      onMessageSent?.(resolvedMessage);
      onSendSuccess?.(resolvedMessage);
    } catch (error) {
      console.error(error);
      if (setMessages) {
        setMessages((prev) =>
          prev.map((item) => (
            item._id === tempId ? { ...item, status: 'failed' } : item
          ))
        );
      }
    } finally {
      setSending(false);
      setMediaUrl('');
      setSelectedAttachment(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  return (
    <div className="message-input-container">
      {replyContext ? (
        <div className="message-reply-preview">
          <div className="message-reply-copy">
            <div className="message-reply-label">{replyContext.contextLabel || 'Replying to'}</div>
            <div className="message-reply-sender">{replyContext.senderLabel || 'Message'}</div>
            <div className="message-reply-text">
              {replyContext.body || 'No message text'}
            </div>
          </div>
          <button
            type="button"
            className="message-reply-close"
            onClick={() => onClearReply?.()}
            aria-label="Cancel reply"
          >
            ×
          </button>
        </div>
      ) : null}

      {isCustomerChat && mediaUrl ? (
        <div className="mms-preview">
          <button
            type="button"
            className="mms-preview-remove"
            onClick={handleRemoveMedia}
            aria-label="Remove image"
          >
            ×
          </button>
          <img src={mediaUrl} alt="Selected" />
          <div className="mms-preview-note">Image ready</div>
        </div>
      ) : null}

      {!isCustomerChat && selectedAttachment ? (
        <div className="message-attachment-preview">
          <button
            type="button"
            className="message-attachment-preview-remove"
            onClick={handleRemoveMedia}
            aria-label="Remove selected file"
          >
            <X size={14} />
          </button>
          <div className={`message-attachment-preview-icon is-${selectedAttachment.kind}`}>
            {selectedAttachment.kind === 'image' ? (
              <FileImage size={18} />
            ) : selectedAttachment.kind === 'sheet' ? (
              <FileSpreadsheet size={18} />
            ) : (
              <FileText size={18} />
            )}
          </div>
          <div className="message-attachment-preview-copy">
            <div className="message-attachment-preview-name">{selectedAttachment.fileName}</div>
            <div className="message-attachment-preview-meta">
              {formatFileSize(selectedAttachment.fileSize)}
              {selectedAttachment.fileType ? ` • ${selectedAttachment.fileType}` : ''}
            </div>
          </div>
        </div>
      ) : null}

      {attachmentError ? (
        <div className="message-attachment-error" role="status" aria-live="polite">
          {attachmentError}
        </div>
      ) : null}

      <div className="message-input-row">
        {isTeamChat && mentionState.open ? (
          <div className="team-mention-picker" role="listbox" aria-label="Team members">
            {filteredMentionMembers.length > 0 ? (
              filteredMentionMembers.map((member) => (
                <button
                  key={member.agentId}
                  type="button"
                  className="team-mention-option"
                  onMouseDown={(event) => {
                    event.preventDefault();
                    insertMention(member);
                  }}
                  role="option"
                  aria-selected="false"
                >
                  <span className="team-mention-option-name">{member.name || member.agentId}</span>
                  <span className="team-mention-option-meta">@{member.agentId}{member.role ? ` • ${member.role}` : ''}</span>
                </button>
              ))
            ) : (
              <div className="team-mention-empty">No team members match this mention.</div>
            )}
          </div>
        ) : null}

        <textarea
          ref={textareaRef}
          className="message-input-field"
          placeholder="Type a message..."
          value={text}
          onChange={(event) => {
            const nextValue = event.target.value;
            setText(nextValue);
            updateMentionState(nextValue, event.target.selectionStart);
          }}
          onFocus={() => onFocusInput?.()}
          rows={1}
          onKeyDown={(event) => {
            if (sending || uploading) return;
            if (isTeamChat && mentionState.open && filteredMentionMembers.length > 0 && event.key === 'Enter') {
              event.preventDefault();
              insertMention(filteredMentionMembers[0]);
              return;
            }
            if (isTeamChat && mentionState.open && event.key === 'Escape') {
              event.preventDefault();
              setMentionState({ open: false, query: '', start: -1, end: -1 });
              return;
            }
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              handleSend();
            }
          }}
          onClick={(event) => updateMentionState(event.currentTarget.value, event.currentTarget.selectionStart)}
          onKeyUp={(event) => updateMentionState(event.currentTarget.value, event.currentTarget.selectionStart)}
        />

        {allowAttachments ? (
          <>
            <input
              ref={fileInputRef}
              className="mms-file-input"
              type="file"
              accept={isInternalChat
                ? '.pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.webp,.txt,.csv'
                : 'image/*'}
              onChange={handleFileChange}
              disabled={uploading}
            />

            <button
              type="button"
              className="mms-attach-btn"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              aria-label={uploading ? 'Uploading attachment' : 'Attach file'}
            >
              <Paperclip size={16} />
            </button>
          </>
        ) : null}

        <button className="message-send-btn" onClick={handleSend} disabled={sending || uploading}>
          {sending ? 'Sending...' : 'Send'}
        </button>
      </div>
    </div>
  );
}

export default MessageInput;
