import { useEffect, useRef, useState, useMemo } from 'react';
import CallTable from '../components/CallTable';
import BASE_URL from '../config/api';
import socket from '../socket';

const formatDuration = (value) => {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return '0s';
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return remainder ? `${mins}m ${remainder}s` : `${mins}m`;
};

function CallLogs() {
  const [calls, setCalls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const intervalRef = useRef(null);
  const hasLoadedRef = useRef(false);

  const fetchCalls = async () => {
    try {
      const res = await fetch(`${BASE_URL}/api/calls/logs`, {
        method: "GET",
      });

      if (!res.ok) throw new Error("Failed request");

      const data = await res.json();
      const newData = Array.isArray(data) ? data : [];

      setCalls((prev) => {
        if (JSON.stringify(prev) === JSON.stringify(newData)) {
          return prev;
        }
        return newData;
      });

      setError('');
    } catch (err) {
      console.error('❌ Error fetching calls:', err);
      setError('Failed to load call logs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (hasLoadedRef.current) return;
    hasLoadedRef.current = true;

    fetchCalls();

    intervalRef.current = setInterval(fetchCalls, 5000);
    return () => clearInterval(intervalRef.current);
  }, []);

  useEffect(() => {
    socket.on('callStatus', (update) => {
      setCalls((prevCalls) => {
        let found = false;

        const updatedCalls = prevCalls.map((call) => {
          if (call.callSid === update.callSid) {
            found = true;
            return { ...call, status: update.status };
          }
          return call;
        });

        if (!found) fetchCalls();
        return updatedCalls;
      });
    });

    return () => socket.off('callStatus');
  }, []);

  const stats = useMemo(() => {
    const total = calls.length;

    const completedCalls = calls.filter(
      (call) => call.status === 'completed'
    );

    const completed = completedCalls.length;

    const active = calls.filter((call) =>
      ['initiated', 'ringing', 'in-progress'].includes(call.status)
    ).length;

    const completedWithDuration = completedCalls.filter((call) => {
      const seconds = Number(call.duration);
      return Number.isFinite(seconds) && seconds > 0;
    });

    const totalDuration = completedWithDuration.reduce(
      (sum, call) => sum + Number(call.duration),
      0
    );

    const avgDuration = completedWithDuration.length
      ? Math.round(totalDuration / completedWithDuration.length)
      : 0;

    return { total, completed, active, avgDuration };
  }, [calls]);

  return (
    <div className="call-logs-page">
      <div className="call-logs-header">
        <div>
          <h1 className="page-title">Call Logs</h1>
          <div className="page-subtitle">
            Review real-time call performance and outcomes across your team.
          </div>
        </div>

        <div className="call-logs-meta">
          <div className="call-logs-meta-title">Live feed</div>
          <div className="call-logs-meta-subtitle">
            Real-time updates enabled
          </div>
        </div>
      </div>

      <div className="call-stats">
        <div className="call-stat-card">
          <div className="call-stat-label">Total calls</div>
          <div className="call-stat-value">{stats.total}</div>
        </div>

        <div className="call-stat-card">
          <div className="call-stat-label">Completed</div>
          <div className="call-stat-value">{stats.completed}</div>
        </div>

        <div className="call-stat-card">
          <div className="call-stat-label">Active now</div>
          <div className="call-stat-value">{stats.active}</div>
        </div>

        <div className="call-stat-card">
          <div className="call-stat-label">Avg duration</div>
          <div className="call-stat-value">
            {formatDuration(stats.avgDuration)}
          </div>
        </div>
      </div>

      <CallTable
        calls={calls}
        loading={loading}
        error={error}
        onRetry={fetchCalls}
      />
    </div>
  );
}

export default CallLogs;