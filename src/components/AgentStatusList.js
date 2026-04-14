import { useEffect, useMemo, useState } from 'react';
import socket from '../socket';
import { formatAgentLabel, getAgentMeta } from '../config/agents';

function AgentStatusList() {
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

  const items = useMemo(
    () => Object.entries(statuses).sort(([a], [b]) => a.localeCompare(b)),
    [statuses]
  );

  return (
    <div style={card}>
      <div style={header}>Agent Status</div>
      {items.length === 0 ? (
        <div style={empty}>No agents found</div>
      ) : (
        <div style={list}>
          {items.map(([userId, status]) => (
            <div key={userId} style={row}>
              <span style={status === 'online' ? dotOnline : dotOffline} />
              <span style={name}>{formatAgentLabel(userId)}</span>
              {getAgentMeta(userId).role ? (
                <span className="agent-badge">{getAgentMeta(userId).role}</span>
              ) : null}
              <span style={status === 'online' ? badgeOnline : badgeOffline}>
                {status === 'online' ? 'Online' : 'Offline'}
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
