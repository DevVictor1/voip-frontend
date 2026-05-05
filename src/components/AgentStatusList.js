import { useMemo } from 'react';
import { formatAgentLabel, getAgentMeta, getDepartmentLabel } from '../config/agents';
import { formatAvailabilityStatus, getAvailabilityStatusClass, resolveEffectiveAvailabilityStatus } from '../utils/presence';

function AgentStatusList({ agents = [], presenceAgents = [] }) {
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
      const presenceDirectory = (Array.isArray(presenceAgents) ? presenceAgents : []).reduce((acc, agent) => {
        if (agent?.agentId) {
          acc[agent.agentId] = agent;
        }
        return acc;
      }, {});

      return Object.keys(agentDirectory)
        .sort((a, b) => a.localeCompare(b))
        .map((agentId) => {
          const baseAgent = agentDirectory[agentId];
          const liveAgent = presenceDirectory[agentId] || baseAgent;
          const fallbackMeta = getAgentMeta(agentId);
          const effectiveStatus = String(
            liveAgent?.effectiveAvailabilityStatus
            || liveAgent?.effectiveStatus
            || resolveEffectiveAvailabilityStatus(liveAgent)
            || 'offline'
          ).trim().toLowerCase();

          return {
            agentId,
            status: effectiveStatus,
            label: liveAgent?.name || formatAgentLabel(agentId),
            role: getDepartmentLabel(liveAgent?.department)
              || (liveAgent?.role === 'admin' ? 'Admin' : liveAgent?.role)
              || fallbackMeta?.role
              || '',
          };
        });
    },
    [agentDirectory, presenceAgents]
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
