import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type {
  CommandCenterActionsDescriptor,
  CommandCenterResponse,
  CommandCenterTimelineEvent,
} from "./types";

interface CommandCenterActionsProps {
  actions: CommandCenterActionsDescriptor;
  queryKey: readonly unknown[];
}

function createOptimisticEvent(partial: Partial<CommandCenterTimelineEvent>): CommandCenterTimelineEvent {
  return {
    id: `optimistic-${Date.now()}`,
    occurredAt: new Date().toISOString(),
    category: "engagement",
    title: "Action pending",
    details: undefined,
    ...partial,
    optimistic: true,
  };
}

export function CommandCenterActions({ actions, queryKey }: CommandCenterActionsProps) {
  const queryClient = useQueryClient();
  const [creditAmount, setCreditAmount] = useState("50");
  const [creditNotes, setCreditNotes] = useState("");
  const [pickupAt, setPickupAt] = useState("");
  const [pickupNotes, setPickupNotes] = useState("Driver pickup window");
  const [campaignName, setCampaignName] = useState("Ramadan SMS Blast");
  const [campaignSendAt, setCampaignSendAt] = useState("");

  const updateCachedState = (updater: (prev: CommandCenterResponse) => CommandCenterResponse) => {
    const prev = queryClient.getQueryData<CommandCenterResponse>(queryKey);
    if (!prev) return { previous: undefined } as const;
    const updated = updater(prev);
    queryClient.setQueryData(queryKey, updated);
    return { previous: prev } as const;
  };

  const creditMutation = useMutation({
    mutationFn: async ({ amount, notes }: { amount: number; notes: string }) => {
      await apiRequest(actions.issueCredit.method, actions.issueCredit.endpoint, {
        amount,
        paymentMethod: "credit",
        receivedBy: "Command Center",
        notes,
      });
    },
    onMutate: async ({ amount, notes }) => {
      const optimisticEvent = createOptimisticEvent({
        category: "payment",
        title: `Issued manual credit (${amount.toFixed(2)})`,
        details: notes || undefined,
      });
      const context = updateCachedState((prev) => ({
        ...prev,
        financial: {
          ...prev.financial,
          balanceDue: Math.max(prev.financial.balanceDue - amount, 0),
        },
        outreachTimeline: [optimisticEvent, ...prev.outreachTimeline],
        auditTrail: [optimisticEvent, ...prev.auditTrail],
      }));
      return { ...context, event: optimisticEvent };
    },
    onSuccess: () => {
      toast({ title: "Credit issued", description: "The customer's balance was updated." });
      setCreditNotes("");
      setCreditAmount("0");
    },
    onError: (error, _variables, context) => {
      toast({
        title: "Failed to issue credit",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
      if (context?.previous) {
        queryClient.setQueryData(queryKey, context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  const scheduleMutation = useMutation({
    mutationFn: async ({ nextContactAt, notes }: { nextContactAt: string; notes: string }) => {
      await apiRequest(actions.schedulePickup.method, actions.schedulePickup.endpoint, {
        nextContactAt,
        recommendedAction: notes,
        recommendedChannel: "sms",
      });
    },
    onMutate: async ({ nextContactAt, notes }) => {
      const optimisticEvent = createOptimisticEvent({
        category: "engagement",
        title: "Pickup scheduled",
        details: `${notes} • ${new Date(nextContactAt).toLocaleString()}`,
      });
      const context = updateCachedState((prev) => ({
        ...prev,
        outreachTimeline: [optimisticEvent, ...prev.outreachTimeline],
        auditTrail: [optimisticEvent, ...prev.auditTrail],
      }));
      return { ...context, event: optimisticEvent };
    },
    onSuccess: () => {
      toast({ title: "Pickup scheduled" });
      setPickupNotes("Driver pickup window");
      setPickupAt("");
    },
    onError: (error, _variables, context) => {
      toast({
        title: "Failed to schedule pickup",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
      if (context?.previous) {
        queryClient.setQueryData(queryKey, context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  const chatMutation = useMutation({
    mutationFn: async () => {
      await apiRequest(actions.launchChat.method, actions.launchChat.endpoint, {
        lastOutcome: "Live chat launched",
        recommendedChannel: "chat",
      });
    },
    onMutate: async () => {
      const optimisticEvent = createOptimisticEvent({
        category: "engagement",
        title: "Chat session launched",
        details: "Opening internal chat workspace",
      });
      const context = updateCachedState((prev) => ({
        ...prev,
        outreachTimeline: [optimisticEvent, ...prev.outreachTimeline],
        auditTrail: [optimisticEvent, ...prev.auditTrail],
      }));
      return { ...context, event: optimisticEvent };
    },
    onSuccess: () => {
      toast({ title: "Chat launch logged" });
    },
    onError: (error, _variables, context) => {
      toast({
        title: "Failed to log chat launch",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
      if (context?.previous) {
        queryClient.setQueryData(queryKey, context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  const campaignMutation = useMutation({
    mutationFn: async ({ name, sendAt }: { name: string; sendAt?: string }) => {
      await apiRequest(actions.queueCampaign.method, actions.queueCampaign.endpoint, {
        recommendedAction: name,
        recommendedChannel: "sms",
        nextContactAt: sendAt || undefined,
      });
    },
    onMutate: async ({ name, sendAt }) => {
      const optimisticEvent = createOptimisticEvent({
        category: "notification",
        title: `Campaign queued: ${name}`,
        details: sendAt ? `Send at ${new Date(sendAt).toLocaleString()}` : undefined,
      });
      const context = updateCachedState((prev) => ({
        ...prev,
        outreachTimeline: [optimisticEvent, ...prev.outreachTimeline],
        auditTrail: [optimisticEvent, ...prev.auditTrail],
      }));
      return { ...context, event: optimisticEvent };
    },
    onSuccess: () => {
      toast({ title: "Campaign queued" });
      setCampaignName("Ramadan SMS Blast");
      setCampaignSendAt("");
    },
    onError: (error, _variables, context) => {
      toast({
        title: "Failed to queue campaign",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
      if (context?.previous) {
        queryClient.setQueryData(queryKey, context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  return (
    <Card data-cy="command-center-actions">
      <CardHeader>
        <CardTitle className="text-lg font-semibold text-slate-900">Inline actions</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-6 md:grid-cols-2">
        <form
          className="space-y-3 rounded-lg border border-slate-200 p-4 shadow-sm"
          data-cy="issue-credit-form"
          onSubmit={(event) => {
            event.preventDefault();
            const amount = Number.parseFloat(creditAmount);
            if (!Number.isFinite(amount) || amount <= 0) {
              toast({
                title: "Amount required",
                description: "Enter a positive amount to issue credit.",
                variant: "destructive",
              });
              return;
            }
            creditMutation.mutate({ amount, notes: creditNotes.trim() });
          }}
        >
          <h3 className="text-sm font-semibold text-slate-800">Issue credit</h3>
          <div className="space-y-1">
            <Label htmlFor="credit-amount">Amount</Label>
            <Input
              id="credit-amount"
              type="number"
              min="0"
              step="0.5"
              value={creditAmount}
              onChange={(event) => setCreditAmount(event.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="credit-notes">Memo</Label>
            <Textarea
              id="credit-notes"
              value={creditNotes}
              placeholder="Describe why credit is issued"
              onChange={(event) => setCreditNotes(event.target.value)}
            />
          </div>
          <Button type="submit" className="w-full" disabled={creditMutation.isLoading}>
            {creditMutation.isLoading ? "Issuing…" : "Issue credit"}
          </Button>
        </form>

        <form
          className="space-y-3 rounded-lg border border-slate-200 p-4 shadow-sm"
          data-cy="schedule-pickup-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (!pickupAt) {
              toast({
                title: "Pickup window required",
                description: "Select when the pickup should occur.",
                variant: "destructive",
              });
              return;
            }
            scheduleMutation.mutate({
              nextContactAt: new Date(pickupAt).toISOString(),
              notes: pickupNotes.trim() || "Pickup scheduled",
            });
          }}
        >
          <h3 className="text-sm font-semibold text-slate-800">Schedule pickup touchpoint</h3>
          <div className="space-y-1">
            <Label htmlFor="pickup-at">Pickup date &amp; time</Label>
            <Input
              id="pickup-at"
              type="datetime-local"
              value={pickupAt}
              onChange={(event) => setPickupAt(event.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="pickup-notes">Notes</Label>
            <Textarea
              id="pickup-notes"
              value={pickupNotes}
              onChange={(event) => setPickupNotes(event.target.value)}
            />
          </div>
          <Button type="submit" className="w-full" disabled={scheduleMutation.isLoading}>
            {scheduleMutation.isLoading ? "Logging…" : "Log schedule"}
          </Button>
        </form>

        <div className="space-y-3 rounded-lg border border-slate-200 p-4 shadow-sm" data-cy="launch-chat-card">
          <h3 className="text-sm font-semibold text-slate-800">Launch chat</h3>
          <p className="text-sm text-slate-600">
            Records that an operator initiated a live chat session with the customer and updates their engagement plan.
          </p>
          <Button
            type="button"
            className="w-full"
            onClick={() => chatMutation.mutate()}
            disabled={chatMutation.isLoading}
          >
            {chatMutation.isLoading ? "Recording…" : "Record chat launch"}
          </Button>
        </div>

        <form
          className="space-y-3 rounded-lg border border-slate-200 p-4 shadow-sm"
          data-cy="queue-campaign-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (!campaignName.trim()) {
              toast({
                title: "Campaign name required",
                description: "Provide a descriptive name for the outreach.",
                variant: "destructive",
              });
              return;
            }
            campaignMutation.mutate({
              name: campaignName.trim(),
              sendAt: campaignSendAt ? new Date(campaignSendAt).toISOString() : undefined,
            });
          }}
        >
          <h3 className="text-sm font-semibold text-slate-800">Queue campaign</h3>
          <div className="space-y-1">
            <Label htmlFor="campaign-name">Campaign name</Label>
            <Input
              id="campaign-name"
              value={campaignName}
              onChange={(event) => setCampaignName(event.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="campaign-send-at">Optional send time</Label>
            <Input
              id="campaign-send-at"
              type="datetime-local"
              value={campaignSendAt}
              onChange={(event) => setCampaignSendAt(event.target.value)}
            />
          </div>
          <Button type="submit" className="w-full" disabled={campaignMutation.isLoading}>
            {campaignMutation.isLoading ? "Queuing…" : "Queue campaign"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
