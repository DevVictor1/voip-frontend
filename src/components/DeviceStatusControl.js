import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, ChevronDown, LoaderCircle, PhoneOff } from 'lucide-react';

function DeviceStatusControl({
  deviceStatus,
  callState,
  agentId,
  onRetry,
}) {
  const [open, setOpen] = useState(false);
  const [isBrowserOnline, setIsBrowserOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine
  );
  const containerRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    const handleOutsideClick = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [open]);

  useEffect(() => {
    const handleOnline = () => setIsBrowserOnline(true);
    const handleOffline = () => setIsBrowserOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const statusConfig = useMemo(() => {
    switch (deviceStatus) {
      case 'ready':
        return {
          label: 'Ready',
          toneClass: 'voice-status-pill-ready',
          Icon: CheckCircle2,
        };
      case 'initializing':
        return {
          label: 'Connecting',
          toneClass: 'voice-status-pill-initializing',
          Icon: LoaderCircle,
          spin: true,
        };
      case 'error':
        return {
          label: 'Error',
          toneClass: 'voice-status-pill-error',
          Icon: AlertCircle,
        };
      default:
        return {
          label: 'Offline',
          toneClass: 'voice-status-pill-offline',
          Icon: PhoneOff,
        };
    }
  }, [deviceStatus]);

  const helpText =
    deviceStatus === 'ready'
      ? 'Voice device is ready for calls.'
      : deviceStatus === 'initializing'
        ? 'Voice device is connecting. This usually takes a few seconds.'
        : 'Voice device is offline. Retry connection if calls are not coming through.';

  const { Icon } = statusConfig;

  return (
    <div className="voice-status-control" ref={containerRef}>
      <button
        type="button"
        className={`voice-status-pill ${statusConfig.toneClass}`}
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <Icon
          size={14}
          className={statusConfig.spin ? 'voice-status-spin' : undefined}
        />
        <span>{statusConfig.label}</span>
        <ChevronDown size={14} className={open ? 'voice-status-chevron-open' : ''} />
      </button>

      {open ? (
        <div className="voice-status-panel" role="dialog" aria-label="Voice diagnostics">
          <div className="voice-status-panel-title">Voice Diagnostics</div>

          <div className="voice-status-grid">
            <div className="voice-status-label">Device status</div>
            <div className="voice-status-value">{statusConfig.label}</div>

            <div className="voice-status-label">Call state</div>
            <div className="voice-status-value">{formatCallState(callState)}</div>

            <div className="voice-status-label">Agent</div>
            <div className="voice-status-value">{agentId || 'web_user'}</div>

            <div className="voice-status-label">Browser</div>
            <div className="voice-status-value">
              {isBrowserOnline ? 'Online' : 'Offline'}
            </div>
          </div>

          <div className="voice-status-help">{helpText}</div>

          {(deviceStatus === 'offline' || deviceStatus === 'error') && onRetry ? (
            <button
              type="button"
              className="voice-status-retry"
              onClick={async () => {
                await onRetry();
              }}
            >
              Retry connection
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

const formatCallState = (state) => {
  switch (state) {
    case 'incoming':
      return 'Incoming';
    case 'ringing':
      return 'Ringing';
    case 'connecting':
      return 'Connecting';
    case 'in-call':
      return 'In call';
    case 'ended':
      return 'Ended';
    case 'failed':
      return 'Failed';
    case 'missed':
      return 'Missed';
    default:
      return 'Idle';
  }
};

export default DeviceStatusControl;
