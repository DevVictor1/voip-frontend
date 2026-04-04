import { io } from "socket.io-client";
import BASE_URL from "./config/api";

const socket = io(BASE_URL, {
  transports: ["websocket"],
  upgrade: false, // 🔥 prevents fallback to polling
});

export default socket;