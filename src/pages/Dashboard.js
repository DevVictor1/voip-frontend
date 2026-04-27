import { useCallback, useEffect, useMemo, useState } from 'react';
import { stats } from '../data/mockData';
import AgentStatusList from '../components/AgentStatusList';
import AgentSelector from '../components/AgentSelector';
import BASE_URL from '../config/api';
import { fetchAgentStatusRequest, fetchUsersRequest, getStoredAuthToken } from '../services/auth';
import socket from '../socket';
import { fetchCallLogs } from '../utils/callLogs';

function Dashboard({ agentId, onAgentChange, agentSelectionLocked = false }) {
  const [statValues, setStatValues] = useState({
    activeConversations: 0,
    dailyCallMinutes: 0,
    smsDelivered: 0,
    missedCalls: 0
  });
  const [lastUpdated, setLastUpdated] = useState(null);
  const [agents, setAgents] = useState([]);
  const [liveAgentState, setLiveAgentState] = useState([]);
  const [recentCalls, setRecentCalls] = useState([]);

  const refreshRecentCalls = useCallback(async () => {
    try {
      const normalized = await fetchCallLogs();
      setRecentCalls(normalized.slice(0, 5));
    } catch (error) {
      console.error('Dashboard recent calls error:', error);
      setRecentCalls([]);
    }
  }, []);

  useEffect(() => {
    const fetchAgents = async () => {
      try {
        const token = getStoredAuthToken();
        if (!token) {
          setAgents([]);
          return;
        }

        const payload = await fetchUsersRequest(token);
        const users = Array.isArray(payload?.users) ? payload.users : [];
        setAgents(users.filter((user) => user?.isActive !== false && user?.agentId));
      } catch (error) {
        console.error('Dashboard users error:', error);
        setAgents([]);
      }
    };

    fetchAgents();
  }, []);

  useEffect(() => {
    let isMounted = true;

    const fetchLiveAgentState = async () => {
      try {
        const token = getStoredAuthToken();
        if (!token) {
          if (isMounted) {
            setLiveAgentState([]);
          }
          return;
        }

        const payload = await fetchAgentStatusRequest(token);
        if (isMounted) {
          setLiveAgentState(Array.isArray(payload?.agentStatus) ? payload.agentStatus : []);
        }
      } catch (error) {
        console.error('Dashboard live agent state error:', error);
        if (isMounted) {
          setLiveAgentState([]);
        }
      }
    };

    fetchLiveAgentState();
    const intervalId = window.setInterval(fetchLiveAgentState, 15000);

    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
    };
  }, []);

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

  useEffect(() => {
    let cancelled = false;
    let refreshTimeoutId = null;

    const loadRecentCalls = async () => {
      if (cancelled) return;
      await refreshRecentCalls();
    };

    loadRecentCalls();

    const intervalId = window.setInterval(() => {
      if (!cancelled) {
        refreshRecentCalls();
      }
    }, 15000);

    const handleSocketCallStatus = () => {
      refreshRecentCalls();
    };

    const handleEndedRefresh = () => {
      refreshRecentCalls();
      window.clearTimeout(refreshTimeoutId);
      refreshTimeoutId = window.setTimeout(() => {
        refreshRecentCalls();
      }, 2000);
    };

    socket.on('callStatus', handleSocketCallStatus);
    socket.on('callEnded', handleEndedRefresh);
    window.addEventListener('callEnded', handleEndedRefresh);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      socket.off('callStatus', handleSocketCallStatus);
      socket.off('callEnded', handleEndedRefresh);
      window.removeEventListener('callEnded', handleEndedRefresh);
      window.clearTimeout(refreshTimeoutId);
    };
  }, [refreshRecentCalls]);

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
          <AgentSelector value={agentId} onChange={onAgentChange} disabled={agentSelectionLocked} agents={agents} />
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
        <AgentStatusList agents={agents} />
      </div>

      <div className="section-card">
        <div className="section-header">
          <h3 style={{ margin: 0 }}>Live Agent State</h3>
          <span className="tag">{liveAgentState.length} users</span>
        </div>
        {liveAgentState.length === 0 ? (
          <div className="text-muted">No live communication users found.</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Role</th>
                <th>Department</th>
                <th>Agent ID</th>
                <th>Active</th>
                <th>Presence</th>
                <th>Voice</th>
                <th>Stored Status</th>
                <th>Calls</th>
                <th>Assignable</th>
              </tr>
            </thead>
            <tbody>
              {liveAgentState.map((user) => (
                <tr key={user.id}>
                  <td>{user.name || 'Unknown'}</td>
                  <td>{user.role || 'user'}</td>
                  <td>{user.department || 'None'}</td>
                  <td>{user.agentId || 'None'}</td>
                  <td>{user.isActive ? 'Yes' : 'No'}</td>
                  <td>{user.connected ? `${formatPresenceStatus(user.presenceStatus)} online` : 'Offline'}</td>
                  <td>{user.voiceReady ? 'Ready' : 'Not Ready'}</td>
                  <td>{formatPresenceStatus(user.status)}</td>
                  <td>{`${user.activeCallCount || 0} / ${user.maxConcurrentCalls || 1}`}</td>
                  <td>{user.isAssignable ? 'Yes' : 'No'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="section-card">
        <div className="section-header">
          <h3 style={{ margin: 0 }}>Recent Calls</h3>
          <span className="tag">Realtime</span>
        </div>
        {recentCalls.length === 0 ? (
          <div className="text-muted">No recent calls yet</div>
        ) : (
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
              {recentCalls.map((call) => (
                <tr key={call.id}>
                  <td>{call.displayName}</td>
                  <td>{call.displayNumber}</td>
                  <td>{call.durationLabel}</td>
                  <td>{call.directionLabel}</td>
                  <td>{call.rawStatusLabel}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function formatPresenceStatus(status) {
  if (!status) return 'Offline';

  return String(status)
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export default Dashboard;
