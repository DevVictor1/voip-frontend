import { Device } from '@twilio/voice-sdk';
import BASE_URL from '../config/api';

let device;
let currentConnection = null;
let isInitializing = false;
let deviceStatus = 'offline';
let activeUserId = null;

const emitDeviceStatus = (status, error = null) => {
  deviceStatus = status;

  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('voiceDeviceStatus', {
        detail: { status, error },
      })
    );
  }
};

const emitCallState = (state, extra = {}) => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('voiceCallState', {
        detail: { state, ...extra },
      })
    );
  }
};

const destroyExistingDevice = () => {
  if (!device) return;

  try {
    device.destroy();
  } catch (err) {
    console.error('Device destroy error:', err);
  }

  device = null;
  activeUserId = null;

  if (typeof window !== 'undefined') {
    window.twilioDevice = null;
  }

  emitDeviceStatus('offline');
};

const attachConnectionListeners = (conn, direction = 'outgoing') => {
  if (!conn) return;

  emitCallState(direction === 'incoming' ? 'incoming' : 'connecting');

  conn.on('accept', () => {
    emitCallState('in-call');
  });

  conn.on('ringing', () => {
    emitCallState('ringing');
  });

  conn.on('cancel', () => {
    currentConnection = null;
    emitCallState('missed');
    window.dispatchEvent(new Event('callEnded'));
  });

  conn.on('reject', () => {
    currentConnection = null;
    emitCallState('failed');
    window.dispatchEvent(new Event('callEnded'));
  });

  conn.on('disconnect', () => {
    currentConnection = null;
    emitCallState('ended');
    window.dispatchEvent(new Event('callEnded'));
  });

  conn.on('error', (err) => {
    console.error('Call connection error:', err);
    emitCallState('failed', { error: err });
  });
};

export const initVoice = async (userId) => {
  try {
    const resolvedUserId = userId || 'web_user';
    console.log('Initializing device for:', resolvedUserId);

    if (isInitializing) {
      console.log('Device init already in progress');
      return;
    }

    if (device && activeUserId === resolvedUserId && deviceStatus === 'ready') {
      console.log('Device already ready, skipping init');
      emitDeviceStatus('ready');
      return;
    }

    isInitializing = true;
    emitDeviceStatus('initializing');

    if (device && activeUserId !== resolvedUserId) {
      destroyExistingDevice();
    }

    const qs = userId ? `?userId=${encodeURIComponent(userId)}` : '';
    const res = await fetch(`${BASE_URL}/api/voice/token${qs}`, {
      method: 'GET',
    });

    if (!res.ok) throw new Error('Token fetch failed');

    const data = await res.json();

    device = new Device(data.token, {
      logLevel: 1,
    });
    activeUserId = resolvedUserId;

    if (typeof window !== 'undefined') {
      device.__userId = resolvedUserId;
      window.twilioDevice = device;
    }

    device.on('registered', () => {
      console.log('Device ready');
      emitDeviceStatus('ready');
    });

    device.on('error', (err) => {
      console.error('Device error:', err);
      emitDeviceStatus('error', err);
    });

    device.on('unregistered', () => {
      emitDeviceStatus('offline');
    });

    device.on('destroyed', () => {
      emitDeviceStatus('offline');
    });

    device.on('incoming', (conn) => {
      console.log('Incoming call');

      currentConnection = conn;
      attachConnectionListeners(conn, 'incoming');

      window.dispatchEvent(
        new CustomEvent('incomingCallUI', { detail: conn })
      );
    });

    await device.register();
  } catch (err) {
    console.error('Voice init error:', err);
    emitDeviceStatus('error', err);
  } finally {
    isInitializing = false;
  }
};

export const startCall = async (phone) => {
  if (!device) {
    console.error('Device not ready');
    emitCallState('failed');
    return;
  }

  try {
    emitCallState('connecting');

    const conn = await device.connect({
      params: { To: phone },
    });

    currentConnection = conn;
    attachConnectionListeners(conn, 'outgoing');

    window.dispatchEvent(
      new CustomEvent('callAccepted', { detail: conn })
    );

    console.log('Outgoing call started');

    return conn;
  } catch (err) {
    console.error('Outgoing call error:', err);
    emitCallState('failed', { error: err });
  }
};

export const getConnection = () => currentConnection;
export const getDeviceStatus = () => deviceStatus;

export const muteCall = () => {
  currentConnection?.mute(true);
};

export const unmuteCall = () => {
  currentConnection?.mute(false);
};

export const disconnectCall = () => {
  currentConnection?.disconnect();
  currentConnection = null;
};
