import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type Mapping = { id?: string; key: string; account: string; type?: string };

export default function GlMappingsManager() {
  const [rows, setRows] = useState<Mapping[]>([]);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch('/api/accounting/gl-mappings', { credentials: 'include' });
      if (res.ok) {
        const json = await res.json();
        setRows(Array.isArray(json) ? json : []);
      }
    } finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, []);

  function addRow() {
    setRows((r) => [{ key: '', account: '', type: 'expense' }, ...r]);
  }

  async function save() {
    const mappings = rows.filter(r => r.key && r.account).map(({ key, account, type }) => ({ key, account, type: type || 'expense' }));
    await fetch('/api/accounting/gl-mappings', { method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mappings }) });
    await load();
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>GL Mappings (Expense Categories)</CardTitle>
          <div className="flex gap-2">
            <Button variant="outline" onClick={addRow}>Add</Button>
            <Button onClick={save} disabled={loading}>Save</Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto border rounded">
          <table className="min-w-full text-sm">
            <thead className="bg-[var(--surface-muted)]">
              <tr>
                <th className="text-left p-2">Expense Category</th>
                <th className="text-left p-2">GL Account</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td className="p-2" colSpan={2}>No mappings. Add your first mapping.</td></tr>
              ) : rows.map((r, idx) => (
                <tr key={r.id || idx} className="border-t">
                  <td className="p-2"><Input value={r.key} onChange={(e) => {
                    const v = e.target.value; setRows((xs) => xs.map((x, i) => i === idx ? { ...x, key: v } : x));
                  }} placeholder="e.g., Rent, Wages" /></td>
                  <td className="p-2"><Input value={r.account} onChange={(e) => {
                    const v = e.target.value; setRows((xs) => xs.map((x, i) => i === idx ? { ...x, account: v } : x));
                  }} placeholder="e.g., 5100" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

