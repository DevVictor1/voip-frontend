import { AGENTS, formatAgentLabel } from '../config/agents';

function AgentSelector({ value, onChange }) {
  const agents = Object.keys(AGENTS);

  return (
    <label style={wrapper}>
      <span style={label}>Agent</span>
      <select
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        style={select}
      >
        {agents.map((agentId) => (
          <option key={agentId} value={agentId}>
            {formatAgentLabel(agentId)}
          </option>
        ))}
      </select>
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

export default AgentSelector;
