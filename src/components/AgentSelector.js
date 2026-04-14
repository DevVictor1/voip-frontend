function AgentSelector({ value, onChange }) {
  const agents = ['agent_1', 'agent_2', 'agent_3', 'web_user'];

  return (
    <label style={wrapper}>
      <span style={label}>Agent</span>
      <select
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        style={select}
      >
        {agents.map((agent) => (
          <option key={agent} value={agent}>
            {agent}
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
