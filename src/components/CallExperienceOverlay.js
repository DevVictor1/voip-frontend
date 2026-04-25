import { LoaderCircle, Mic, MicOff, PhoneOff, PanelBottomOpen } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

function CallExperienceOverlay({
  callState = 'idle',
  participant = null,
  isMuted = false,
  onToggleMute,
  onHangUp,
}) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [showKeypadHint, setShowKeypadHint] = useState(false);

  useEffect(() => {
    if (callState !== 'in-call') {
      setElapsedSeconds(0);
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      setElapsedSeconds((current) => current + 1);
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [callState]);

  useEffect(() => {
    if (!showKeypadHint) return undefined;

    const timeoutId = window.setTimeout(() => {
      setShowKeypadHint(false);
    }, 1800);

    return () => window.clearTimeout(timeoutId);
  }, [showKeypadHint]);

  const initials = useMemo(
    () => getInitials(participant?.name || participant?.number || 'Call'),
    [participant?.name, participant?.number]
  );

  const title = participant?.name || participant?.number || 'Unknown caller';
  const subtitle = participant?.name && participant?.number ? participant.number : participant?.label || '';
  const statusLabel = getOverlayStatus(callState);
  const isLiveCall = callState === 'in-call';

  return (
    <div className={`call-experience-overlay${isLiveCall ? ' is-live' : ''}`}>
      <div className="call-experience-card">
        <div className="call-experience-top">
          <div className={`call-experience-avatar${participant?.direction === 'incoming' ? ' is-incoming' : ''}`}>
            {initials}
          </div>

          <div className="call-experience-copy">
            <div className="call-experience-eyebrow">
              <span className={`call-experience-status-dot is-${callState === 'in-call' ? 'connected' : 'progress'}`} />
              <span>{statusLabel}</span>
              {callState === 'connecting' ? <LoaderCircle size={14} className="call-experience-spinner" /> : null}
            </div>
            <div className="call-experience-title">{title}</div>
            {subtitle ? <div className="call-experience-subtitle">{subtitle}</div> : null}
          </div>
        </div>

        {isLiveCall ? (
          <>
            <div className="call-experience-timer">{formatCallDuration(elapsedSeconds)}</div>

            <div className="call-experience-actions">
              <button
                type="button"
                className={`call-experience-action${isMuted ? ' is-active' : ''}`}
                onClick={onToggleMute}
              >
                {isMuted ? <MicOff size={17} /> : <Mic size={17} />}
                <span>{isMuted ? 'Muted' : 'Mute'}</span>
              </button>

              <button
                type="button"
                className="call-experience-action"
                onClick={() => setShowKeypadHint(true)}
              >
                <PanelBottomOpen size={17} />
                <span>Keypad</span>
              </button>

              <button
                type="button"
                className="call-experience-action is-danger"
                onClick={onHangUp}
              >
                <PhoneOff size={17} />
                <span>Hang up</span>
              </button>
            </div>

            {showKeypadHint ? (
              <div className="call-experience-hint">In-call keypad UI is reserved here for the next safe step.</div>
            ) : null}
          </>
        ) : (
          <div className="call-experience-footer">
            <button
              type="button"
              className="call-experience-cancel"
              onClick={onHangUp}
            >
              <PhoneOff size={16} />
              <span>Cancel</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function getOverlayStatus(callState) {
  switch (callState) {
    case 'ringing':
      return 'Ringing';
    case 'in-call':
      return 'Connected';
    case 'connecting':
    default:
      return 'Calling...';
  }
}

function getInitials(value) {
  const words = String(value || '')
    .split(/\s+/)
    .filter(Boolean);

  if (!words.length) return 'CL';

  return words
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join('');
}

function formatCallDuration(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export default CallExperienceOverlay;
