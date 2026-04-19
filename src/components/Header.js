import { useState, useEffect, useRef } from 'react';
import { Phone } from 'lucide-react';
import { formatAgentLabel } from '../config/agents';

const normalize = (num) => num?.replace(/\D/g, '').slice(-10);

function Header({
  title,
  subtitle,
  status,
  chat,
  onSwitchNumber,
  onBack,
  showBack,
  onCall,
  callLabel,
  onAssignContact,
  assignableAgents = [],
}) {
  const [phoneDropdownOpen, setPhoneDropdownOpen] = useState(false);
  const [assignMenuOpen, setAssignMenuOpen] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const phoneDropdownRef = useRef(null);
  const assignMenuRef = useRef(null);

  const phones = chat?.phones || [];
  const activeNumber = chat?.phone;
  const isCustomerChat = !chat?.conversationType || chat?.conversationType === 'customer';
  const assignedAgentId = chat?.assignedTo;
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
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    setAssignMenuOpen(false);
    setPhoneDropdownOpen(false);
    setAssigning(false);
  }, [chat?._id, activeNumber, chat?.conversationId]);

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

  return (
    <div className="header">
      <div className="header-title">
        {showBack && (
          <button
            className="header-back"
            type="button"
            onClick={onBack}
          >
            Back
          </button>
        )}

        <div className="header-title-text">
          <div className="header-title-main">
            <h3>{title}</h3>
            {status && <span className="status-pill">{status}</span>}
          </div>

          {metaLine && <div className="header-meta">{metaLine}</div>}

          <div className="header-assignment-row">
            {contextPill}
          </div>

          {isCustomerChat && phones.length > 1 && (
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

              {phoneDropdownOpen && (
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
              )}
            </div>
          )}
        </div>
      </div>

      <div className="header-actions">
        {isCustomerChat && (
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

            {assignMenuOpen && (
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
            )}
          </div>
        )}

        <button className="button-icon" type="button">Notes</button>
        <button className="button-icon" type="button">Options</button>

        {isCustomerChat && (
          <button
            className="header-call-button"
            onClick={onCall}
            type="button"
          >
            <Phone size={16} />
            {callLabel || 'Call'}
          </button>
        )}
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
