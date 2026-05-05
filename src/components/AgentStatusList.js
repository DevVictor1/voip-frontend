import { useEffect, useMemo, useState } from 'react';
import socket from '../socket';
import { formatAgentLabel, getAgentMeta, getDepartmentLabel } from '../config/agents';
import { formatAvailabilityStatus, getAvailabilityStatusClass, resolveEffectiveAvailabilityStatus } from '../utils/presence';

function AgentStatusList({ agents = [] }) {
  const [statuses, setStatuses] = useState({});

  useEffect(() => {
    socket.emit('getAgentsStatus');

    const handleAll = (data) => {
      if (data && typeof data === 'object') {
        setStatuses(data);
      }
    };

    const handleOne = (data) => {
      const { userId, status } = data || {};
      if (!userId || !status) return;
      setStatuses((prev) => ({ ...prev, [userId]: status }));
    };

    const handlePresenceUpdate = (payload) => {
      const userId = String(payload?.userId || payload?.agentId || '').trim();
      if (!userId) return;

      setStatuses((prev) => ({
        ...prev,
        [userId]: String(
          payload?.effectiveAvailabilityStatus
          || payload?.effectiveStatus
          || payload?.availabilityStatus
          || payload?.presenceStatus
          || 'offline'
        ).trim().toLowerCase(),
      }));
    };

    socket.on('agentsStatus', handleAll);
    socket.on('agentStatus', handleOne);
    socket.on('userPresenceUpdated', handlePresenceUpdate);

    return () => {
      socket.off('agentsStatus', handleAll);
      socket.off('agentStatus', handleOne);
      socket.off('userPresenceUpdated', handlePresenceUpdate);
    };
  }, []);

  const agentDirectory = useMemo(
    () => (Array.isArray(agents) ? agents : []).reduce((acc, agent) => {
      if (agent?.agentId) {
        acc[agent.agentId] = agent;
      }
      return acc;
    }, {}),
    [agents]
  );

  const items = useMemo(
    () => {
      return Object.keys(agentDirectory)
        .sort((a, b) => a.localeCompare(b))
        .map((agentId) => {
          const liveAgent = agentDirectory[agentId];
          const fallbackMeta = getAgentMeta(agentId);

          return {
            agentId,
            status: statuses?.[agentId] || resolveEffectiveAvailabilityStatus(liveAgent) || 'offline',
            label: liveAgent?.name || formatAgentLabel(agentId),
            role: getDepartmentLabel(liveAgent?.department)
              || (liveAgent?.role === 'admin' ? 'Admin' : liveAgent?.role)
              || fallbackMeta?.role
              || '',
          };
        });
    },
    [agentDirectory, statuses]
  );

  return (
    <div className="section-card dashboard-section-card dashboard-agent-status-card">
      <div className="section-header dashboard-agent-status-header">
        <h3 className="dashboard-section-title">Agent Status</h3>
      </div>
      {items.length === 0 ? (
        <div className="text-muted">No agents found</div>
      ) : (
        <div className="dashboard-agent-status-scroll">
          {items.map((item) => (
            <div key={item.agentId} className="dashboard-agent-status-row">
              <span
                className={`dashboard-agent-status-dot ${getAvailabilityStatusClass(item.status)}`}
              />
              <span className="dashboard-agent-status-name">{item.label}</span>
              {item.role ? (
                <span className="agent-badge">{item.role}</span>
              ) : null}
              <span
                className={`dashboard-agent-status-badge ${getAvailabilityStatusClass(item.status)}`}
              >
                {formatAvailabilityStatus(item.status)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default AgentStatusList;
