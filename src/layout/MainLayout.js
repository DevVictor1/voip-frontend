import Sidebar from '../components/Sidebar';
import DeviceStatusControl from '../components/DeviceStatusControl';
import { formatAgentLabel, getAgentMeta } from '../config/agents';

function MainLayout({
  children,
  userRole,
  onRoleChange,
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
        <Sidebar userRole={userRole} onRoleChange={onRoleChange} />
        <main className="app-main">
          <div className="app-topbar">
            <div className="app-topbar-copy">
              <div className="app-topbar-title">Logged in as: {formatAgentLabel(agentId)}</div>
              <div className="app-topbar-subtitle">Shared voice status and availability across the workspace</div>
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
            </div>
          </div>

          {children}
        </main>
      </div>
    </div>
  );
}

export default MainLayout;

