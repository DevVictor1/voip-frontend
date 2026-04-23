import ImportContacts from './ImportContacts';
import { X } from 'lucide-react';
import BASE_URL from '../config/api';

const normalize = (num) => num?.replace(/\D/g, '').slice(-10);

function ContactsList({
  list,
  activeId,
  activeContactId = null,
  onSelect,
  activeSection = 'customers',
  showUnreadOnly = false,
  showImportTools = false,
  onImportSuccess,
  emptyTitle = 'No conversations here yet',
  emptySubtitle = '',
}) {
  const getSectionTitle = () => {
    if (activeSection === 'internal') return 'Internal Chat';
    if (activeSection === 'teams') return 'Internal Teams';
    return 'Customers / SMS';
  };

  const formatTimestamp = (value) => {
    if (!value) return '';

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';

    const now = new Date();
    const isSameDay = date.toDateString() === now.toDateString();

    return isSameDay
      ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  const getDisplayName = (item) => {
    if (item.conversationType === 'team') {
      const teamName = item.name || item.teamName || 'Team Chat';
      return teamName.startsWith('#') ? teamName : `# ${teamName}`;
    }

    if (item.conversationType === 'internal_dm') {
      return item.name || item.agentId || 'Internal Chat';
    }

    const fullName = [item.firstName, item.lastName].filter(Boolean).join(' ').trim();
    return fullName || item.name || item.phone;
  };

  const getActivePhone = (item) => {
    const phones = item.phones || [];
    return (
      phones.find((phone) => normalize(phone.number) === normalize(activeId?.replace('customer:', '')))?.number ||
      phones[0]?.number ||
      item.phone ||
      ''
    );
  };

  const getSecondaryLine = (item, phone) => {
    if (item.conversationType === 'team') {
      const memberCount = item.participants?.length || 0;
      return memberCount > 0
        ? `${memberCount} member${memberCount === 1 ? '' : 's'}`
        : (item.role || 'Team channel');
    }

    if (item.conversationType === 'internal_dm') {
      return item.role || 'Direct message';
    }

    return [phone, item.dba].filter(Boolean).join(' / ');
  };

  const getBadgeLabel = (item) => {
    if (item.conversationType === 'team') return 'Team';
    if (item.conversationType === 'internal_dm') return 'Internal';
    return item.isUnassigned ? 'Unassigned' : 'Assigned';
  };

  const getBadgeClassName = (item) => {
    if (item.conversationType === 'team') return 'assignment-badge is-team';
    if (item.conversationType === 'internal_dm') return 'assignment-badge is-internal';
    return `assignment-badge${item.isUnassigned ? ' is-unassigned' : ''}`;
  };

  const getIdentityClassName = (item) => {
    if (item.conversationType === 'team') return 'conversation-dot is-team';
    if (item.conversationType === 'internal_dm') return 'conversation-dot is-internal';
    return 'conversation-dot is-customer';
  };

  const handleDelete = async (id, e) => {
    e.stopPropagation();

    if (!window.confirm('Delete this contact?')) return;

    await fetch(`${BASE_URL}/api/contacts/${id}`, {
      method: 'DELETE',
    });

    window.location.reload();
  };

  const renderItems = (items) => {
    return items.map((item, index) => {
      const activePhone = getActivePhone(item);
      const conversationKey = item.key || `${item.conversationType || 'customer'}:${item.conversationId || item.phone}`;
      const isActive = item.conversationType === 'customer' && activeContactId && item._id
        ? activeContactId === item._id
        : activeId === conversationKey;
      const hasUnread = item.unread > 0;
      const displayName = getDisplayName(item);
      const secondaryLine = getSecondaryLine(item, activePhone);
      const preview = item.lastMessage || item.previewFallback || 'No messages yet';
      const timestamp = formatTimestamp(item.lastMessageAt || item.updatedAt);

      return (
        <div
          key={conversationKey || index}
          className={`contact-card${isActive ? ' is-active' : ''}${hasUnread ? ' has-unread' : ''}`}
          onClick={() => onSelect(item)}
        >
          {item._id && item.conversationType === 'customer' && (
            <button
              className="delete-btn"
              onClick={(e) => handleDelete(item._id, e)}
            >
              <X size={12} />
            </button>
          )}

          <div className="contact-card-body">
            <div className="contact-row contact-row-top">
              <div className="contact-main">
                <div className="contact-name-row">
                  <div className="contact-name-wrap">
                    <span className={getIdentityClassName(item)} aria-hidden="true" />
                    <div className="contact-name">
                      {displayName}
                    </div>
                  </div>
                  {timestamp ? (
                    <div className={`contact-time${hasUnread ? ' is-unread' : ''}`}>
                      {timestamp}
                    </div>
                  ) : null}
                </div>
                {secondaryLine && (
                  <div className="contact-meta">
                    {secondaryLine}
                  </div>
                )}
              </div>
            </div>

            <div className="contact-row contact-row-bottom">
              <div className={`contact-preview${hasUnread ? ' is-unread' : ''}`}>
                {preview}
              </div>
              <div className="contact-indicators">
                <span className={getBadgeClassName(item)}>
                  {getBadgeLabel(item)}
                </span>
                {hasUnread && (
                  <span className="unread-badge">{item.unread}</span>
                )}
              </div>
            </div>
          </div>
        </div>
      );
    });
  };

  return (
    <div className="contacts-wrapper">
      <div className="contacts-header">
        <div>
          <h3>{getSectionTitle()}</h3>
        </div>
        <div className="contacts-header-meta">
          {showUnreadOnly ? <span className="tag">Unread</span> : null}
          <span>{list.length} total</span>
        </div>
      </div>

      {showImportTools ? (
        <div className="contacts-import">
          <div className="contacts-import-panel">
            <ImportContacts onImportSuccess={onImportSuccess} />
          </div>
        </div>
      ) : null}

      <div className="contacts-scroll">
        {list.length > 0 ? (
          <div className="contacts-section">
            {renderItems(list)}
          </div>
        ) : (
          <div className="empty-state contacts-empty-state">
            <div className="empty-title">{emptyTitle}</div>
            <div className="empty-subtitle">
              {emptySubtitle || (
                activeSection === 'customers'
                  ? 'Imported contacts and SMS threads will appear in this panel.'
                  : activeSection === 'internal'
                    ? 'Direct teammate chats will appear here once opened.'
                    : 'Team channels will appear here when available.'
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default ContactsList;
