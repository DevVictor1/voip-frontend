import Sidebar from '../components/Sidebar';
import DeviceStatusControl from '../components/DeviceStatusControl';
import { formatAgentLabel, getAgentMeta } from '../config/agents';

function MainLayout({
  children,
  userRole,
  onRoleChange,
  roleLocked,
  authUser,
  onLogout,
  deviceStatus,
  callState,
  agentId,
  agentStatus,
  onRetryVoice,
  onToggleAgentStatus,
}) {
  const agentMeta = getAgentMeta(agentId);
  const roleLabel = userRole === 'agent' ? 'Agent' : 'Admin';

  return (
    <div className="app-root">
      <div className="app-shell">
        <Sidebar userRole={userRole} onRoleChange={onRoleChange} roleLocked={roleLocked} />
        <main className="app-main">
          <div className="app-topbar">
            <div className="app-topbar-copy">
              <div className="app-topbar-title">
                {authUser?.name ? `Signed in as: ${authUser.name}` : `Logged in as: ${formatAgentLabel(agentId)}`}
              </div>
              <div className="app-topbar-subtitle">
                {authUser?.email
                  ? `${authUser.email} - Active workspace identity: ${formatAgentLabel(agentId)}`
                  : 'Shared voice status and availability across the workspace'}
              </div>
              <div className="app-topbar-tags">
                {agentMeta.role ? (
                  <span className="app-topbar-tag">{agentMeta.role}</span>
                ) : null}
                <span className="app-topbar-tag app-topbar-tag-muted">{roleLabel}</span>
              </div>
            </div>

            <div className="app-topbar-actions">
              <DeviceStatusControl
                deviceStatus={deviceStatus}
                callState={callState}
                agentId={agentId}
                onRetry={onRetryVoice}
              />

              <button
                type="button"
                className={`availability-pill ${agentStatus === 'online' ? 'availability-pill-online' : 'availability-pill-offline'}`}
                onClick={onToggleAgentStatus}
              >
                <span className="availability-pill-label">Availability</span>
                <span>{agentStatus === 'online' ? 'Online' : 'Offline'}</span>
              </button>

              <button type="button" onClick={onLogout} style={logoutButtonStyle}>
                Logout
              </button>
            </div>
          </div>

          {children}
        </main>
      </div>
    </div>
  );
}

const logoutButtonStyle = {
  border: '1px solid rgba(15, 23, 42, 0.12)',
  background: '#ffffff',
  color: '#0f172a',
  borderRadius: '999px',
  padding: '10px 14px',
  fontSize: '13px',
  fontWeight: 600,
  cursor: 'pointer',
};

export default MainLayout;

