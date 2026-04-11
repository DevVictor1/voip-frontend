function MessageBubble({ message }) {
  const getStatusIcon = () => {
    if (message.direction !== 'outbound') return null;

    switch (message.status) {
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

  return (
    <div className={`message-row ${message.direction}`}>
      <div className={`message-bubble ${message.direction}`}>
        {message.body}
      </div>

      <div className="message-meta">
        {new Date(message.createdAt).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        })}

        {message.direction === 'outbound' && (
          <span style={{ marginLeft: '6px', fontSize: '12px' }}>
            {getStatusIcon()}
          </span>
        )}
      </div>
    </div>
  );
}

export default MessageBubble;