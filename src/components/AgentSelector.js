import { AGENTS, formatAgentLabel, getAgentMeta, getDepartmentLabel } from '../config/agents';

const getAgentOptionLabel = (agent) => {
  const fallbackMeta = getAgentMeta(agent?.agentId);
  const name = agent?.name || fallbackMeta?.name || agent?.agentId || '';
  const secondary = getDepartmentLabel(agent?.department)
    || (agent?.role === 'admin' ? 'Admin' : '')
    || fallbackMeta?.role
    || '';

  return secondary ? `${name} [${secondary}]` : name;
};

function AgentSelector({ value, onChange, disabled = false, agents = [] }) {
  const dynamicAgents = Array.isArray(agents)
    ? agents.filter((agent) => Boolean(agent?.agentId))
    : [];
  const fallbackAgents = Object.keys(AGENTS).map((agentId) => ({ agentId }));
  const options = dynamicAgents.length > 0 ? dynamicAgents : fallbackAgents;
  const selectedAgent = options.find((agent) => agent.agentId === value) || null;
  const current = selectedAgent || getAgentMeta(value);
  const currentRole = getDepartmentLabel(selectedAgent?.department)
    || (selectedAgent?.role === 'admin' ? 'Admin' : selectedAgent?.role)
    || current.role;

  return (
    <label style={wrapper}>
      <span style={label}>Agent</span>
      <select
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        style={{
          ...select,
          ...(disabled ? selectDisabled : null),
        }}
        disabled={disabled}
        title={disabled ? 'Agent selection is locked' : 'Select agent'}
      >
        {options.map((agent) => (
          <option key={agent.agentId} value={agent.agentId}>
            {dynamicAgents.length > 0
              ? getAgentOptionLabel(agent)
              : `${formatAgentLabel(agent.agentId)} ${AGENTS[agent.agentId]?.role ? `[${AGENTS[agent.agentId].role}]` : ''}`}
          </option>
        ))}
      </select>
      {currentRole ? <span className="agent-badge">{currentRole}</span> : null}
    </label>
  );
}

const wrapper = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  background: '#fff',
  border: '1px solid #e5e7eb',
  borderRadius: '10px',
  padding: '6px 8px'
};

const label = {
  fontSize: '12px',
  color: '#6b7280',
  fontWeight: 600
};

const select = {
  border: 'none',
  background: 'transparent',
  fontSize: '12px',
  fontWeight: 600,
  cursor: 'pointer',
  outline: 'none'
};

const selectDisabled = {
  opacity: 0.55,
  cursor: 'not-allowed',
};

export default AgentSelector;
