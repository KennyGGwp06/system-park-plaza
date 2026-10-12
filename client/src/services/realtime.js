import { io } from "socket.io-client";
import { apiOrigin } from "../config/api";

// Solo websocket: con varias copias del servidor, el modo "polling" necesitaría que cada pedido vuelva a la
// misma copia. Si el websocket no conecta, las pantallas igual se actualizan con su sondeo de respaldo.
export const realtime = io(apiOrigin, {
  transports: ["websocket"],
  reconnection: true,
  reconnectionDelay: 500,
  reconnectionDelayMax: 10000
});
