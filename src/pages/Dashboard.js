import { stats, calls } from '../data/mockData';
import AgentStatusList from '../components/AgentStatusList';
import AgentSelector from '../components/AgentSelector';

function Dashboard({ agentId, agentStatus, onToggleAgentStatus, onAgentChange }) {
  return (
    <div className="dashboard-page" style={{ display: 'grid', gap: '24px' }}>
      <div className="dashboard-header">
        <div>
          <h1 className="page-title">Command Center</h1>
          <div className="page-subtitle">
            Live performance snapshots across voice, messaging, and support queues.
          </div>
        </div>

        <div className="dashboard-controls">
          <div className="dashboard-meta">Logged in as: {agentId}</div>
          <AgentSelector value={agentId} onChange={onAgentChange} />
          <button
            className={`status-toggle ${agentStatus === 'online' ? 'is-online' : 'is-offline'}`}
            onClick={onToggleAgentStatus}
          >
            {agentStatus === 'online' ? 'Online' : 'Offline'}
          </button>
        </div>
      </div>

      <div className="stats-grid">
        {stats.map((item) => (
          <div key={item.label} className="stat-card">
            <div className="stat-label">{item.label}</div>
            <div className="stat-value">{item.value}</div>
            <div className="text-muted">Updated 2 minutes ago</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: '24px' }}>
        <AgentStatusList />
      </div>

      <div className="section-card">
        <div className="section-header">
          <h3 style={{ margin: 0 }}>Recent Calls</h3>
          <span className="tag">Realtime</span>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>Contact</th>
              <th>Number</th>
              <th>Duration</th>
              <th>Direction</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {calls.map((call) => (
              <tr key={call.id}>
                <td>{call.contact}</td>
                <td>{call.number}</td>
                <td>{call.duration}</td>
                <td>{call.direction}</td>
                <td>{call.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default Dashboard;
