import { useEffect, useMemo, useRef, useState } from "react";
import { useAuthContext } from "@/context/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

type ChatMessage = { sender: "staff" | "customer"; text: string; timestamp: string; customerId: string | null };

export default function StaffChatPage() {
  const { user, branch } = useAuthContext();
  const [connected, setConnected] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [threads, setThreads] = useState<Record<string, ChatMessage[]>>({});
  const [unread, setUnread] = useState<Record<string, number>>({});
  const [names, setNames] = useState<Record<string, string>>({});
  const wsRef = useRef<WebSocket | null>(null);

  const canUse = user && (user.role === "admin" || user.role === "super_admin");

  useEffect(() => {
    if (!canUse || !branch?.code) return;
    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${window.location.host}/ws/customer-chat?branchCode=${encodeURIComponent(branch.code)}`);
    wsRef.current = ws;
    ws.onopen = () => setConnected(true);
    ws.onclose = () => { setConnected(false); wsRef.current = null; };
    ws.onmessage = (evt) => {
      try {
        const data = JSON.parse(evt.data) as any;
        if (data?.eventType === "chat:message") {
          const cid = data.customerId ?? "__anon__";
          const msg: ChatMessage = { sender: data.sender === "staff" ? "staff" : "customer", text: data.text, timestamp: data.timestamp || new Date().toISOString(), customerId: data.customerId ?? null };
          setThreads((prev) => ({ ...prev, [cid]: [...(prev[cid] || []), msg] }));
          if (!selectedCustomer) setSelectedCustomer(cid);
          if (msg.sender === 'customer' && selectedCustomer !== cid) {
            setUnread((prev) => ({ ...prev, [cid]: (prev[cid] || 0) + 1 }));
          }
        } else if (data?.eventType === "chat:presence" && data.actorType === "customer") {
          const cid = data.customerId ?? "__anon__";
          setThreads((prev) => (cid in prev ? prev : { ...prev, [cid]: [] }));
          // Try to load display name for this customer
          if (cid && cid !== "__anon__") {
            void fetch(`/api/customers/${cid}`, { credentials: 'include' })
              .then((r) => (r.ok ? r.json() : null))
              .then((cust) => {
                if (cust && (cust.name || cust.phoneNumber)) {
                  setNames((prev) => ({ ...prev, [cid]: cust.name || cust.phoneNumber }));
                }
              })
              .catch(() => {});
          }
        }
      } catch {
        /* ignore */
      }
    };
    return () => { ws.close(); };
  }, [canUse, branch?.code, selectedCustomer]);

  const customers = useMemo(() => Object.keys(threads), [threads]);
  const currentMessages = selectedCustomer ? (threads[selectedCustomer] || []) : [];

  const send = () => {
    const value = text.trim();
    if (!value || !wsRef.current || !selectedCustomer) return;
    wsRef.current.send(JSON.stringify({ type: "chat", text: value, customerId: selectedCustomer === "__anon__" ? undefined : selectedCustomer }));
    setText("");
  };

  const exportTranscript = () => {
    if (!selectedCustomer) return;
    const rows = currentMessages.map((m) => ({
      timestamp: m.timestamp,
      sender: m.sender,
      text: m.text,
      customerId: m.customerId || '',
    }));
    const headers = Object.keys(rows[0] || { timestamp: '', sender: '', text: '', customerId: '' });
    const csv = [headers.join(','), ...rows.map((r) => headers.map((h) => JSON.stringify((r as any)[h] ?? '')).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chat-${selectedCustomer}-${new Date().toISOString()}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const selectThread = (cid: string) => {
    setSelectedCustomer(cid);
    setUnread((prev) => ({ ...prev, [cid]: 0 }));
    // Ensure we have a display name if missing
    if (cid && cid !== "__anon__" && !names[cid]) {
      void fetch(`/api/customers/${cid}`, { credentials: 'include' })
        .then((r) => (r.ok ? r.json() : null))
        .then((cust) => {
          if (cust && (cust.name || cust.phoneNumber)) {
            setNames((prev) => ({ ...prev, [cid]: cust.name || cust.phoneNumber }));
          }
        })
        .catch(() => {});
    }
  };

  if (!canUse) {
    return <div className="p-4 text-sm text-muted-foreground">Chat is available for branch admins.</div>;
  }

  return (
    <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
      <Card className="md:col-span-1">
        <CardHeader>
          <CardTitle>Customer threads</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="text-xs text-muted-foreground">Branch: {branch?.name} {connected ? <Badge className="ml-2">Connected</Badge> : <Badge variant="secondary" className="ml-2">Offline</Badge>}</div>
          {customers.length === 0 ? (
            <div className="text-sm text-muted-foreground">No active customers yet.</div>
          ) : (
            <ul className="space-y-1">
              {customers.map((cid) => (
                <li key={cid}>
                  <button
                    className={`w-full rounded border px-2 py-1 text-left ${selectedCustomer === cid ? 'bg-blue-50 border-blue-300' : ''}`}
                    onClick={() => selectThread(cid)}
                  >
                    {cid === "__anon__" ? "Anonymous" : (names[cid] || cid)}
                    <span className="ml-2 text-xs text-muted-foreground">{(threads[cid]?.length || 0)} msgs</span>
                    {!!unread[cid] && <Badge variant="default" className="ml-2">{unread[cid]}</Badge>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card className="md:col-span-2">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Conversation</CardTitle>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={exportTranscript} disabled={!selectedCustomer}>Export</Button>
          </div>
        </CardHeader>
        <CardContent className="flex h-[70vh] flex-col gap-2">
          <div className="flex-1 overflow-auto rounded border p-2">
            {selectedCustomer ? (
              currentMessages.length ? (
                <ul className="space-y-1">
                  {currentMessages.map((m, idx) => (
                    <li key={idx} className={m.sender === 'customer' ? 'text-left' : 'text-right'}>
                      <span className="inline-block rounded bg-gray-100 px-2 py-1 text-sm">{m.text}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="text-sm text-muted-foreground">No messages yet.</div>
              )
            ) : (
              <div className="text-sm text-muted-foreground">Select a thread to start chatting.</div>
            )}
          </div>
          <div className="flex gap-2">
            <Input
              placeholder={selectedCustomer ? "Type a message…" : "Select a customer to start"}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => (e.key === 'Enter' ? send() : undefined)}
              disabled={!selectedCustomer}
            />
            <Button onClick={send} disabled={!selectedCustomer}>Send</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
