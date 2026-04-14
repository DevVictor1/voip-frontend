import Sidebar from '../components/Sidebar';
import DeviceStatusControl from '../components/DeviceStatusControl';

function MainLayout({
  children,
  userRole,
  onRoleChange,
  deviceStatus,
  callState,
  agentId,
  onRetryVoice,
}) {
  return (
    <div className="app-root">
      <div className="app-shell">
        <Sidebar userRole={userRole} onRoleChange={onRoleChange} />
        <main className="app-main">
          <div className="app-topbar">
            <div className="app-topbar-copy">
              <div className="app-topbar-title">Operations</div>
              <div className="app-topbar-subtitle">Shared voice status across the workspace</div>
            </div>

            <DeviceStatusControl
              deviceStatus={deviceStatus}
              callState={callState}
              agentId={agentId}
              onRetry={onRetryVoice}
            />
          </div>

          {children}
        </main>
      </div>
    </div>
  );
}

export default MainLayout;

