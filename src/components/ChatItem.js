function ChatItem({ chat, isActive, onSelect }) {
  const className = `chat-item${isActive ? ' active' : ''}${
    chat.unread ? ' unread' : ''
  }`;

  // 🔥 Generate initials from phone (fallback)
  const initials = chat.phone
    ? chat.phone.slice(-2)
    : 'NA';

  return (
    <div
      className={className}
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect();
        }
      }}
    >
      <div className="chat-item-top">
        <div className="avatar-stack">
          <div className="chat-avatar">{initials}</div>

          <div>
            {/* 🔥 PHONE AS NAME */}
            <div className="chat-item-name">{chat.phone}</div>

            {/* 🔥 OPTIONAL STATUS (STATIC FOR NOW) */}
            <div className="chat-meta">
              <span>SMS Conversation</span>
            </div>
          </div>
        </div>

        <div className="chat-meta">
          {/* 🔥 FORMAT TIME */}
          <span>
            {chat.lastTime
              ? new Date(chat.lastTime).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })
              : ''}
          </span>

          {/* 🔥 UNREAD BADGE */}
          {chat.unread > 0 && (
            <span className="badge">{chat.unread}</span>
          )}
        </div>
      </div>

      {/* 🔥 LAST MESSAGE */}
      <div className="chat-item-preview">
        {chat.lastMessage || 'No messages yet'}
      </div>
    </div>
  );
}

export default ChatItem;