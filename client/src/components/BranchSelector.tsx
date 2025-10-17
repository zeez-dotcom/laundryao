import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuthContext } from "@/context/AuthContext";

type Branch = {
  id: string;
  code: string;
  name: string;
};

export function BranchSelector({ value, onChange }: { value?: string; onChange: (code: string) => void }) {
  const { isSuperAdmin } = useAuthContext();
  const { data: branches = [], isLoading, isError } = useQuery<Branch[]>({
    queryKey: ["/api/branches"],
    enabled: isSuperAdmin,
  });

  if (!isSuperAdmin) {
    return (
      <div className="flex items-center gap-2">
        <label htmlFor="branch-override" className="text-sm font-medium">Branch code</label>
        <input
          id="branch-override"
          name="branch-override"
          aria-label="Branch code override"
          className="border rounded px-2 py-1 text-sm"
          placeholder={value ? `Current: ${value}` : "Enter branch code"}
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    );
  }

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Loading branches…</div>;
  }
  if (isError) {
    return (
      <div className="flex items-center gap-2">
        <label htmlFor="branch-override" className="text-sm font-medium">Branch code</label>
        <input
          id="branch-override"
          name="branch-override"
          aria-label="Branch code override"
          className="border rounded px-2 py-1 text-sm"
          placeholder={value ? `Current: ${value}` : "Enter branch code"}
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    );
  }

  const byCode = useMemo(() => new Map(branches.map((b) => [b.code, b])), [branches]);
  const selected = value && byCode.get(value);

  return (
    <div className="flex items-center gap-2">
      <label htmlFor="branch-select" className="text-sm font-medium">Branch</label>
      <select
        id="branch-select"
        className="border rounded px-2 py-1 text-sm"
        value={selected?.code ?? ""}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">Select branch…</option>
        {branches.map((b) => (
          <option key={b.id} value={b.code}>{b.name} ({b.code})</option>
        ))}
      </select>
    </div>
  );
}

export default BranchSelector;

