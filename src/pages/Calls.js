import { calls } from '../data/mockData';

function Calls() {
  return (
    <div style={{ display: 'grid', gap: '24px' }}>
      <div>
        <h1 className="page-title">Calls</h1>
        <div className="page-subtitle">
          Monitor call quality, direction, and outcomes across your teams.
        </div>
      </div>

      <div className="section-card">
        <div className="section-header">
          <h3 style={{ margin: 0 }}>Call Logs</h3>
          <span className="tag">Today</span>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>Contact</th>
              <th>Number</th>
              <th>Duration</th>
              <th>Direction</th>
              <th>Status</th>
              <th>Time</th>
            </tr>
          </thead>
          <tbody>
            {calls.map((call) => (
              <tr key={call.id}>
                <td>{call.contact}</td>
                <td>{call.number}</td>
                <td>{call.duration}</td>
                <td>{call.direction}</td>
                <td>{call.status}</td>
                <td>{call.time}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default Calls;
