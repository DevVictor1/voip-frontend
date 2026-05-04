import { ChevronDown, Copy, Download, Pencil, Pin, PinOff, Reply, SmilePlus, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const REACTION_OPTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

const formatSmsContextNumber = (primary, fallback) => {
  return String(primary || fallback || '').trim() || 'unknown number';
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
  isHighlighted = false,
  searchQuery = '',
  isSearchMatch = false,
  isActiveSearchMatch = false,
  messageElementRef = null,
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
  const canDownloadMedia = Boolean(message.media?.[0]);
  const canSendAnotherSms = Boolean(onSendAnotherMessage && isTextingGroupMessage && message.direction === 'outbound');
  const canEdit = Boolean(isOwnInternalMessage && !isDeleted && !isSending && onEditMessage);
  const canDelete = Boolean(isOwnInternalMessage && !isDeleted && !isSending && onDeleteMessage);
  const canTogglePin = Boolean(isInternalThread && isInternalMessage && !isDeleted && !isSending && onTogglePinMessage);
  const canReact = Boolean(isInternalThread && isInternalMessage && !isDeleted && !isSending && onToggleReaction);
  const showPinnedIndicator = Boolean(isInternalThread && isInternalMessage && message.isPinned && !isDeleted);
  const canOpenMenu = !isDeleted && (canReply || canCopyText || canDownloadMedia || canSendAnotherSms || canEdit || canDelete || canTogglePin);
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

  const renderHighlightedBody = (body) => {
    const text = String(body || '');
    if (!normalizedSearchQuery || !text) {
      return text;
    }

    const lowerText = text.toLowerCase();
    const parts = [];
    let cursor = 0;
    let matchIndex = lowerText.indexOf(normalizedSearchQuery);
    let keyIndex = 0;

    while (matchIndex !== -1) {
      if (matchIndex > cursor) {
        parts.push(<span key={`text-${keyIndex}`}>{text.slice(cursor, matchIndex)}</span>);
      }

      const endIndex = matchIndex + normalizedSearchQuery.length;
      parts.push(
        <mark key={`mark-${keyIndex}`} className="message-search-highlight">
          {text.slice(matchIndex, endIndex)}
        </mark>
      );

      cursor = endIndex;
      keyIndex += 1;
      matchIndex = lowerText.indexOf(normalizedSearchQuery, cursor);
    }

    if (cursor < text.length) {
      parts.push(<span key={`text-tail-${keyIndex}`}>{text.slice(cursor)}</span>);
    }

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
    if (!menuState.open) return undefined;

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
  }, [menuState.open]);

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
      className={`message-row ${message.direction}${isHighlighted ? ' is-highlighted' : ''}${isSearchMatch ? ' is-search-match' : ''}${isActiveSearchMatch ? ' is-search-match-active' : ''}`}
      data-message-id={message._id || ''}
    >
      <div
        ref={bubbleShellRef}
        className={`message-bubble-shell ${message.direction}${menuState.open ? ' is-menu-open' : ''}`}
        onContextMenu={openContextMenu}
      >
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

        {canReact ? (
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
              <div className="message-body">{renderHighlightedBody(message.body)}</div>
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
                href={message.media[0]}
                download
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
        {new Date(message.createdAt).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        })}

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
