import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';

export function CashDrawerManager() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: current } = useQuery<any>({ queryKey: ['/api/cash-sessions/current'] });
  const { data: sessions = [] } = useQuery<any[]>({ queryKey: ['/api/cash-sessions'] });

  const [openingFloat, setOpeningFloat] = useState('0.00');
  const [countedCash, setCountedCash] = useState('0.00');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    setOpeningFloat('0.00');
    setCountedCash('0.00');
    setNotes('');
  }, [Boolean(current)]);

  async function openSession() {
    try {
      await apiRequest('POST', '/api/cash-sessions/open', { openingFloat: Number(openingFloat), notes });
      toast({ title: 'Cash session opened' });
      qc.invalidateQueries({ queryKey: ['/api/cash-sessions/current'] });
      qc.invalidateQueries({ queryKey: ['/api/cash-sessions'] });
    } catch (e: any) {
      toast({ title: 'Failed to open session', description: String(e?.message || e), variant: 'destructive' });
    }
  }

  async function closeSession() {
    try {
      if (!current?.id) return;
      await apiRequest('POST', `/api/cash-sessions/${current.id}/close`, { countedCash: Number(countedCash), notes });
      toast({ title: 'Cash session closed' });
      qc.invalidateQueries({ queryKey: ['/api/cash-sessions/current'] });
      qc.invalidateQueries({ queryKey: ['/api/cash-sessions'] });
    } catch (e: any) {
      toast({ title: 'Failed to close session', description: String(e?.message || e), variant: 'destructive' });
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Cash Drawer</CardTitle>
        </CardHeader>
        <CardContent>
          {current ? (
            <div className="flex flex-col gap-3">
              <div className="text-sm">Opened at: {new Date(current.openedAt).toLocaleString()}</div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Opening Float</label>
                  <Input value={openingFloat} onChange={(e) => setOpeningFloat(e.target.value)} disabled placeholder={String(current.openingFloat)} />
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Counted Cash</label>
                  <Input value={countedCash} onChange={(e) => setCountedCash(e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Notes</label>
                  <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Closing notes (optional)" />
                </div>
              </div>
              <div className="flex gap-2">
                <Button onClick={closeSession}>Close Session</Button>
                {current?.id && (
                  <Button variant="outline" onClick={async () => {
                    const res = await fetch(`/api/cash-sessions/${current.id}/z-report`, { credentials: 'include' });
                    if (!res.ok) return;
                    const blob = await res.blob();
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `z-report-${current.id.slice(0,8)}.csv`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                  }}>Export Z-Report (CSV)</Button>
                )}
                {current?.id && (
                  <Button variant="outline" onClick={async () => {
                    const res = await fetch(`/api/cash-sessions/${current.id}/z-report.xlsx`, { credentials: 'include' });
                    if (!res.ok) return;
                    const blob = await res.blob();
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `z-report-${current.id.slice(0,8)}.xlsx`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                  }}>Export Z-Report (Excel)</Button>
                )}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Opening Float</label>
                <Input value={openingFloat} onChange={(e) => setOpeningFloat(e.target.value)} />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Notes</label>
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Opening notes (optional)" />
              </div>
              <div className="self-end">
                <Button onClick={openSession}>Open Session</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent Sessions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-end mb-2">
            <Button variant="outline" size="sm" onClick={async () => {
              const d = new Date().toISOString().slice(0,10);
              const res = await fetch(`/api/cash-sessions/daily-close.xlsx?date=${d}`, { credentials: 'include' });
              if (!res.ok) return;
              const blob = await res.blob();
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `daily-close-${d}.xlsx`;
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              URL.revokeObjectURL(url);
            }}>Export Daily Close (Excel)</Button>
          </div>
          <div className="overflow-x-auto border rounded">
            <table className="min-w-full text-sm">
              <thead className="bg-[var(--surface-muted)]">
                <tr>
                  <th className="text-left p-2">Opened</th>
                  <th className="text-left p-2">Closed</th>
                  <th className="text-right p-2">Opening Float</th>
                  <th className="text-right p-2">Expected</th>
                  <th className="text-right p-2">Counted</th>
                  <th className="text-right p-2">Variance</th>
                </tr>
              </thead>
              <tbody>
                {sessions.length === 0 ? (
                  <tr><td className="p-2" colSpan={6}>No sessions</td></tr>
                ) : sessions.map((s) => (
                  <tr key={s.id} className="border-t">
                    <td className="p-2">{new Date(s.openedAt).toLocaleString()}</td>
                    <td className="p-2">{s.closedAt ? new Date(s.closedAt).toLocaleString() : '-'}</td>
                    <td className="p-2 text-right">{Number(s.openingFloat).toFixed(2)}</td>
                    <td className="p-2 text-right">{s.expectedCash != null ? Number(s.expectedCash).toFixed(2) : '-'}</td>
                    <td className="p-2 text-right">{s.countedCash != null ? Number(s.countedCash).toFixed(2) : '-'}</td>
                    <td className="p-2 text-right">{s.variance != null ? Number(s.variance).toFixed(2) : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default CashDrawerManager;
