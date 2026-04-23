function MessageBubble({ message, onRetry }) {
  const isInternalMessage = message.conversationType === 'internal_dm' || message.conversationType === 'team';

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

  return (
    <div className={`message-row ${message.direction}`}>
      <div
        className={`message-bubble ${message.direction}`}
        style={isSending ? { opacity: 0.6 } : undefined}
      >
        {message.conversationType === 'team' && message.direction !== 'outbound' && message.senderName ? (
          <div className="message-author">{message.senderName}</div>
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
