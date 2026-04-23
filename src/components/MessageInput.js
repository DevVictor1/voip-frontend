import { useEffect, useRef, useState } from 'react';
import './MessageInput.css';
import BASE_URL from '../config/api';
import { getStoredAuthUser } from '../services/auth';

export const sendMessageRequest = async (to, message, mediaUrl) => {
  const isCustomerChat = !to?.conversationType || to.conversationType === 'customer';
  const endpoint = isCustomerChat ? '/api/sms/send' : '/api/messages/send';
  const payload = isCustomerChat
    ? { to: to?.chatId || to, message, mediaUrl }
    : {
        conversationType: to.conversationType,
        conversationId: to.chatId,
        userId: to.userId,
        body: message,
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

function MessageInput({
  chatId,
  conversationType = 'customer',
  userId,
  teamName = '',
  textingGroupId = '',
  allowAttachments = true,
  onMessageSent,
  setMessages,
  onFocusInput
}) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [mediaUrl, setMediaUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);
  const textareaRef = useRef(null);
  const currentUserName = getStoredAuthUser()?.name || getStoredAuthUser()?.agentId || '';

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.style.height = 'auto';
    textarea.style.overflowY = 'hidden';

    const nextHeight = Math.min(textarea.scrollHeight, 120);
    textarea.style.height = `${nextHeight}px`;
    textarea.style.overflowY = textarea.scrollHeight > 120 ? 'auto' : 'hidden';
  }, [text]);

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch(`${BASE_URL}/api/sms/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) throw new Error('Upload failed');

      const data = await res.json();
      setMediaUrl(data.url);
    } catch (err) {
      console.error('Upload failed:', err);
      setMediaUrl('');
    } finally {
      setUploading(false);
    }
  };

  const handleRemoveMedia = () => {
    setMediaUrl('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSend = async () => {
    if (sending || uploading) return;
    if ((!text.trim() && !mediaUrl) || !chatId) return;

    setSending(true);

    const tempId = `temp-${Date.now()}`;
    const tempMessage = {
      _id: tempId,
      body: text,
      media: mediaUrl ? [mediaUrl] : [],
      direction: 'outbound',
      conversationType,
      conversationId: chatId,
      senderId: userId,
      status: 'sending',
      createdAt: new Date().toISOString(),
    };

    if (setMessages) {
      setMessages((prev) => [...prev, tempMessage]);
    } else if (onMessageSent) {
      onMessageSent(tempMessage);
    }

    setText('');

    try {
      const data = await sendMessageRequest(
        {
          chatId,
          conversationType,
          userId,
          teamName,
          textingGroupId,
          senderName: currentUserName,
        },
        text,
        mediaUrl || undefined
      );

      const resolvedMessage = {
        ...data,
        direction: data.direction || (data.senderId && data.senderId !== userId ? 'inbound' : 'outbound'),
        conversationType: data.conversationType || conversationType,
        conversationId: data.conversationId || chatId,
      };

      if (setMessages) {
        setMessages((prev) => {
          const tempIndex = prev.findIndex((m) => m._id === tempId);

          if (tempIndex !== -1) {
            const next = [...prev];
            next[tempIndex] = resolvedMessage;
            return next;
          }

          const exists = prev.find(
            (m) =>
              (resolvedMessage._id && m._id === resolvedMessage._id)
              || (resolvedMessage.sid && m.sid === resolvedMessage.sid)
          );

          if (exists) return prev;

          return [...prev, resolvedMessage];
        });
      } else if (onMessageSent) {
        onMessageSent(resolvedMessage);
      }
    } catch (err) {
      console.error(err);
      if (setMessages) {
        setMessages((prev) =>
          prev.map((m) =>
            m._id === tempId ? { ...m, status: 'failed' } : m
          )
        );
      }
    } finally {
      setSending(false);
      setMediaUrl('');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  return (
    <div className="message-input-container">
      {mediaUrl && (
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
      )}

      <div className="message-input-row">
        <textarea
          ref={textareaRef}
          className="message-input-field"
          placeholder="Type a message..."
          value={text}
          onChange={(e) => setText(e.target.value)}
          onFocus={() => onFocusInput?.()}
          rows={1}
          onKeyDown={(e) => {
            if (sending || uploading) return;
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
        />

        {allowAttachments && (
          <>
            <input
              ref={fileInputRef}
              className="mms-file-input"
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              disabled={uploading}
            />

            <button
              type="button"
              className="mms-attach-btn"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? 'Uploading...' : 'Attach'}
            </button>
          </>
        )}

        <button className="message-send-btn" onClick={handleSend} disabled={sending || uploading}>
          {sending ? 'Sending...' : 'Send'}
        </button>
      </div>
    </div>
  );
}

export default MessageInput;
