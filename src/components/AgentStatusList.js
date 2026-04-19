import { useEffect, useMemo, useState } from 'react';
import socket from '../socket';
import { formatAgentLabel, getAgentMeta, getDepartmentLabel } from '../config/agents';

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

    socket.on('agentsStatus', handleAll);
    socket.on('agentStatus', handleOne);

    return () => {
      socket.off('agentsStatus', handleAll);
      socket.off('agentStatus', handleOne);
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
      const knownIds = new Set([
        ...Object.keys(statuses || {}),
        ...Object.keys(agentDirectory),
      ]);

      return Array.from(knownIds)
        .sort((a, b) => a.localeCompare(b))
        .map((agentId) => {
          const liveAgent = agentDirectory[agentId];
          const fallbackMeta = getAgentMeta(agentId);

          return {
            agentId,
            status: statuses?.[agentId] || 'offline',
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
    <div style={card}>
      <div style={header}>Agent Status</div>
      {items.length === 0 ? (
        <div style={empty}>No agents found</div>
      ) : (
        <div style={list}>
          {items.map((item) => (
            <div key={item.agentId} style={row}>
              <span style={item.status === 'online' ? dotOnline : dotOffline} />
              <span style={name}>{item.label}</span>
              {item.role ? (
                <span className="agent-badge">{item.role}</span>
              ) : null}
              <span style={item.status === 'online' ? badgeOnline : badgeOffline}>
                {item.status === 'online' ? 'Online' : 'Offline'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const card = {
  background: '#fff',
  borderRadius: '12px',
  border: '1px solid #e9edf2',
  padding: '16px',
  boxShadow: '0 8px 20px rgba(16, 24, 40, 0.06)'
};

const header = {
  fontWeight: 600,
  marginBottom: '12px'
};

const list = {
  display: 'flex',
  flexDirection: 'column',
  gap: '10px'
};

const row = {
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  padding: '8px 10px',
  borderRadius: '10px',
  background: '#f8fafc'
};

const dotOnline = {
  width: '10px',
  height: '10px',
  borderRadius: '50%',
  background: '#2e7d32',
  boxShadow: '0 0 0 4px rgba(46,125,50,0.12)'
};

const dotOffline = {
  width: '10px',
  height: '10px',
  borderRadius: '50%',
  background: '#9e9e9e',
  boxShadow: '0 0 0 4px rgba(158,158,158,0.12)'
};

const name = {
  fontWeight: 600,
  flex: 1
};

const badgeOnline = {
  fontSize: '12px',
  padding: '4px 8px',
  borderRadius: '999px',
  background: '#e8f5e9',
  color: '#2e7d32',
  fontWeight: 600
};

const badgeOffline = {
  fontSize: '12px',
  padding: '4px 8px',
  borderRadius: '999px',
  background: '#f2f2f2',
  color: '#616161',
  fontWeight: 600
};

const empty = {
  color: '#6b7280',
  fontSize: '14px'
};

export default AgentStatusList;
