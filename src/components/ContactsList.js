import { Users, X } from 'lucide-react';
import BASE_URL from '../config/api';
import { formatAvailabilityStatus, resolveEffectiveAvailabilityStatus } from '../utils/presence';

const normalize = (num) => num?.replace(/\D/g, '').slice(-10);

function ContactsList({
  list,
  activeId,
  activeContactId = null,
  onSelect,
  activeSection = 'customers',
  showUnreadOnly = false,
  emptyTitle = 'No conversations here yet',
  emptySubtitle = '',
  hideHeader = false,
  listVariant = 'default',
}) {
  const isSmsList = listVariant === 'sms';
  const isSmsGroupThreadList = listVariant === 'sms-group-threads';
  const isInternalChatList = listVariant === 'internal-chat';
  const isInternalTeamsList = listVariant === 'internal-teams';

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
      if (isInternalTeamsList) return '';

      const memberCount = item.participants?.length || 0;
      return memberCount > 0
        ? `${memberCount} member${memberCount === 1 ? '' : 's'}`
        : (item.role || 'Team channel');
    }

    if (item.conversationType === 'internal_dm') {
      return isInternalChatList ? '' : (item.role || 'Direct message');
    }

    if (isSmsList || isSmsGroupThreadList) {
      return '';
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

  const getAvatarLabel = (label = '') => {
    return String(label || '').trim().charAt(0).toUpperCase() || '?';
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
      const hasUnreadMention = item.conversationType === 'team' && Number(item.unreadMentionCount || 0) > 0;
      const displayName = getDisplayName(item);
      const secondaryLine = getSecondaryLine(item, activePhone);
      const preview = isInternalTeamsList && item.conversationType === 'team' && item.lastMessage
        ? `${item.lastMessageSenderName || 'Teammate'}: ${item.lastMessage}`
        : (item.lastMessage || item.previewFallback || 'No messages yet');
      const timestamp = formatTimestamp(item.lastMessageAt || item.updatedAt);
      const effectiveAvailabilityStatus = resolveEffectiveAvailabilityStatus(item);
      const shouldHighlightOnlineName = (
        isInternalChatList
        && item.conversationType === 'internal_dm'
        && effectiveAvailabilityStatus === 'online'
      );

      return (
        <div
          key={conversationKey || index}
          className={`contact-card${isActive ? ' is-active' : ''}${hasUnread ? ' has-unread' : ''}${hasUnreadMention ? ' has-mention' : ''}${isSmsList && item.conversationType === 'customer' ? ' is-sms-card' : ''}${isSmsGroupThreadList && item.conversationType === 'customer' ? ' is-sms-group-thread-card' : ''}${isInternalChatList && item.conversationType === 'internal_dm' ? ' is-internal-chat-card' : ''}${isInternalTeamsList && item.conversationType === 'team' ? ' is-internal-teams-card' : ''}`}
          onClick={() => onSelect(item)}
        >
          {item._id && item.conversationType === 'customer' && !isSmsGroupThreadList && (
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
                    {isInternalChatList && item.conversationType === 'internal_dm' ? (
                      <span className="contact-avatar contact-avatar-internal" aria-hidden="true">
                        {getAvatarLabel(displayName)}
                      </span>
                    ) : isInternalTeamsList && item.conversationType === 'team' ? (
                      <span className="contact-avatar contact-avatar-team" aria-hidden="true">
                        <Users size={16} strokeWidth={2.1} />
                      </span>
                    ) : (
                      <span className={getIdentityClassName(item)} aria-hidden="true" />
                    )}
                    <div className={`contact-name${(isSmsList || isSmsGroupThreadList || isInternalTeamsList) && hasUnread ? ' is-unread' : ''}${shouldHighlightOnlineName ? ' contact-name--online' : ''}`}>
                      {displayName}
                    </div>
                    {isInternalChatList && item.conversationType === 'internal_dm' ? (
                      <span
                        className={`presence-dot contact-presence-dot is-${effectiveAvailabilityStatus}`}
                        title={formatAvailabilityStatus(effectiveAvailabilityStatus)}
                        aria-label={formatAvailabilityStatus(effectiveAvailabilityStatus)}
                      />
                    ) : null}
                  </div>
                  {timestamp ? (
                    <div className={`contact-time${hasUnread ? ' is-unread' : ''}`}>
                      {timestamp}
                    </div>
                  ) : null}
                </div>
                {secondaryLine && !isSmsList && !isInternalChatList && !isInternalTeamsList && (
                  <div className="contact-meta">
                    {secondaryLine}
                  </div>
                )}
              </div>
            </div>

            <div className="contact-row contact-row-bottom">
              <div className={`contact-preview${hasUnread ? ' is-unread' : ''}${hasUnreadMention ? ' is-mention' : ''}`}>
                {preview}
              </div>
              <div className="contact-indicators">
                {!isInternalChatList && !isInternalTeamsList ? (
                  <span className={getBadgeClassName(item)}>
                    {getBadgeLabel(item)}
                  </span>
                ) : null}
                {hasUnreadMention ? (
                  <span className="mention-badge">
                    @{item.unreadMentionCount}
                  </span>
                ) : null}
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
        <div className={`contacts-wrapper${isSmsList ? ' is-sms-list' : ''}${isSmsGroupThreadList ? ' is-sms-group-thread-list' : ''}${isInternalChatList ? ' is-internal-chat-list' : ''}${isInternalTeamsList ? ' is-internal-teams-list' : ''}`}>
      {!hideHeader ? (
        <div className="contacts-header">
          <div>
            <h3>{getSectionTitle()}</h3>
          </div>
          <div className="contacts-header-meta">
            {showUnreadOnly ? <span className="tag">Unread</span> : null}
            <span>{list.length} total</span>
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
