import { io } from "socket.io-client";
import { apiOrigin } from "../config/api";

export const realtime = io(apiOrigin, {
  transports: ["websocket", "polling"],
  reconnection: true,
  reconnectionDelay: 500
});
