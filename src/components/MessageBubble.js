import { useEffect, useState } from 'react';

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

  useEffect(() => {
    if (copyState !== 'copied') return undefined;

    const timeoutId = window.setTimeout(() => {
      setCopyState('idle');
    }, 1500);

    return () => window.clearTimeout(timeoutId);
  }, [copyState]);

  const handleCopyText = async () => {
    if (!canCopyText || typeof navigator === 'undefined' || !navigator.clipboard?.writeText) return;

    try {
      await navigator.clipboard.writeText(message.body);
      setCopyState('copied');
    } catch (error) {
      console.error('Copy text failed:', error);
      setCopyState('error');
      window.setTimeout(() => {
        setCopyState('idle');
      }, 1500);
    }
  };

  return (
    <div className={`message-row ${message.direction}`}>
      <div
        className={`message-bubble ${message.direction}`}
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

      {isTextingGroupMessage ? (
        <div className="message-inline-actions">
          {message.direction !== 'outbound' && showAddUserToContacts ? (
            <button
              type="button"
              className="message-inline-action"
              onClick={() => onAddUserToContacts?.(message)}
            >
              Add user to contacts
            </button>
          ) : null}
          <button
            type="button"
            className="message-inline-action"
            onClick={() => onReplyMessage?.(message)}
          >
            Reply
          </button>
          <button
            type="button"
            className={`message-inline-action${!canCopyText ? ' is-disabled' : ''}${copyState === 'copied' ? ' is-success' : ''}`}
            onClick={handleCopyText}
            disabled={!canCopyText}
          >
            {copyState === 'copied' ? 'Copied' : copyState === 'error' ? 'Copy failed' : 'Copy text'}
          </button>
          {message.direction === 'outbound' ? (
            <button
              type="button"
              className="message-inline-action"
              onClick={() => onSendAnotherMessage?.(message)}
            >
              Send another SMS message
            </button>
          ) : null}
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
