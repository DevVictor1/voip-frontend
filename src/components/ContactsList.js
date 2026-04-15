import ImportContacts from './ImportContacts';
import { X } from 'lucide-react';
import BASE_URL from '../config/api';

const normalize = (num) => num?.replace(/\D/g, '').slice(-10);

function ContactsList({ list, activeId, onSelect }) {
  const getDisplayName = (item) => {
    if (item.conversationType === 'team') {
      return item.name || item.teamName || 'Team Chat';
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
      return item.role || 'Team channel';
    }

    if (item.conversationType === 'internal_dm') {
      return item.role || 'Internal chat';
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

  const handleDelete = async (id, e) => {
    e.stopPropagation();

    if (!window.confirm('Delete this contact?')) return;

    await fetch(`${BASE_URL}/api/contacts/${id}`, {
      method: 'DELETE',
    });

    window.location.reload();
  };

  return (
    <div className="contacts-wrapper">
      <div className="contacts-header">
        <h3>Inbox</h3>
        <span>{list.length} total</span>
      </div>

      <div className="contacts-import">
        <ImportContacts onImportSuccess={() => window.location.reload()} />
      </div>

      <div className="contacts-scroll">
        {list.map((item, index) => {
          const activePhone = getActivePhone(item);
          const conversationKey = item.key || `${item.conversationType || 'customer'}:${item.conversationId || item.phone}`;
          const isActive = activeId === conversationKey;
          const hasUnread = item.unread > 0;
          const displayName = getDisplayName(item);
          const secondaryLine = getSecondaryLine(item, activePhone);

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
                    <div className="contact-name">
                      {displayName}
                    </div>
                    {secondaryLine && (
                      <div className="contact-meta">
                        {secondaryLine}
                      </div>
                    )}
                  </div>

                  <div className="contact-indicators">
                    {hasUnread && (
                      <span className="unread-badge">{item.unread}</span>
                    )}
                    <span className={getBadgeClassName(item)}>
                      {getBadgeLabel(item)}
                    </span>
                  </div>
                </div>

                <div className={`contact-preview${hasUnread ? ' is-unread' : ''}`}>
                  {item.lastMessage || item.previewFallback || 'No messages yet'}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default ContactsList;
