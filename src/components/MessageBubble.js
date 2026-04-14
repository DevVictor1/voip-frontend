function MessageBubble({ message, onRetry }) {
  const getStatusIcon = () => {
    if (message.direction !== 'outbound') return null;

    switch (message.status) {
      case 'sending':
        return '…';

      case 'queued':
      case 'sent':
        return '✓'; // single tick

      case 'delivered':
        return '✓✓'; // double tick

      case 'undelivered':
      case 'failed':
        return '✖'; // failed

      default:
        return '✓';
    }
  };

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
        ) : message.direction === 'outbound' && (
          <span style={{ marginLeft: '6px', fontSize: '12px' }}>
            {getStatusIcon()}
          </span>
        )}

        {isFailed && (
          <span
            style={{
              marginLeft: 8,
              cursor: 'pointer',
              fontSize: '12px',
              color: '#2563eb'
            }}
            onClick={() => onRetry?.(message)}
          >
            Retry
          </span>
        )}
      </div>
    </div>
  );
}

export default MessageBubble;
