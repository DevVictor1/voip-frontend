export const AGENTS = {
  agent_1: { name: 'Tech Support - Slot 1', role: 'Tech Support', department: 'Tech Support', slot: 1 },
  agent_2: { name: 'Tech Support - Slot 2', role: 'Tech Support', department: 'Tech Support', slot: 2 },
  agent_3: { name: 'Customer Support - Slot 1', role: 'Customer Support', department: 'Customer Support', slot: 1 },
  agent_4: { name: 'Sales - Slot 1', role: 'Sales', department: 'Sales', slot: 1 },
  agent_5: { name: 'Sales - Slot 2', role: 'Sales', department: 'Sales', slot: 2 },
  web_user: { name: 'Web User', role: 'General' }
};

export const DEPARTMENT_LABELS = {
  tech: 'Tech Support',
  support: 'Customer Support',
  sales: 'Sales',
};

export const DEPARTMENT_OPTIONS = Object.entries(DEPARTMENT_LABELS).map(([value, label]) => ({
  value,
  label,
}));

export const AGENT_SLOT_GROUPS = Object.entries(AGENTS).reduce((groups, [agentId, meta]) => {
  if (agentId === 'web_user' || !meta.department || !meta.slot) {
    return groups;
  }

  if (!groups[meta.department]) {
    groups[meta.department] = [];
  }

  groups[meta.department].push({
    agentId,
    label: `${meta.department} - Slot ${meta.slot} (${agentId})`,
  });

  return groups;
}, {});

export const formatAgentLabel = (agentId) => {
  const entry = AGENTS[agentId];
  if (!entry) return agentId;
  return entry.name;
};

export const getAgentMeta = (agentId) => {
  const entry = AGENTS[agentId];
  if (!entry) return { name: agentId, role: '' };
  return entry;
};

export const getDepartmentLabel = (department) => {
  return DEPARTMENT_LABELS[department] || '';
};
