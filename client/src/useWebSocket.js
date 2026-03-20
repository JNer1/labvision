import { useRef, useEffect, useCallback, useState } from "react";

const WS_URL = "ws://localhost:8000/ws/predict";
const RECONNECT_DELAY_MS = 2000;

/**
 * Persistent WebSocket connection to the prediction endpoint.
 * Automatically reconnects on disconnect.
 *
 * Returns:
 *   sendFrame(dataUrl) — send a JPEG frame, returns false if not connected
 *   wsStatus          — 'connecting' | 'open' | 'closed'
 */
export function useWebSocket({ onMessage, enabled }) {
  const wsRef = useRef(null);
  const reconnectRef = useRef(null);
  const [wsStatus, setWsStatus] = useState("closed");

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    setWsStatus("connecting");
    const ws = new WebSocket(WS_URL);

    ws.onopen = () => {
      console.log("WebSocket connected.");
      setWsStatus("open");
      clearTimeout(reconnectRef.current);
    };

    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        onMessage(data);
      } catch (err) {
        console.error("WS parse error:", err);
      }
    };

    ws.onerror = (e) => {
      console.warn("WebSocket error:", e);
    };

    ws.onclose = () => {
      console.log("WebSocket closed. Reconnecting…");
      setWsStatus("closed");
      if (enabled) {
        reconnectRef.current = setTimeout(connect, RECONNECT_DELAY_MS);
      }
    };

    wsRef.current = ws;
  }, [onMessage, enabled]);

  // Connect when enabled, disconnect when not
  useEffect(() => {
    if (enabled) {
      connect();
    } else {
      clearTimeout(reconnectRef.current);
      wsRef.current?.close();
      wsRef.current = null;
      setWsStatus("closed");
    }

    return () => {
      clearTimeout(reconnectRef.current);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [enabled, connect]);

  const sendFrame = useCallback((dataUrl) => {
    if (wsRef.current?.readyState !== WebSocket.OPEN) return false;
    wsRef.current.send(dataUrl);
    return true;
  }, []);

  return { sendFrame, wsStatus };
}
