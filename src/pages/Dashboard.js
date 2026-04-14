import { useEffect, useMemo, useState } from 'react';
import { stats, calls } from '../data/mockData';
import AgentStatusList from '../components/AgentStatusList';
import AgentSelector from '../components/AgentSelector';
import { formatAgentLabel, getAgentMeta } from '../config/agents';
import BASE_URL from '../config/api';

function Dashboard({ agentId, agentStatus, onToggleAgentStatus, onAgentChange }) {
  const [statValues, setStatValues] = useState({
    activeConversations: 0,
    dailyCallMinutes: 0,
    smsDelivered: 0,
    missedCalls: 0
  });
  const [lastUpdated, setLastUpdated] = useState(null);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch(`${BASE_URL}/api/dashboard/stats`);
        if (!res.ok) throw new Error('Stats request failed');
        const data = await res.json();
        setStatValues({
          activeConversations: Number(data.activeConversations) || 0,
          dailyCallMinutes: Number(data.dailyCallMinutes) || 0,
          smsDelivered: Number(data.smsDelivered) || 0,
          missedCalls: Number(data.missedCalls) || 0
        });
        setLastUpdated(new Date());
      } catch (err) {
        console.error('Dashboard stats error:', err);
        setStatValues({
          activeConversations: 0,
          dailyCallMinutes: 0,
          smsDelivered: 0,
          missedCalls: 0
        });
      }
    };

    fetchStats();
  }, []);

  const lastUpdatedLabel = useMemo(() => {
    if (!lastUpdated) return 'Updated recently';

    const diffMs = Date.now() - lastUpdated.getTime();
    const diffMinutes = Math.floor(diffMs / 60000);

    if (diffMinutes < 1) return 'Updated just now';
    if (diffMinutes === 1) return 'Updated 1 minute ago';
    return `Updated ${diffMinutes} minutes ago`;
  }, [lastUpdated]);

  const displayStats = useMemo(() => {
    const mapping = {
      'Active Conversations': statValues.activeConversations,
      'Daily Call Minutes': statValues.dailyCallMinutes,
      'SMS Delivered': statValues.smsDelivered,
      'Missed Calls': statValues.missedCalls
    };

    return stats.map((item) => {
      const value = mapping[item.label] ?? item.value;
      if (item.label === 'Daily Call Minutes') {
        const minutes = Number(value);
        const formatted =
          Number.isFinite(minutes)
            ? minutes % 1 === 0
              ? minutes.toLocaleString()
              : minutes.toFixed(1)
            : '0';
        return { ...item, value: formatted };
      }
      const numeric = Number(value);
      return {
        ...item,
        value: Number.isFinite(numeric) ? numeric.toLocaleString() : '0'
      };
    });
  }, [statValues]);

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
          <div className="dashboard-meta">
            Logged in as: {formatAgentLabel(agentId)}
            {getAgentMeta(agentId).role ? (
              <span className="agent-badge">{getAgentMeta(agentId).role}</span>
            ) : null}
          </div>
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
        {displayStats.map((item) => (
          <div key={item.label} className="stat-card">
            <div className="stat-label">{item.label}</div>
            <div className="stat-value">{item.value}</div>
            <div className="text-muted">{lastUpdatedLabel}</div>
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
