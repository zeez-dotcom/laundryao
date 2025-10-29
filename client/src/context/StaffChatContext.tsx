import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAuthContext } from '@/context/AuthContext';

type StaffChatContextValue = {
  unreadCount: number;
  reset: () => void;
};

const StaffChatContext = createContext<StaffChatContextValue | undefined>(undefined);

export function StaffChatProvider({ suppress, children }: { suppress?: boolean; children: React.ReactNode }) {
  const { user, branch } = useAuthContext();
  const [unreadCount, setUnreadCount] = useState(0);
  const wsRef = useRef<WebSocket | null>(null);
  const isStaff = user && (user.role === 'admin' || user.role === 'super_admin');

  useEffect(() => {
    if (!isStaff || !branch?.code) return;
    try {
      const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
      const ws = new WebSocket(`${proto}://${window.location.host}/ws/customer-chat?branchCode=${encodeURIComponent(branch.code)}`);
      wsRef.current = ws;
      ws.onmessage = (evt) => {
        if (suppress) return;
        try {
          const data = JSON.parse(evt.data);
          if (data?.eventType === 'chat:message' && data.sender === 'customer') {
            setUnreadCount((c) => c + 1);
          }
        } catch {
          /* ignore */
        }
      };
      ws.onclose = () => { wsRef.current = null; };
      return () => { ws.close(); wsRef.current = null; };
    } catch {
      /* ignore */
    }
  }, [isStaff, branch?.code, suppress]);

  const reset = () => setUnreadCount(0);
  const value = useMemo(() => ({ unreadCount, reset }), [unreadCount]);
  return <StaffChatContext.Provider value={value}>{children}</StaffChatContext.Provider>;
}

export function useStaffChat() {
  const ctx = useContext(StaffChatContext);
  if (!ctx) return { unreadCount: 0, reset: () => {} } as StaffChatContextValue;
  return ctx;
}

