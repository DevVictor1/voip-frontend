import { AGENTS, formatAgentLabel, getAgentMeta } from '../config/agents';

function AgentSelector({ value, onChange, disabled = false }) {
  const agents = Object.keys(AGENTS);
  const current = getAgentMeta(value);

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
        {agents.map((agentId) => (
          <option key={agentId} value={agentId}>
            {formatAgentLabel(agentId)} {AGENTS[agentId]?.role ? `[${AGENTS[agentId].role}]` : ''}
          </option>
        ))}
      </select>
      {current.role ? <span className="agent-badge">{current.role}</span> : null}
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
