import { Device } from '@twilio/voice-sdk';
import BASE_URL from '../config/api';

let device;
let currentConnection = null;

export const initVoice = async () => {
  try {
    const res = await fetch(`${BASE_URL}/api/voice/token`);
    const data = await res.json();

    device = new Device(data.token, {
      logLevel: 1,
    });

    device.on('registered', () => {
      console.log('✅ Device ready');
    });

    device.on('error', (err) => {
      console.error('❌ Device error:', err);
    });

    device.on('incoming', (conn) => {
      console.log('📞 Incoming call');

      currentConnection = conn;

      // 🔥 SHOW INCOMING UI
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
    console.error('❌ Voice init error:', err);
  }
};

// 🔥 OUTGOING CALL (FIXED)
export const startCall = async (phone) => {
  if (!device) {
    console.error('❌ Device not ready');
    return;
  }

  try {
    const conn = await device.connect({
      params: { To: phone },
    });

    currentConnection = conn;

    // 🔥 THIS IS THE MISSING PIECE (VERY IMPORTANT)
    window.dispatchEvent(
      new CustomEvent('callAccepted', { detail: conn })
    );

    conn.on('disconnect', () => {
      currentConnection = null;
      window.dispatchEvent(new Event('callEnded'));
    });

    console.log('📞 Outgoing call started');

    return conn;

  } catch (err) {
    console.error('❌ Outgoing call error:', err);
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