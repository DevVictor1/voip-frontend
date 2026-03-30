function MessageBubble({ message }) {
  const getStatusIcon = () => {
    if (message.direction !== 'outbound') return null;

    if (message.status === 'sent') return '✓';
    if (message.status === 'delivered') return '✓✓';
    if (message.status === 'failed') return '❌';

    return '';
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

        {/* 🔥 THIS IS THE STATUS */}
        <span style={{ marginLeft: '6px', fontSize: '12px' }}>
          {getStatusIcon()}
        </span>
      </div>
    </div>
  );
}

export default MessageBubble;