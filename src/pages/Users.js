import { users } from '../data/mockData';

function Users() {
  return (
    <div style={{ display: 'grid', gap: '24px' }}>
      <div>
        <h1 className="page-title">Users</h1>
        <div className="page-subtitle">
          Manage teammates, roles, and access across your VoIP workspace.
        </div>
      </div>

      <div className="user-grid">
        {users.map((user) => (
          <div key={user.id} className="user-card">
            <div className="avatar-stack">
              <div className="avatar-circle">
                {user.name
                  .split(' ')
                  .map((part) => part[0])
                  .join('')}
              </div>
              <div>
                <h4>{user.name}</h4>
                <div className="user-role">{user.role}</div>
              </div>
            </div>
            <div className="text-muted">{user.email}</div>
            <span className="tag">{user.status}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default Users;
