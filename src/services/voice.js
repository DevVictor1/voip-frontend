import { Device } from '@twilio/voice-sdk';
import BASE_URL from '../config/api';

let device;
let currentConnection = null;
let isInitializing = false;

export const initVoice = async (userId) => {
  try {
    const resolvedUserId = userId || 'web_user';
    console.log('Initializing device for:', resolvedUserId);

    if (isInitializing) {
      console.log('Device init already in progress');
      return;
    }

    if (typeof window !== 'undefined') {
      if (window.twilioDevice && window.twilioDevice.__userId === resolvedUserId) {
        console.log('Device already exists, skipping init');
        return;
      }

      if (window.twilioDevice) {
        window.twilioDevice.destroy();
        window.twilioDevice = null;
      }
    }

    isInitializing = true;

    const qs = userId ? `?userId=${encodeURIComponent(userId)}` : '';
    const res = await fetch(`${BASE_URL}/api/voice/token${qs}`, {
      method: "GET",
    });

    if (!res.ok) throw new Error("Token fetch failed");

    const data = await res.json();

    device = new Device(data.token, {
      logLevel: 1,
    });

    if (typeof window !== 'undefined') {
      device.__userId = resolvedUserId;
      window.twilioDevice = device;
    }

    device.on('registered', () => {
      console.log('âœ… Device ready');
    });

    device.on('error', (err) => {
      console.error('âŒ Device error:', err);
    });

    device.on('incoming', (conn) => {
      console.log('ðŸ“ž Incoming call');

      currentConnection = conn;

      // ðŸ”¥ SHOW INCOMING UI
      window.dispatchEvent(
        new CustomEvent('incomingCallUI', { detail: conn })
      );

      conn.on('disconnect', () => {
        currentConnection = null;
        window.dispatchEvent(new Event('callEnded'));
      });
    });

    await device.register();
  } catch (err) {
    console.error('âŒ Voice init error:', err);
  } finally {
    isInitializing = false;
  }
};

// ðŸ”¥ OUTGOING CALL (FIXED)
export const startCall = async (phone) => {
  if (!device) {
    console.error('âŒ Device not ready');
    return;
  }

  try {
    const conn = await device.connect({
      params: { To: phone },
    });

    currentConnection = conn;

    // ðŸ”¥ THIS IS THE MISSING PIECE (VERY IMPORTANT)
    window.dispatchEvent(
      new CustomEvent('callAccepted', { detail: conn })
    );

    conn.on('disconnect', () => {
      currentConnection = null;
      window.dispatchEvent(new Event('callEnded'));
    });

    console.log('ðŸ“ž Outgoing call started');

    return conn;

  } catch (err) {
    console.error('âŒ Outgoing call error:', err);
  }
};

export const getConnection = () => currentConnection;

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
