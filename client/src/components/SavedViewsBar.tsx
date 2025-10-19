import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { addSavedView, deleteSavedView, loadSavedViews, SavedView, setDefaultSavedView } from "@/lib/savedViews";

type Props<T> = {
  pageId: string;
  current: T;
  onApply: (value: T) => void;
  getName?: (value: T) => string;
};

export function SavedViewsBar<T>({ pageId, current, onApply, getName }: Props<T>) {
  const [views, setViews] = useState<SavedView<T>[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");

  useEffect(() => {
    const v = loadSavedViews<T>(pageId);
    setViews(v);
    const def = v.find(x => x.isDefault) || v[0];
    if (def) {
      setSelectedId(def.id);
      onApply(def.value);
    }
  }, [pageId]);

  const selected = useMemo(() => views.find(v => v.id === selectedId), [views, selectedId]);

  return (
    <div className="flex items-center gap-2">
      <Select value={selectedId} onValueChange={(id) => { setSelectedId(id); const v = views.find(x => x.id === id); if (v) onApply(v.value); }}>
        <SelectTrigger className="w-56"><SelectValue placeholder="Views" /></SelectTrigger>
        <SelectContent>
          {views.length === 0 ? (
            <div className="px-2 py-1 text-sm text-muted-foreground">No saved views</div>
          ) : views.map(v => (
            <SelectItem key={v.id} value={v.id}>{v.name}{v.isDefault ? " •" : ""}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      {selected && (
        <Button variant="outline" size="sm" onClick={() => { setViews(deleteSavedView<T>(pageId, selected.id)); setSelectedId(""); }}>
          Delete
        </Button>
      )}
      {selected && !selected.isDefault && (
        <Button variant="outline" size="sm" onClick={() => setViews(setDefaultSavedView<T>(pageId, selected.id))}>
          Set Default
        </Button>
      )}
      {!saving ? (
        <Button size="sm" onClick={() => { setName(getName ? getName(current) : ""); setSaving(true); }}>
          Save View
        </Button>
      ) : (
        <div className="flex items-center gap-2">
          <Input className="h-8" placeholder="View name" value={name} onChange={(e) => setName(e.target.value)} />
          <Button size="sm" variant="outline" onClick={() => setSaving(false)}>Cancel</Button>
          <Button size="sm" disabled={!name.trim()} onClick={() => {
            const v = addSavedView<T>(pageId, name.trim(), current);
            setViews(v);
            setSaving(false);
          }}>Save</Button>
        </div>
      )}
    </div>
  );
}

export default SavedViewsBar;

