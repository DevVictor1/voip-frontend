function MessageBubble({ message }) {
  const getStatusIcon = () => {
    // Only show for sent messages
    if (message.direction !== 'outbound') return null;

    switch (message.status) {
      case 'queued':
      case 'sent':
        return 'âœ“'; // sent

      case 'delivered':
        return 'âœ“âœ“'; // delivered

      case 'undelivered':
      case 'failed':
        return 'âŒ'; // failed

      default:
        return 'âœ“';
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

        {/* ðŸ”¥ STATUS ICON */}
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
