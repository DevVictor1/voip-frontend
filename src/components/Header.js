import { useState, useEffect, useRef } from 'react';
import { Phone } from 'lucide-react';
import { formatAgentLabel } from '../config/agents';
import UserAvatar from './UserAvatar';

const normalize = (num) => num?.replace(/\D/g, '').slice(-10);
const ASSIGNMENT_STATUS_OPTIONS = [
  { value: 'open', label: 'Open' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'closed', label: 'Closed' },
];

const formatAssignmentStatus = (value) => {
  const matched = ASSIGNMENT_STATUS_OPTIONS.find((option) => option.value === value);
  return matched?.label || 'Open';
};

function Header({
  title,
  subtitle,
  status,
  chat,
  hasSavedContact,
  mode = 'default',
  onSwitchNumber,
  onBack,
  showBack,
  onCall,
  callLabel,
  showTeamDetailsAction = false,
  onOpenTeamDetails,
  onOpenTeamCalendar,
  onAssignContact,
  onUpdateAssignmentStatus,
  onAddUserToContacts,
  assignableAgents = [],
  onToggleSearch,
  isSearchOpen = false,
  onOpenInfoPanel,
  onOpenPinnedItems,
  onOpenSharedFiles,
  onOpenNotesPanel,
  isNotesOpen = false,
}) {
  const [phoneDropdownOpen, setPhoneDropdownOpen] = useState(false);
  const [assignMenuOpen, setAssignMenuOpen] = useState(false);
  const [optionsMenuOpen, setOptionsMenuOpen] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [assignmentStatus, setAssignmentStatus] = useState(chat?.assignmentStatus || 'open');
  const [updatingAssignmentStatus, setUpdatingAssignmentStatus] = useState(false);
  const phoneDropdownRef = useRef(null);
  const assignMenuRef = useRef(null);
  const optionsMenuRef = useRef(null);

  const phones = chat?.phones || [];
  const activeNumber = chat?.phone;
  const isCustomerChat = !chat?.conversationType || chat?.conversationType === 'customer';
  const isTextingGroupMode = mode === 'texting-group';
  const assignedAgentId = chat?.assignedTo;
  const hasPersistedContact = typeof hasSavedContact === 'boolean'
    ? hasSavedContact
    : Boolean(chat?._id);
  const assignedAgentName = chat?.isUnassigned
    ? 'Unassigned'
    : assignedAgentId
      ? formatAgentLabel(assignedAgentId)
      : 'Unassigned';

  const metaLine = subtitle || (
    isCustomerChat
      ? [chat?.phone, chat?.dba || chat?.mid].filter(Boolean).join(' / ')
      : chat?.conversationType === 'team'
        ? chat?.role || 'Team channel'
        : chat?.role || 'Internal chat'
  );

  const activeLabel =
    phones.find((phone) => normalize(phone.number) === normalize(activeNumber))?.label || 'PHONE';

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (phoneDropdownRef.current && !phoneDropdownRef.current.contains(e.target)) {
        setPhoneDropdownOpen(false);
      }

      if (assignMenuRef.current && !assignMenuRef.current.contains(e.target)) {
        setAssignMenuOpen(false);
      }

      if (optionsMenuRef.current && !optionsMenuRef.current.contains(e.target)) {
        setOptionsMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    setAssignMenuOpen(false);
    setPhoneDropdownOpen(false);
    setOptionsMenuOpen(false);
    setAssigning(false);
    setAssignmentStatus(chat?.assignmentStatus || 'open');
    setUpdatingAssignmentStatus(false);
  }, [chat?._id, activeNumber, chat?.conversationId, chat?.assignmentStatus]);

  const handleAssign = async (agentId) => {
    if (!chat?._id || assigning || !agentId) return;

    try {
      setAssigning(true);
      await onAssignContact(chat._id, agentId);
      setAssignMenuOpen(false);
    } catch (err) {
      console.error('Assign failed', err);
      alert('Failed to assign');
    } finally {
      setAssigning(false);
    }
  };

  const handleAssignmentStatusChange = async (e) => {
    const nextStatus = e.target.value;
    const previousStatus = assignmentStatus || 'open';

    if (!hasPersistedContact || updatingAssignmentStatus || !nextStatus || nextStatus === previousStatus) {
      return;
    }

    try {
      setUpdatingAssignmentStatus(true);
      setAssignmentStatus(nextStatus);
      await onUpdateAssignmentStatus?.(chat._id, nextStatus);
    } catch (err) {
      console.error('Assignment status update failed', err);
      setAssignmentStatus(previousStatus);
      alert('Failed to update status');
    } finally {
      setUpdatingAssignmentStatus(false);
    }
  };

  const contextPill = isCustomerChat
    ? (
      <span className={`header-assignment-pill${chat?.isUnassigned ? ' is-unassigned' : ''}`}>
        {chat?.isUnassigned ? 'Unassigned' : `Assigned to ${assignedAgentName}`}
      </span>
    )
    : (
      <span className={`header-assignment-pill is-conversation-type ${chat?.conversationType === 'team' ? 'is-team' : 'is-internal'}`}>
        {chat?.conversationType === 'team' ? 'Team channel' : 'Internal chat'}
      </span>
    );

  const canOpenInfoPanel = Boolean(onOpenInfoPanel && !isCustomerChat && !isTextingGroupMode);
  const canUseNotes = Boolean(!isCustomerChat && !isTextingGroupMode && onOpenNotesPanel);
  const canUseOptions = Boolean(!isCustomerChat && !isTextingGroupMode);
  const isTeamConversation = chat?.conversationType === 'team';
  const optionsItems = canUseOptions ? [
    {
      key: 'info',
      label: isTeamConversation ? 'View Team Information' : 'View User Information',
      onClick: onOpenInfoPanel,
      disabled: !onOpenInfoPanel,
    },
    {
      key: 'pinned',
      label: 'View Pinned Items',
      onClick: onOpenPinnedItems,
      disabled: !onOpenPinnedItems,
    },
    {
      key: 'files',
      label: 'View Shared Files',
      onClick: onOpenSharedFiles,
      disabled: !onOpenSharedFiles,
    },
    ...(isTeamConversation ? [{
      key: 'calendar',
      label: 'Group Calendar',
      onClick: onOpenTeamCalendar,
      disabled: !onOpenTeamCalendar,
    }] : []),
    {
      key: 'mute',
      label: isTeamConversation ? 'Mute notifications soon' : 'Mute conversation soon',
      onClick: null,
      disabled: true,
    },
  ] : [];

  const titleBlock = (
    <div className="header-title-text">
      <div className="header-title-main">
        <h3>{title}</h3>
        {status && <span className="status-pill">{status}</span>}
      </div>

      {metaLine && <div className="header-meta">{metaLine}</div>}

      {!isTextingGroupMode ? (
        <div className="header-assignment-row">
          {contextPill}
          {isCustomerChat && (
            <span
              className={`header-assignment-pill is-status status-${assignmentStatus || 'open'}`}
              title="Contact assignment status"
            >
              {formatAssignmentStatus(assignmentStatus)}
            </span>
          )}
        </div>
      ) : null}

      {isCustomerChat && !isTextingGroupMode ? (
        <div style={{ marginTop: '8px', display: 'inline-flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-muted, #6b7280)' }}>Status</span>
          <select
            value={assignmentStatus}
            onChange={handleAssignmentStatusChange}
            disabled={!hasPersistedContact || updatingAssignmentStatus}
            title={hasPersistedContact ? 'Update contact status' : 'Status is available after the contact exists in the inbox'}
            style={{
              borderRadius: '8px',
              border: '1px solid var(--border-subtle, #d8dde7)',
              background: !hasPersistedContact || updatingAssignmentStatus ? '#f3f5f9' : '#fff',
              color: '#1f2937',
              padding: '6px 10px',
              fontSize: '12px',
              minWidth: '120px',
              cursor: !hasPersistedContact || updatingAssignmentStatus ? 'not-allowed' : 'pointer',
              opacity: !hasPersistedContact || updatingAssignmentStatus ? 0.7 : 1,
            }}
          >
            {ASSIGNMENT_STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {updatingAssignmentStatus && option.value === assignmentStatus ? 'Saving...' : option.label}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {isCustomerChat && !isTextingGroupMode && phones.length > 1 ? (
        <div ref={phoneDropdownRef} style={{ position: 'relative', marginTop: '6px', display: 'inline-block' }}>
          <button
            type="button"
            onClick={() => setPhoneDropdownOpen((prev) => !prev)}
            style={{
              background: '#111',
              color: '#fff',
              padding: '4px 10px',
              borderRadius: '6px',
              fontSize: '12px',
              cursor: 'pointer',
              border: '1px solid #333',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            {activeLabel.toUpperCase()}
            <span
              style={{
                display: 'inline-block',
                transition: 'transform 0.2s ease',
                transform: phoneDropdownOpen ? 'rotate(180deg)' : 'rotate(0deg)'
              }}
            >
              ▼
            </span>
          </button>

          {phoneDropdownOpen ? (
            <div
              style={{
                position: 'absolute',
                top: '35px',
                left: 0,
                background: '#fff',
                borderRadius: '8px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                zIndex: 9999,
                minWidth: '200px',
                overflow: 'hidden',
                animation: 'fadeSlide 0.2s ease'
              }}
            >
              {phones.map((phone, index) => {
                const isActive =
                  normalize(phone.number) === normalize(activeNumber);

                return (
                  <div
                    key={index}
                    onClick={() => {
                      if (onSwitchNumber) {
                        onSwitchNumber(phone.number);
                      }
                      setPhoneDropdownOpen(false);
                    }}
                    style={{
                      padding: '10px',
                      cursor: 'pointer',
                      background: isActive ? '#f0f4ff' : '#fff',
                      color: '#000',
                      borderBottom: '1px solid #eee',
                      transition: 'background 0.2s'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = '#f5f7ff';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = isActive ? '#f0f4ff' : '#fff';
                    }}
                  >
                    <div style={{ fontWeight: 'bold', fontSize: '12px' }}>
                      {phone.label.toUpperCase()}
                    </div>
                    <div style={{ fontSize: '13px' }}>
                      {phone.number}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );

  return (
    <div className={`header${isTextingGroupMode ? ' is-texting-group-header' : ''}`}>
      <div className="header-title">
        {showBack ? (
          <button
            className="header-back"
            type="button"
            onClick={onBack}
          >
            Back
          </button>
        ) : null}

        {canOpenInfoPanel ? (
          <button
            type="button"
            className="header-identity-button"
            onClick={onOpenInfoPanel}
            aria-label={`Open ${chat?.conversationType === 'team' ? 'group' : 'user'} information`}
          >
            <UserAvatar
              name={title}
              avatarUrl={chat?.avatarUrl || ''}
              className={`header-identity-avatar${chat?.conversationType === 'team' ? ' is-team' : ''}`}
              initialsClassName="header-identity-avatar-initials"
              fallback={chat?.conversationType === 'team' ? <span className="header-team-avatar-fallback">#</span> : null}
            />
            {titleBlock}
          </button>
        ) : titleBlock}
      </div>

      <div className="header-actions">
        {isCustomerChat && !isTextingGroupMode && !hasPersistedContact && onAddUserToContacts ? (
          <button
            className="button-icon"
            type="button"
            onClick={() => onAddUserToContacts()}
          >
            Add user to contacts
          </button>
        ) : null}

        {!isTextingGroupMode && isCustomerChat ? (
          <div ref={assignMenuRef} className="header-assign-menu">
            <button
              className="button-icon header-assign-trigger"
              onClick={() => setAssignMenuOpen((prev) => !prev)}
              disabled={!chat?._id || assigning}
              type="button"
            >
              {assigning ? 'Assigning...' : chat?.isUnassigned ? 'Assign' : 'Reassign'}
              <span className={`header-assign-caret${assignMenuOpen ? ' is-open' : ''}`}>
                ▼
              </span>
            </button>

            {assignMenuOpen ? (
              <div className="header-assign-dropdown">
                {assignableAgents.map((agent) => {
                  const agentId = agent.agentId;
                  const isCurrentAgent = assignedAgentId === agentId && !chat?.isUnassigned;

                  return (
                    <button
                      key={agentId}
                      type="button"
                      className={`header-assign-option${isCurrentAgent ? ' is-active' : ''}`}
                      onClick={() => handleAssign(agentId)}
                      disabled={assigning}
                    >
                      <span className="header-assign-option-name">{agent.name || formatAgentLabel(agentId)}</span>
                      <span className="header-assign-option-role">{agent.role || agentId}</span>
                    </button>
                  );
                })}
                {assignableAgents.length === 0 ? (
                  <div className="header-assign-option-role" style={{ padding: '12px 14px' }}>
                    No active assignable users
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        {!isTextingGroupMode && showTeamDetailsAction ? (
          <>
            {onToggleSearch ? (
              <button
                className={`button-icon${isSearchOpen ? ' is-active' : ''}`}
                type="button"
                onClick={onToggleSearch}
                aria-pressed={isSearchOpen}
              >
                Search
              </button>
            ) : null}
            <button
              className="button-icon"
              type="button"
              onClick={onOpenTeamCalendar}
            >
              Calendar
            </button>
            <button
              className="button-icon"
              type="button"
              onClick={onOpenTeamDetails}
            >
              Group Details
            </button>
            {canUseNotes ? (
              <button
                className={`button-icon${isNotesOpen ? ' is-active' : ''}`}
                type="button"
                onClick={onOpenNotesPanel}
                aria-pressed={isNotesOpen}
              >
                Notes
              </button>
            ) : null}
            {canUseOptions ? (
              <div ref={optionsMenuRef} className="header-options-menu">
                <button
                  className={`button-icon${optionsMenuOpen ? ' is-active' : ''}`}
                  type="button"
                  onClick={() => setOptionsMenuOpen((prev) => !prev)}
                  aria-expanded={optionsMenuOpen}
                  aria-haspopup="menu"
                >
                  Options
                </button>
                {optionsMenuOpen ? (
                  <div className="header-options-dropdown" role="menu">
                    {optionsItems.map((item) => (
                      <button
                        key={item.key}
                        type="button"
                        className="header-options-item"
                        role="menuitem"
                        disabled={item.disabled}
                        onClick={() => {
                          if (item.disabled || !item.onClick) return;
                          setOptionsMenuOpen(false);
                          item.onClick();
                        }}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </>
        ) : !isTextingGroupMode ? (
          <>
            {onToggleSearch ? (
              <button
                className={`button-icon${isSearchOpen ? ' is-active' : ''}`}
                type="button"
                onClick={onToggleSearch}
                aria-pressed={isSearchOpen}
              >
                Search
              </button>
            ) : null}
            {canUseNotes ? (
              <button
                className={`button-icon${isNotesOpen ? ' is-active' : ''}`}
                type="button"
                onClick={onOpenNotesPanel}
                aria-pressed={isNotesOpen}
              >
                Notes
              </button>
            ) : null}
            {canUseOptions ? (
              <div ref={optionsMenuRef} className="header-options-menu">
                <button
                  className={`button-icon${optionsMenuOpen ? ' is-active' : ''}`}
                  type="button"
                  onClick={() => setOptionsMenuOpen((prev) => !prev)}
                  aria-expanded={optionsMenuOpen}
                  aria-haspopup="menu"
                >
                  Options
                </button>
                {optionsMenuOpen ? (
                  <div className="header-options-dropdown" role="menu">
                    {optionsItems.map((item) => (
                      <button
                        key={item.key}
                        type="button"
                        className="header-options-item"
                        role="menuitem"
                        disabled={item.disabled}
                        onClick={() => {
                          if (item.disabled || !item.onClick) return;
                          setOptionsMenuOpen(false);
                          item.onClick();
                        }}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </>
        ) : null}

        {!isTextingGroupMode && isCustomerChat ? (
          <button
            className="header-call-button"
            onClick={onCall}
            type="button"
          >
            <Phone size={16} />
            {callLabel || 'Call'}
          </button>
        ) : null}
      </div>

      <style>
        {`
          @keyframes fadeSlide {
            from {
              opacity: 0;
              transform: translateY(-5px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }
        `}
      </style>
    </div>
  );
}

export default Header;
