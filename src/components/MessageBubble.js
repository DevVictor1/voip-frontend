import { ChevronDown, Copy, Download, Reply } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

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
}) {
  const [copyState, setCopyState] = useState('idle');
  const [menuState, setMenuState] = useState({ open: false, mode: 'anchored', x: 0, y: 0 });
  const bubbleShellRef = useRef(null);
  const menuRef = useRef(null);
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
  const canCopyText = Boolean(message.body?.trim());
  const canReply = Boolean(onReplyMessage);
  const canDownloadMedia = Boolean(message.media?.[0]);
  const canSendAnotherSms = Boolean(onSendAnotherMessage && isTextingGroupMessage && message.direction === 'outbound');
  const canOpenMenu = canReply || canCopyText || canDownloadMedia || canSendAnotherSms;

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
        || bubbleShellRef.current?.contains(event.target)
      ) {
        return;
      }

      setMenuState((current) => ({ ...current, open: false }));
    };

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        setMenuState((current) => ({ ...current, open: false }));
      }
    };

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleEscape);

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [menuState.open]);

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

  const handleReply = () => {
    onReplyMessage?.(message);
    closeMenu();
  };

  const handleSendAnotherSms = () => {
    onSendAnotherMessage?.(message);
    closeMenu();
  };

  return (
    <div className={`message-row ${message.direction}`}>
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

          {message.media?.length > 0 && (
            <img
              src={message.media[0]}
              alt="MMS"
              style={{ maxWidth: '200px', borderRadius: '8px', marginBottom: '6px' }}
            />
          )}
          {message.body}
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
          </div>
        ) : null}
      </div>

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
