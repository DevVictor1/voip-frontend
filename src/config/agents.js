export const AGENTS = {
  agent_1: { name: 'John Doe', role: 'Tech Support' },
  agent_2: { name: 'Sarah Lee', role: 'Customer Service' },
  agent_3: { name: 'Mike Chen', role: 'Sales' },
  web_user: { name: 'Web User', role: 'General' }
};

export const formatAgentLabel = (agentId) => {
  const entry = AGENTS[agentId];
  if (!entry) return agentId;
  return `${entry.name} (${entry.role})`;
};
