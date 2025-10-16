import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useAuthContext } from "@/context/AuthContext";

interface AlertPreferencesPayload {
  userId: string;
  emailEnabled: boolean;
  smsEnabled: boolean;
  slackEnabled: boolean;
  emailAddress: string | null;
  phoneNumber: string | null;
  slackWebhook: string | null;
  quietHours: { start: string; end: string } | null;
}

export function AlertConfigurator() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuthContext();
  const { data, isLoading } = useQuery<AlertPreferencesPayload>({
    queryKey: ["alerts", "preferences"],
    queryFn: async () => {
      const res = await fetch("/api/alerts/preferences", { credentials: "include" });
      if (!res.ok) {
        throw new Error("Failed to load preferences");
      }
      return res.json();
    },
  });

  const [form, setForm] = useState<AlertPreferencesPayload | null>(null);

  useEffect(() => {
    if (data) {
      setForm(data);
    }
  }, [data]);

  const updateMutation = useMutation({
    mutationFn: async (payload: AlertPreferencesPayload) => {
      const res = await fetch("/api/alerts/preferences", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        throw new Error(await res.text());
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["alerts", "preferences"] });
      toast({ title: "Preferences updated", description: "Alert delivery preferences saved." });
    },
    onError: (error: any) => {
      toast({ title: "Failed to update preferences", description: error.message, variant: "destructive" });
    },
  });

  if (isLoading || !form) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Alert delivery preferences</CardTitle>
          <CardDescription>Control how alerts reach your devices.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Loading preferences…</p>
        </CardContent>
      </Card>
    );
  }

  const handleToggle = (key: "emailEnabled" | "smsEnabled" | "slackEnabled", value: boolean) => {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const handleInput = (key: "emailAddress" | "phoneNumber" | "slackWebhook", value: string) => {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const handleQuietHours = (key: "start" | "end", value: string) => {
    setForm((prev) =>
      prev
        ? {
            ...prev,
            quietHours:
              value === ""
                ? null
                : {
                    start: key === "start" ? value : prev.quietHours?.start ?? "22:00",
                    end: key === "end" ? value : prev.quietHours?.end ?? "07:00",
                  },
          }
        : prev,
    );
  };

  const handleSubmit = () => {
    if (!form) return;
    updateMutation.mutate(form);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Alert delivery preferences</CardTitle>
        <CardDescription>
          Choose how forecasts, anomalies, and KPIs trigger notifications tied to your profile.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <section className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2 rounded-md border p-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-medium">Email</h3>
                <p className="text-sm text-muted-foreground">Send alert digests to your inbox.</p>
              </div>
              <Switch checked={form.emailEnabled} onCheckedChange={(value) => handleToggle("emailEnabled", value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="alert-email">Email address</Label>
              <Input
                id="alert-email"
                type="email"
                value={form.emailAddress ?? user?.email ?? ""}
                onChange={(event) => handleInput("emailAddress", event.target.value)}
                placeholder="you@example.com"
              />
            </div>
          </div>

          <div className="space-y-2 rounded-md border p-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-medium">SMS</h3>
                <p className="text-sm text-muted-foreground">Escalate critical breaches via SMS.</p>
              </div>
              <Switch checked={form.smsEnabled} onCheckedChange={(value) => handleToggle("smsEnabled", value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="alert-phone">Phone number</Label>
              <Input
                id="alert-phone"
                value={form.phoneNumber ?? ""}
                onChange={(event) => handleInput("phoneNumber", event.target.value)}
                placeholder="+20 1X XXX XXXX"
              />
            </div>
          </div>

          <div className="space-y-2 rounded-md border p-4 md:col-span-2">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-medium">Slack</h3>
                <p className="text-sm text-muted-foreground">Stream alerts into incident channels.</p>
              </div>
              <Switch checked={form.slackEnabled} onCheckedChange={(value) => handleToggle("slackEnabled", value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="alert-slack">Incoming webhook URL</Label>
              <Input
                id="alert-slack"
                value={form.slackWebhook ?? ""}
                onChange={(event) => handleInput("slackWebhook", event.target.value)}
                placeholder="https://hooks.slack.com/..."
              />
            </div>
          </div>
        </section>

        <section className="rounded-md border p-4">
          <h3 className="font-medium">Quiet hours</h3>
          <p className="text-sm text-muted-foreground">
            Pause alerts overnight or during stand-down periods. Leave blank to disable.
          </p>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="alert-quiet-start">Quiet hours start</Label>
              <Input
                id="alert-quiet-start"
                type="time"
                value={form.quietHours?.start ?? ""}
                onChange={(event) => handleQuietHours("start", event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="alert-quiet-end">Quiet hours end</Label>
              <Input
                id="alert-quiet-end"
                type="time"
                value={form.quietHours?.end ?? ""}
                onChange={(event) => handleQuietHours("end", event.target.value)}
              />
            </div>
          </div>
        </section>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => form && setForm({ ...form, quietHours: null })}>
            Clear quiet hours
          </Button>
          <Button onClick={handleSubmit} disabled={updateMutation.isLoading}>
            {updateMutation.isLoading ? "Saving…" : "Save preferences"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
