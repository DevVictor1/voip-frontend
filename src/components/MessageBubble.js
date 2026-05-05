import { Check, ChevronDown, Copy, Download, FileImage, FileSpreadsheet, FileText, Forward, Pencil, Pin, PinOff, Reply, SmilePlus, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const REACTION_OPTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

const formatSmsContextNumber = (primary, fallback) => {
  return String(primary || fallback || '').trim() || 'unknown number';
};

const formatAttachmentSize = (value) => {
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

const formatMessageTimestamp = (value) => {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) {
    return '';
  }

  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const year = String(date.getFullYear()).slice(-2);
  const time = date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

  return `${month}-${day}-${year} • ${time}`;
};

function MessageBubble({
  message,
  onRetry,
  isTextingGroupThread = false,
  showAddUserToContacts = false,
  onReplyMessage,
  onSendAnotherMessage,
  onAddUserToContacts,
  currentUserId = '',
  isInternalThread = false,
  onEditMessage,
  onDeleteMessage,
  onTogglePinMessage,
  onToggleReaction,
  onStartForwardSelection,
  isHighlighted = false,
  searchQuery = '',
  isSearchMatch = false,
  isActiveSearchMatch = false,
  messageElementRef = null,
  isForwardSelectionMode = false,
  isForwardSelected = false,
  onToggleForwardSelection,
  onJumpToReplyMessage,
}) {
  const [copyState, setCopyState] = useState('idle');
  const [menuState, setMenuState] = useState({ open: false, mode: 'anchored', x: 0, y: 0 });
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const [editError, setEditError] = useState('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [reactionPickerOpen, setReactionPickerOpen] = useState(false);
  const [isSavingReaction, setIsSavingReaction] = useState(false);
  const [reactionPickerStyle, setReactionPickerStyle] = useState({});
  const bubbleShellRef = useRef(null);
  const menuRef = useRef(null);
  const reactionPickerRef = useRef(null);
  const isInternalMessage = message.conversationType === 'internal_dm' || message.conversationType === 'team';
  const isTextingGroupMessage = Boolean(
    isTextingGroupThread
    && message.conversationType === 'customer'
  );
  const senderDisplayName = message.senderName || message.senderId || 'Internal teammate';
  const customerNumber = formatSmsContextNumber(
    message.direction === 'outbound' ? message.toFull : message.fromFull,
    message.direction === 'outbound' ? message.to : message.from
  );
  const assignedNumber = formatSmsContextNumber(
    message.direction === 'outbound' ? message.fromFull : message.toFull,
    message.direction === 'outbound' ? message.from : message.to
  );
  const attachment = message?.attachment && typeof message.attachment === 'object'
    ? message.attachment
    : null;
  const attachmentUrl = String(attachment?.fileUrl || '').trim();
  const attachmentName = String(attachment?.fileName || '').trim();
  const attachmentType = String(attachment?.fileType || '').trim();
  const attachmentSize = formatAttachmentSize(attachment?.fileSize || 0);
  const attachmentKind = getAttachmentKind(attachmentType, attachmentName);

  const getStatusMeta = () => {
    if (message.direction !== 'outbound') return null;

    switch (message.status) {
      case 'sending':
        return { icon: '…', className: 'is-pending' };

      case 'queued':
      case 'sent':
        return { icon: '✓', className: 'is-sent' };

      case 'delivered':
        return { icon: '✓✓', className: 'is-delivered' };

      case 'read':
        return {
          icon: '✓✓',
          className: isInternalMessage ? 'is-read' : 'is-delivered',
        };

      case 'undelivered':
      case 'failed':
        return { icon: '✖', className: 'is-failed' };

      default:
        return { icon: '✓', className: 'is-sent' };
    }
  };

  const statusMeta = getStatusMeta();
  const isSending = message.status === 'sending';
  const isFailed =
    message.status === 'failed' ||
    message.status === 'undelivered';
  const isDeleted = Boolean(message.isDeleted);
  const isOwnInternalMessage = Boolean(
    isInternalThread
    && isInternalMessage
    && message.senderId
    && currentUserId
    && message.senderId === currentUserId
  );
  const canCopyText = Boolean(message.body?.trim()) && !isDeleted;
  const canReply = Boolean(onReplyMessage);
  const canDownloadMedia = Boolean(message.media?.[0] || attachmentUrl);
  const canSendAnotherSms = Boolean(onSendAnotherMessage && isTextingGroupMessage && message.direction === 'outbound');
  const canEdit = Boolean(isOwnInternalMessage && !isDeleted && !isSending && String(message.body || '').trim() && onEditMessage);
  const canDelete = Boolean(isOwnInternalMessage && !isDeleted && !isSending && onDeleteMessage);
  const canTogglePin = Boolean(isInternalThread && isInternalMessage && !isDeleted && !isSending && onTogglePinMessage);
  const canReact = Boolean(isInternalThread && isInternalMessage && !isDeleted && !isSending && onToggleReaction);
  const canForward = Boolean(
    isInternalThread
    && isInternalMessage
    && !isDeleted
    && !isSending
    && (String(message.body || '').trim() || attachmentUrl)
    && onStartForwardSelection
  );
  const isForwardSelectable = Boolean(isForwardSelectionMode && canForward);
  const showPinnedIndicator = Boolean(isInternalThread && isInternalMessage && message.isPinned && !isDeleted);
  const showForwardedLabel = Boolean(isInternalThread && isInternalMessage && message.forwardedFromMessageId && !isDeleted);
  const replyPreview = message?.replyTo && typeof message.replyTo === 'object'
    ? {
        messageId: String(message.replyTo.messageId || '').trim(),
        senderName: String(message.replyTo.senderName || '').trim() || 'Message',
        body: String(message.replyTo.body || '').trim() || 'No message text',
      }
    : null;
  const showReplyPreview = Boolean(
    isInternalThread
    && isInternalMessage
    && !isDeleted
    && replyPreview?.messageId
  );
  const isTeamMessage = message.conversationType === 'team';
  const isCurrentUserMentioned = Boolean(
    isTeamMessage
    && currentUserId
    && !isDeleted
    && (
      (Array.isArray(message.mentionedUserIds) && message.mentionedUserIds.includes(currentUserId))
      || (Array.isArray(message.mentionedUsernames) && message.mentionedUsernames.includes(currentUserId))
    )
  );
  const canOpenMenu = !isDeleted && !isForwardSelectionMode && (canReply || canCopyText || canDownloadMedia || canSendAnotherSms || canEdit || canDelete || canTogglePin || canForward);
  const normalizedSearchQuery = String(searchQuery || '').trim().toLowerCase();
  const groupedReactions = useMemo(() => {
    const rawReactions = Array.isArray(message.reactions) ? message.reactions : [];
    if (rawReactions.length === 0) return [];

    const groups = new Map();
    rawReactions.forEach((reaction) => {
      const emoji = String(reaction?.emoji || '').trim();
      if (!emoji) return;

      const current = groups.get(emoji) || {
        emoji,
        count: 0,
        reactedByCurrentUser: false,
      };

      current.count += 1;
      if (reaction?.userId && reaction.userId === currentUserId) {
        current.reactedByCurrentUser = true;
      }

      groups.set(emoji, current);
    });

    return REACTION_OPTIONS
      .filter((emoji) => groups.has(emoji))
      .map((emoji) => groups.get(emoji));
  }, [currentUserId, message.reactions]);

  const positionReactionPicker = useCallback(() => {
    const pickerNode = reactionPickerRef.current;
    const shellNode = bubbleShellRef.current;
    if (!pickerNode || !shellNode) return;

    const shellRect = shellNode.getBoundingClientRect();
    const pickerRect = pickerNode.getBoundingClientRect();
    const scrollContainer = shellNode.closest('.message-list');
    const containerRect = scrollContainer?.getBoundingClientRect() || {
      left: 8,
      right: window.innerWidth - 8,
    };
    const padding = 12;

    const preferredLeft = message.direction === 'outbound'
      ? 0
      : Math.max(0, shellRect.width - pickerRect.width);
    const minLeft = containerRect.left + padding - shellRect.left;
    const maxLeft = containerRect.right - padding - shellRect.left - pickerRect.width;
    const resolvedLeft = Math.min(Math.max(preferredLeft, minLeft), Math.max(minLeft, maxLeft));

    setReactionPickerStyle({
      left: `${resolvedLeft}px`,
      right: 'auto',
    });
  }, [message.direction]);

  const renderSearchHighlights = (text, keyPrefix) => {
    const safeText = String(text || '');
    if (!normalizedSearchQuery || !safeText) {
      return safeText;
    }

    const lowerText = safeText.toLowerCase();
    const parts = [];
    let cursor = 0;
    let matchIndex = lowerText.indexOf(normalizedSearchQuery);
    let keyIndex = 0;

    while (matchIndex !== -1) {
      if (matchIndex > cursor) {
        parts.push(<span key={`${keyPrefix}-text-${keyIndex}`}>{safeText.slice(cursor, matchIndex)}</span>);
      }

      const endIndex = matchIndex + normalizedSearchQuery.length;
      parts.push(
        <mark key={`${keyPrefix}-mark-${keyIndex}`} className="message-search-highlight">
          {safeText.slice(matchIndex, endIndex)}
        </mark>
      );

      cursor = endIndex;
      keyIndex += 1;
      matchIndex = lowerText.indexOf(normalizedSearchQuery, cursor);
    }

    if (cursor < safeText.length) {
      parts.push(<span key={`${keyPrefix}-tail-${keyIndex}`}>{safeText.slice(cursor)}</span>);
    }

    return parts;
  };

  const renderHighlightedBody = (body) => {
    const text = String(body || '');
    if (!normalizedSearchQuery || !text) {
      if (!isTeamMessage) return text;
    }

    if (!isTeamMessage) {
      return renderSearchHighlights(text, 'body');
    }

    const mentionPattern = /(@[A-Za-z0-9._-]+)/g;
    const mentionTokenPattern = /^@[A-Za-z0-9._-]+$/;
    const segments = text.split(mentionPattern);
    const parts = [];

    segments.forEach((segment, index) => {
      if (!segment) return;

      if (mentionTokenPattern.test(segment)) {
        parts.push(
          <span key={`mention-${index}`} className="message-mention">
            {renderSearchHighlights(segment, `mention-${index}`)}
          </span>
        );
        return;
      }

      parts.push(...[].concat(renderSearchHighlights(segment, `body-${index}`)));
    });

    return parts;
  };

  const menuStyle = useMemo(() => {
    if (!menuState.open || menuState.mode !== 'context') return undefined;

    return {
      left: `${menuState.x}px`,
      top: `${menuState.y}px`,
    };
  }, [menuState]);

  useEffect(() => {
    if (copyState !== 'copied') return undefined;

    const timeoutId = window.setTimeout(() => {
      setCopyState('idle');
    }, 1500);

    return () => window.clearTimeout(timeoutId);
  }, [copyState]);

  useEffect(() => {
    if (!menuState.open && !reactionPickerOpen) return undefined;

    const handlePointerDown = (event) => {
      if (
        menuRef.current?.contains(event.target)
        || reactionPickerRef.current?.contains(event.target)
        || bubbleShellRef.current?.contains(event.target)
      ) {
        return;
      }

      setMenuState((current) => ({ ...current, open: false }));
      setReactionPickerOpen(false);
    };

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        setMenuState((current) => ({ ...current, open: false }));
        setReactionPickerOpen(false);
      }
    };

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleEscape);

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [menuState.open, reactionPickerOpen]);

  useEffect(() => {
    setIsEditing(false);
    setEditValue('');
    setEditError('');
    setIsSavingEdit(false);
    setReactionPickerOpen(false);
    setIsSavingReaction(false);
    setReactionPickerStyle({});
  }, [message._id, message.body, message.isDeleted, message.reactions]);

  useEffect(() => {
    if (!reactionPickerOpen) {
      setReactionPickerStyle({});
      return undefined;
    }

    const updatePosition = () => {
      window.requestAnimationFrame(positionReactionPicker);
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);

    return () => {
      window.removeEventListener('resize', updatePosition);
    };
  }, [positionReactionPicker, reactionPickerOpen]);

  const handleCopyText = async () => {
    if (!canCopyText || typeof navigator === 'undefined' || !navigator.clipboard?.writeText) return;

    try {
      await navigator.clipboard.writeText(message.body);
      setCopyState('copied');
      window.setTimeout(() => {
        setMenuState((current) => ({ ...current, open: false }));
      }, 700);
    } catch (error) {
      console.error('Copy text failed:', error);
      setCopyState('error');
      window.setTimeout(() => {
        setCopyState('idle');
      }, 1500);
    }
  };

  const openAnchoredMenu = () => {
    if (!canOpenMenu) return;

    setReactionPickerOpen(false);
    setMenuState((current) => ({
      open: !current.open || current.mode !== 'anchored',
      mode: 'anchored',
      x: 0,
      y: 0,
    }));
  };

  const openContextMenu = (event) => {
    if (!canOpenMenu) return;

    event.preventDefault();
    setReactionPickerOpen(false);

    const bounds = bubbleShellRef.current?.getBoundingClientRect();
    if (!bounds) {
      setMenuState({ open: true, mode: 'anchored', x: 0, y: 0 });
      return;
    }

    const menuWidth = 196;
    const menuHeight = 180;
    const padding = 10;
    const nextX = Math.min(
      Math.max(event.clientX - bounds.left, padding),
      Math.max(padding, bounds.width - menuWidth - padding)
    );
    const nextY = Math.min(
      Math.max(event.clientY - bounds.top, padding),
      Math.max(padding, bounds.height - menuHeight - padding)
    );

    setMenuState({
      open: true,
      mode: 'context',
      x: nextX,
      y: nextY,
    });
  };

  const closeMenu = () => {
    setMenuState((current) => ({ ...current, open: false }));
  };

  const handleStartForward = () => {
    onStartForwardSelection?.(message);
    setReactionPickerOpen(false);
    closeMenu();
  };

  const toggleReactionPicker = () => {
    if (!canReact) return;

    setReactionPickerOpen((current) => !current);
    if (menuState.open) {
      closeMenu();
    }
  };

  const handleReactionSelect = async (emoji) => {
    if (!canReact || !emoji || isSavingReaction) return;

    try {
      setIsSavingReaction(true);
      await onToggleReaction?.(message, emoji);
      setReactionPickerOpen(false);
    } catch (error) {
      console.error('Reaction update failed:', error);
    } finally {
      setIsSavingReaction(false);
    }
  };

  const handleReply = () => {
    onReplyMessage?.(message);
    closeMenu();
  };

  const handleJumpToReply = (event) => {
    event.preventDefault();
    event.stopPropagation();

    if (!replyPreview?.messageId) return;
    onJumpToReplyMessage?.(replyPreview.messageId);
  };

  const handleSendAnotherSms = () => {
    onSendAnotherMessage?.(message);
    closeMenu();
  };

  const handleTogglePin = () => {
    onTogglePinMessage?.(message);
    closeMenu();
  };

  const beginEdit = () => {
    setEditValue(String(message.body || ''));
    setEditError('');
    setIsEditing(true);
    closeMenu();
  };

  const cancelEdit = () => {
    setIsEditing(false);
    setEditValue('');
    setEditError('');
    setIsSavingEdit(false);
  };

  const saveEdit = async () => {
    const nextBody = String(editValue || '').trim();
    if (!nextBody) {
      setEditError('Message cannot be empty.');
      return;
    }

    if (nextBody === String(message.body || '').trim()) {
      cancelEdit();
      return;
    }

    setIsSavingEdit(true);
    setEditError('');

    try {
      await onEditMessage?.(message, nextBody);
      cancelEdit();
    } catch (error) {
      setEditError(error?.message || 'Unable to save changes.');
      setIsSavingEdit(false);
    }
  };

  return (
    <div
      ref={messageElementRef}
      className={`message-row ${message.direction}${isHighlighted ? ' is-highlighted' : ''}${isCurrentUserMentioned ? ' has-personal-mention' : ''}${isSearchMatch ? ' is-search-match' : ''}${isActiveSearchMatch ? ' is-search-match-active' : ''}${isForwardSelectable ? ' is-forward-selectable' : ''}${isForwardSelected ? ' is-forward-selected' : ''}`}
      data-message-id={message._id || ''}
    >
      <div
        ref={bubbleShellRef}
        className={`message-bubble-shell ${message.direction}${menuState.open ? ' is-menu-open' : ''}`}
        onContextMenu={openContextMenu}
        onClick={isForwardSelectable ? () => onToggleForwardSelection?.(message._id) : undefined}
      >
        {isForwardSelectable ? (
          <span className={`message-select-indicator${isForwardSelected ? ' is-selected' : ''}`} aria-hidden="true">
            {isForwardSelected ? <Check size={13} /> : null}
          </span>
        ) : null}

        {canOpenMenu ? (
          <button
            type="button"
            className={`message-menu-trigger ${menuState.open ? 'is-open' : ''}`}
            onClick={openAnchoredMenu}
            aria-haspopup="menu"
            aria-expanded={menuState.open}
            aria-label="Open message actions"
          >
            <ChevronDown size={14} />
          </button>
        ) : null}

        {canReact && !isForwardSelectionMode ? (
          <button
            type="button"
            className={`message-reaction-trigger ${message.direction}${reactionPickerOpen ? ' is-open' : ''}`}
            onClick={toggleReactionPicker}
            aria-haspopup="menu"
            aria-expanded={reactionPickerOpen}
            aria-label="Add reaction"
          >
            <SmilePlus size={14} />
          </button>
        ) : null}

        <div
          className={`message-bubble ${message.direction}${canOpenMenu ? ' has-menu' : ''}`}
          style={isSending ? { opacity: 0.6 } : undefined}
        >
          {message.conversationType === 'team' && message.direction !== 'outbound' && message.senderName ? (
            <div className="message-author">{message.senderName}</div>
          ) : null}

          {showForwardedLabel ? (
            <div className="message-forwarded-label">Forwarded</div>
          ) : null}

          {showReplyPreview ? (
            <button
              type="button"
              className="message-quoted-reply"
              onClick={handleJumpToReply}
            >
              <span className="message-quoted-reply-sender">{replyPreview.senderName}</span>
              <span className="message-quoted-reply-text">{replyPreview.body}</span>
            </button>
          ) : null}

          {isCurrentUserMentioned ? (
            <div className="message-mention-indicator">You were mentioned</div>
          ) : null}

          {isTextingGroupMessage ? (
            <div className="message-context-block">
              {message.direction === 'outbound' ? (
                <>
                  <div className="message-author">{senderDisplayName}</div>
                  <div className="message-context-copy">
                    SMS message sent to {customerNumber} from {assignedNumber}
                  </div>
                </>
              ) : (
                <>
                  <div className="message-context-label">
                    {showAddUserToContacts ? 'Add user to contacts' : 'SMS received'}
                  </div>
                  <div className="message-context-copy">
                    SMS message received from {customerNumber} to {assignedNumber}
                  </div>
                </>
              )}
            </div>
          ) : null}

          {isDeleted ? (
            <div className="message-deleted-copy">This message was deleted</div>
          ) : isEditing ? (
            <div className="message-edit-block">
              <textarea
                className="message-edit-input"
                value={editValue}
                onChange={(event) => {
                  setEditValue(event.target.value);
                  if (editError) setEditError('');
                }}
                rows={3}
                autoFocus
              />
              {editError ? <div className="message-edit-error">{editError}</div> : null}
              <div className="message-edit-actions">
                <button
                  type="button"
                  className="message-edit-button is-cancel"
                  onClick={cancelEdit}
                  disabled={isSavingEdit}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="message-edit-button is-save"
                  onClick={saveEdit}
                  disabled={isSavingEdit}
                >
                  {isSavingEdit ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          ) : (
            <>
              {message.media?.length > 0 && (
                <img
                  src={message.media[0]}
                  alt="MMS"
                  className="message-media-preview"
                />
              )}
              {attachmentUrl ? (
                <a
                  className="message-attachment-card"
                  href={attachmentUrl}
                  target="_blank"
                  rel="noreferrer"
                  download={attachmentName || undefined}
                >
                  <span className={`message-attachment-icon is-${attachmentKind}`} aria-hidden="true">
                    {attachmentKind === 'image' ? (
                      <FileImage size={18} />
                    ) : attachmentKind === 'sheet' ? (
                      <FileSpreadsheet size={18} />
                    ) : (
                      <FileText size={18} />
                    )}
                  </span>
                  <span className="message-attachment-copy">
                    <span className="message-attachment-name">{attachmentName || 'Attachment'}</span>
                    <span className="message-attachment-meta">
                      {[attachmentSize, attachmentType].filter(Boolean).join(' • ') || 'Open file'}
                    </span>
                  </span>
                  <span className="message-attachment-action">Open</span>
                </a>
              ) : null}
              {String(message.body || '').trim() ? (
                <div className="message-body">{renderHighlightedBody(message.body)}</div>
              ) : null}
            </>
          )}
        </div>

        {menuState.open ? (
          <div
            ref={menuRef}
            className={`message-actions-menu ${message.direction} ${menuState.mode === 'anchored' ? 'is-anchored' : 'is-context'}`}
            style={menuStyle}
            role="menu"
          >
            {canReply ? (
              <button
                type="button"
                className="message-actions-menu-item"
                onClick={handleReply}
                role="menuitem"
              >
                <Reply size={14} />
                <span>Reply</span>
              </button>
            ) : null}
            {canCopyText ? (
              <button
                type="button"
                className={`message-actions-menu-item${copyState === 'copied' ? ' is-success' : ''}`}
                onClick={handleCopyText}
                role="menuitem"
              >
                <Copy size={14} />
                <span>{copyState === 'copied' ? 'Copied' : copyState === 'error' ? 'Copy failed' : 'Copy text'}</span>
              </button>
            ) : null}
            {canDownloadMedia ? (
              <a
                className="message-actions-menu-item"
                href={message.media[0] || attachmentUrl}
                download={attachmentName || true}
                target="_blank"
                rel="noreferrer"
                onClick={closeMenu}
                role="menuitem"
              >
                <Download size={14} />
                <span>Download</span>
              </a>
            ) : null}
            {canSendAnotherSms ? (
              <button
                type="button"
                className="message-actions-menu-item"
                onClick={handleSendAnotherSms}
                role="menuitem"
              >
                <Reply size={14} />
                <span>Send another SMS</span>
              </button>
            ) : null}
            {canTogglePin ? (
              <button
                type="button"
                className="message-actions-menu-item"
                onClick={handleTogglePin}
                role="menuitem"
              >
                {message.isPinned ? <PinOff size={14} /> : <Pin size={14} />}
                <span>{message.isPinned ? 'Unpin message' : 'Pin message'}</span>
              </button>
            ) : null}
            {canForward ? (
              <button
                type="button"
                className="message-actions-menu-item"
                onClick={handleStartForward}
                role="menuitem"
              >
                <Forward size={14} />
                <span>Forward</span>
              </button>
            ) : null}
            {canEdit ? (
              <button
                type="button"
                className="message-actions-menu-item"
                onClick={beginEdit}
                role="menuitem"
              >
                <Pencil size={14} />
                <span>Edit</span>
              </button>
            ) : null}
            {canDelete ? (
              <button
                type="button"
                className="message-actions-menu-item is-danger"
                onClick={() => {
                  onDeleteMessage?.(message);
                  closeMenu();
                }}
                role="menuitem"
              >
                <Trash2 size={14} />
                <span>Delete</span>
              </button>
            ) : null}
          </div>
        ) : null}

        {reactionPickerOpen ? (
          <div
            ref={reactionPickerRef}
            className={`message-reaction-picker ${message.direction}`}
            style={reactionPickerStyle}
            role="menu"
            aria-label="Message reactions"
          >
            {REACTION_OPTIONS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                className="message-reaction-option"
                onClick={() => handleReactionSelect(emoji)}
                disabled={isSavingReaction}
                role="menuitem"
                aria-label={`React with ${emoji}`}
              >
                {emoji}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {groupedReactions.length > 0 ? (
        <div className="message-reactions" aria-label="Message reactions">
          {groupedReactions.map((reaction) => (
            <span
              key={reaction.emoji}
              className={`message-reaction-chip${reaction.reactedByCurrentUser ? ' is-owned' : ''}`}
              onContextMenu={(event) => {
                if (!reaction.reactedByCurrentUser || isSavingReaction) return;
                event.preventDefault();
                handleReactionSelect(reaction.emoji);
              }}
              title={reaction.reactedByCurrentUser ? 'Right-click to remove your reaction' : undefined}
            >
              <span className="message-reaction-chip-emoji">{reaction.emoji}</span>
              <span className="message-reaction-chip-count">{reaction.count}</span>
            </span>
          ))}
        </div>
      ) : null}

      {isTextingGroupMessage && message.direction !== 'outbound' && showAddUserToContacts ? (
        <div className="message-inline-actions">
          <button
            type="button"
            className="message-inline-action"
            onClick={() => onAddUserToContacts?.(message)}
          >
            Add user to contacts
          </button>
        </div>
      ) : null}

      <div className="message-meta" style={isFailed ? { color: '#dc2626' } : undefined}>
        {formatMessageTimestamp(message.createdAt)}

        {!isDeleted && message.editedAt ? (
          <span className="message-edited-indicator">
            edited
          </span>
        ) : null}

        {showPinnedIndicator ? (
          <span className="message-pinned-indicator" aria-label="Pinned message">
            📌
          </span>
        ) : null}

        {isFailed ? (
          <span style={{ marginLeft: '6px', fontSize: '12px' }}>
            Failed
          </span>
        ) : message.direction === 'outbound' && statusMeta ? (
          <span className={`message-status-indicator ${statusMeta.className}`}>
            {statusMeta.icon}
          </span>
        ) : null}

        {isFailed && (
          <span
            style={{
              marginLeft: 8,
              cursor: isSending ? 'not-allowed' : 'pointer',
              fontSize: '12px',
              color: isSending ? '#9ca3af' : '#2563eb'
            }}
            onClick={() => {
              if (!isSending) onRetry?.(message);
            }}
          >
            {isSending ? 'Retrying...' : 'Retry'}
          </span>
        )}
      </div>
    </div>
  );
}

export default MessageBubble;
