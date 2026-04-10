import { useMemo, useState } from 'react';
import ChatItem from './ChatItem';

function ChatList({ chats, activeId, onSelect }) {
  const [query, setQuery] = useState('');
  const filteredChats = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return chats;
    }
    return chats.filter((chat) => {
      const name = chat.name?.toLowerCase() ?? '';
      const phone = chat.phone?.toLowerCase() ?? '';
      return name.includes(normalized) || phone.includes(normalized);
    });
  }, [chats, query]);

  return (
    <div className="panel panel-scroll chat-list">
      <div className="chat-list-header">
        <div className="chat-list-title">
          <div>
            <h3 className="page-title chat-list-title-text">SMS Inbox</h3>
            <div className="page-subtitle">
              {chats.length} active conversation{chats.length === 1 ? '' : 's'}
            </div>
          </div>
          <span className="tag">Priority</span>
        </div>
        <input
          className="search-input"
          placeholder="Search conversations"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      <div className="chat-items">
        {filteredChats.length === 0 ? (
          <div className="empty-state">
            <div className="empty-title">No conversations found</div>
            <div className="empty-subtitle">
              Try searching by contact name or phone number.
            </div>
          </div>
        ) : (
          filteredChats.map((chat) => (
            <ChatItem
              key={chat.phone}
              chat={chat}
              isActive={chat.phone === activeId}
              onSelect={() => onSelect(chat.phone)}
            />
          ))
        )}
      </div>
    </div>
  );
}

export default ChatList;
