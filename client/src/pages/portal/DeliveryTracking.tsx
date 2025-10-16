import { useEffect, useMemo, useRef, useState } from "react";
import { useSearch } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, MessageSquare, RefreshCw, ShieldCheck, Phone } from "lucide-react";

import { apiRequest } from "@/lib/queryClient";
import { ETATimeline, type TimelineStage } from "@/components/portal/ETATimeline";
import { LiveMap } from "@/components/portal/LiveMap";
import { RescheduleDialog, type RescheduleWindow } from "@/components/portal/RescheduleDialog";

interface DeliveryMessage {
  id: string;
  deliveryId: string;
  orderId: string;
  senderType: "customer" | "agent" | "system";
  body: string;
  createdAt: string;
}

interface PortalDeliveryPayload {
  delivery: {
    id: string;
    orderId: string;
    status: string;
    scheduledDeliveryTime: string | null;
    driverId: string | null;
    fee: string | null;
  };
  order: {
    id: string;
    number: string | null;
    customerName: string | null;
    customerPhone: string | null;
    address: string | null;
    total: number | null;
  };
  tracking: {
    etaMinutes: number | null;
    distanceKm: number | null;
    driverLocation: { lat: number; lng: number; timestamp: string } | null;
    deliveryLocation: { lat: number; lng: number } | null;
  } | null;
  reschedulePolicy: {
    minimumNoticeMinutes: number;
    maxReschedules: number;
    remainingReschedules: number;
    windows: RescheduleWindow[];
  };
  compensationPolicy: {
    maxPercent: number;
    maxAmount: number | null;
    previouslyOffered: number;
  };
}

const statusStages = [
  { id: "pending", label: "Order received", description: "We&apos;re preparing your garments." },
  { id: "accepted", label: "Accepted", description: "Driver assignment confirmed." },
  { id: "driver_enroute", label: "Driver en route", description: "Driver is heading to you." },
  { id: "out_for_delivery", label: "Out for delivery", description: "Laundry is on the move." },
  { id: "completed", label: "Completed", description: "Delivery finished." },
];

type Step = "request" | "verify" | "portal";

function getInitialDeliveryId(search: string | null) {
  if (!search) return "";
  const params = new URLSearchParams(search);
  return params.get("deliveryId") ?? params.get("tracking") ?? "";
}

function formatStatusLabel(status?: string) {
  if (!status) return "Tracking";
  return status
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function DeliveryTrackingContent() {
  const search = useSearch();
  const queryClient = useQueryClient();

  const [deliveryId, setDeliveryId] = useState(() => getInitialDeliveryId(search));
  const [contact, setContact] = useState("");
  const [channel, setChannel] = useState<"sms" | "email">("sms");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<Step>(deliveryId ? "request" : "request");
  const [messages, setMessages] = useState<DeliveryMessage[]>([]);
  const [portalData, setPortalData] = useState<PortalDeliveryPayload | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [debugOtp, setDebugOtp] = useState<string | null>(null);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [isCompensating, setIsCompensating] = useState(false);
  const messageInputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    (window as any).__setDeliveryPortalOtp = setOtp;
    return () => {
      delete (window as any).__setDeliveryPortalOtp;
    };
  }, []);

  const deliveryQuery = useQuery({
    queryKey: ["portal-delivery", deliveryId],
    enabled: step === "portal" && Boolean(deliveryId),
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/portal/delivery/${deliveryId}`);
      return (await res.json()) as PortalDeliveryPayload;
    },
  });

  const messagesQuery = useQuery({
    queryKey: ["portal-delivery-messages", deliveryId],
    enabled: step === "portal" && Boolean(deliveryId),
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/portal/delivery/${deliveryId}/messages`);
      return (await res.json()) as { messages: DeliveryMessage[] };
    },
    onSuccess: (data) => {
      setMessages(data.messages);
    },
  });

  useEffect(() => {
    if (deliveryQuery.data) {
      setPortalData(deliveryQuery.data);
    }
  }, [deliveryQuery.data]);

  const rescheduleQuery = useQuery({
    queryKey: ["portal-delivery-reschedule", deliveryId],
    enabled: rescheduleOpen && step === "portal" && Boolean(deliveryId),
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/portal/delivery/${deliveryId}/reschedule-windows`);
      return (await res.json()) as {
        windows: RescheduleWindow[];
        minimumNoticeMinutes: number;
        remainingReschedules: number;
      };
    },
  });

  const requestOtpMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/portal/delivery-auth/request", {
        deliveryId,
        contact,
        channel,
      });
      return (await res.json()) as { message: string; debugOtp?: string };
    },
    onSuccess: (data) => {
      setAuthError(null);
      setStep("verify");
      setDebugOtp(data.debugOtp ?? null);
    },
    onError: (error: any) => {
      setAuthError(error.message ?? "Failed to send verification code");
    },
  });

  const verifyOtpMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/portal/delivery-auth/verify", {
        deliveryId,
        contact,
        channel,
        otp,
      });
      return (await res.json()) as { delivery: { id: string; orderId: string } };
    },
    onSuccess: (data) => {
      setAuthError(null);
      setStep("portal");
      setDeliveryId(data.delivery.id);
      queryClient.invalidateQueries({ queryKey: ["portal-delivery", data.delivery.id] }).catch(() => {});
      queryClient.invalidateQueries({ queryKey: ["portal-delivery-messages", data.delivery.id] }).catch(() => {});
    },
    onError: (error: any) => {
      setAuthError(error.message ?? "Invalid verification code");
    },
  });

  const sendMessageMutation = useMutation({
    mutationFn: async (payload: { body: string }) => {
      const res = await apiRequest("POST", `/api/portal/delivery/${deliveryId}/messages`, payload);
      return (await res.json()) as { message: DeliveryMessage };
    },
    onSuccess: (data) => {
      setMessages((prev) => {
        const next = [...prev];
        if (!next.find((msg) => msg.id === data.message.id)) {
          next.push(data.message);
        }
        return next.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      });
      if (messageInputRef.current) {
        messageInputRef.current.value = "";
      }
    },
  });

  const timelineStages = useMemo<TimelineStage[]>(() => {
    if (!portalData) return statusStages.map((stage) => ({ ...stage, completed: false, current: false }));
    const currentStatus = portalData.delivery.status;
    const currentIndex = statusStages.findIndex((stage) => stage.id === currentStatus);
    return statusStages.map((stage, index) => ({
      ...stage,
      completed: index < currentIndex,
      current: index === currentIndex,
    }));
  }, [portalData]);

  useEffect(() => {
    if (step !== "portal" || !portalData?.delivery.orderId) {
      return;
    }
    const orderId = portalData.delivery.orderId;
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${protocol}://${window.location.host}/ws/delivery-orders`);

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data as string) as any;
        if (data.orderId !== orderId) {
          return;
        }
        if (data.tracking) {
          setPortalData((prev) =>
            prev
              ? {
                  ...prev,
                  tracking: {
                    etaMinutes: data.tracking.etaMinutes,
                    distanceKm: data.tracking.distanceKm,
                    driverLocation: data.tracking.driverLocation,
                    deliveryLocation: data.tracking.deliveryLocation,
                  },
                }
              : prev,
          );
        }
        if (data.eventType === "status") {
          setPortalData((prev) =>
            prev
              ? {
                  ...prev,
                  delivery: {
                    ...prev.delivery,
                    status: data.deliveryStatus ?? prev.delivery.status,
                  },
                }
              : prev,
          );
        } else if (data.eventType === "message" && data.message) {
          setMessages((prev) => {
            const exists = prev.some((msg) => msg.id === data.message.id);
            if (exists) return prev;
            return [...prev, data.message].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
          });
        } else if (data.eventType === "reschedule" && data.reschedule) {
          setPortalData((prev) =>
            prev
              ? {
                  ...prev,
                  delivery: {
                    ...prev.delivery,
                    scheduledDeliveryTime: data.reschedule.scheduledDeliveryTime,
                  },
                }
              : prev,
          );
          queryClient.invalidateQueries({ queryKey: ["portal-delivery-reschedule", deliveryId] }).catch(() => {});
        } else if (data.eventType === "compensation" && data.compensation) {
          setPortalData((prev) =>
            prev
              ? {
                  ...prev,
                  compensationPolicy: {
                    ...prev.compensationPolicy,
                    previouslyOffered:
                      (prev.compensationPolicy.previouslyOffered ?? 0) + (data.compensation.amount ?? 0),
                  },
                }
              : prev,
          );
        }
      } catch {
        // ignore malformed payloads
      }
    };

    return () => {
      ws.close();
    };
  }, [portalData?.delivery.orderId, queryClient, step, deliveryId]);

  const handleSendMessage = () => {
    const body = messageInputRef.current?.value.trim();
    if (!body) return;
    sendMessageMutation.mutate({ body });
  };

  const handleRescheduleSubmit = async (window: RescheduleWindow) => {
    await apiRequest(`POST`, `/api/portal/delivery/${deliveryId}/reschedule`, {
      windowStart: window.start,
      windowEnd: window.end,
    });
    setRescheduleOpen(false);
    await queryClient.invalidateQueries({ queryKey: ["portal-delivery", deliveryId] });
    await queryClient.invalidateQueries({ queryKey: ["portal-delivery-reschedule", deliveryId] });
  };

  const handleCompensation = async () => {
    if (!portalData) return;
    if (portalData.compensationPolicy.maxAmount == null) return;
    setIsCompensating(true);
    try {
      await apiRequest(`POST`, `/api/portal/delivery/${deliveryId}/compensation`, {
        amount: Math.min(5, portalData.compensationPolicy.maxAmount),
        currency: "USD",
        reason: "Delay beyond SLA",
      });
      await queryClient.invalidateQueries({ queryKey: ["portal-delivery", deliveryId] });
    } finally {
      setIsCompensating(false);
    }
  };

  if (step !== "portal") {
    return (
      <div className="min-h-screen bg-slate-50 py-10">
        <div className="mx-auto w-full max-w-lg px-4">
          <Card>
            <CardHeader>
              <CardTitle>Track your delivery</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground" htmlFor="delivery-id">
                  Delivery ID
                </label>
                <Input
                  id="delivery-id"
                  placeholder="Enter your delivery ID"
                  value={deliveryId}
                  onChange={(event) => setDeliveryId(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground" htmlFor="contact">
                  {channel === "sms" ? "Mobile number" : "Email"}
                </label>
                <Input
                  id="contact"
                  placeholder={channel === "sms" ? "+1 (555) 000-0000" : "you@example.com"}
                  value={contact}
                  onChange={(event) => setContact(event.target.value)}
                />
              </div>
              <div className="flex items-center space-x-2 text-xs text-muted-foreground">
                <Phone className="h-3.5 w-3.5" />
                <span>We&apos;ll send a one-time code to verify access.</span>
              </div>
              {authError ? <Alert variant="destructive"><AlertDescription>{authError}</AlertDescription></Alert> : null}
              {step === "request" ? (
                <Button
                  className="w-full"
                  disabled={!deliveryId || !contact || requestOtpMutation.isLoading}
                  onClick={() => requestOtpMutation.mutate()}
                >
                  {requestOtpMutation.isLoading ? "Sending…" : "Send verification code"}
                </Button>
              ) : null}
              {step === "verify" ? (
                <div className="space-y-4">
                  <div className="space-y-2 text-center">
                    <p className="text-sm font-medium text-foreground">Enter verification code</p>
                    {debugOtp ? (
                      <p className="text-xs text-muted-foreground">Debug code: {debugOtp}</p>
                    ) : null}
                  </div>
                  <InputOTP maxLength={6} value={otp} onChange={setOtp}>
                    <InputOTPGroup>
                      <InputOTPSlot index={0} />
                      <InputOTPSlot index={1} />
                      <InputOTPSlot index={2} />
                      <InputOTPSlot index={3} />
                      <InputOTPSlot index={4} />
                      <InputOTPSlot index={5} />
                    </InputOTPGroup>
                  </InputOTP>
                  <Button
                    className="w-full"
                    disabled={otp.length < 4 || verifyOtpMutation.isLoading}
                    onClick={() => verifyOtpMutation.mutate()}
                  >
                    {verifyOtpMutation.isLoading ? "Verifying…" : "Verify"}
                  </Button>
                  <Button
                    variant="ghost"
                    className="w-full"
                    disabled={requestOtpMutation.isLoading}
                    onClick={() => requestOtpMutation.mutate()}
                  >
                    Resend code
                  </Button>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const isLoadingPortal = deliveryQuery.isLoading || messagesQuery.isLoading || !portalData;

  return (
    <div className="min-h-screen bg-slate-50 py-10">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold text-foreground">Delivery tracking portal</h1>
          <p className="text-sm text-muted-foreground">
            Stay in sync with your driver, adjust your arrival window, and message our support team in real time.
          </p>
        </div>

        {isLoadingPortal ? (
          <div className="flex h-48 items-center justify-center rounded-xl border bg-white">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
            <div className="space-y-6">
              <Card>
                <CardHeader className="flex flex-row items-start justify-between">
                  <div>
                    <CardTitle className="text-xl">{portalData?.order.customerName ?? "Customer"}</CardTitle>
                    <div className="mt-1 flex items-center space-x-2 text-sm text-muted-foreground">
                      <span>Order #{portalData?.order.number ?? portalData?.delivery.orderId}</span>
                      <Separator orientation="vertical" className="h-4" />
                      <span>{portalData?.order.customerPhone ?? "No phone"}</span>
                    </div>
                  </div>
                  <Badge variant="secondary">{formatStatusLabel(portalData?.delivery.status)}</Badge>
                </CardHeader>
                <CardContent className="space-y-6">
                  <ETATimeline
                    stages={timelineStages}
                    etaMinutes={portalData?.tracking?.etaMinutes ?? null}
                    statusLabel={formatStatusLabel(portalData?.delivery.status)}
                  />
                  <LiveMap
                    driverLocation={portalData?.tracking?.driverLocation ?? null}
                    deliveryLocation={portalData?.tracking?.deliveryLocation ?? null}
                    distanceKm={portalData?.tracking?.distanceKm ?? null}
                    etaMinutes={portalData?.tracking?.etaMinutes ?? null}
                  />
                  <div className="flex flex-wrap gap-3">
                    <Button variant="outline" onClick={() => setRescheduleOpen(true)} disabled={!portalData}>
                      <RefreshCw className="mr-2 h-4 w-4" /> Adjust delivery
                    </Button>
                    <Button
                      variant="outline"
                      disabled={isCompensating || !portalData?.compensationPolicy.maxAmount}
                      onClick={handleCompensation}
                    >
                      <ShieldCheck className="mr-2 h-4 w-4" /> Request compensation
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card className="flex h-[32rem] flex-col">
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>Messages</span>
                  <Badge variant="outline" className="text-xs">
                    <MessageSquare className="mr-1 h-3 w-3" /> Live chat
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col space-y-3">
                <ScrollArea className="flex-1 rounded-md border bg-muted/40 p-3">
                  <div className="space-y-4">
                    {messages.map((message) => (
                      <div key={message.id} className="flex items-start space-x-3">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback>
                            {message.senderType === "customer" ? "You" : message.senderType === "agent" ? "AG" : "SYS"}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="flex items-center space-x-2">
                            <span className="text-sm font-medium text-foreground">
                              {message.senderType === "customer"
                                ? "You"
                                : message.senderType === "agent"
                                ? "Laundry team"
                                : "System"}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            </span>
                          </div>
                          <p className="mt-1 rounded-md bg-background p-2 text-sm shadow-sm">
                            {message.body}
                          </p>
                        </div>
                      </div>
                    ))}
                    {!messages.length ? (
                      <p className="text-center text-sm text-muted-foreground">No messages yet. Start the conversation!</p>
                    ) : null}
                  </div>
                </ScrollArea>
                <div className="space-y-2">
                  <Textarea ref={messageInputRef} placeholder="Ask a question about your delivery" rows={3} />
                  <div className="flex justify-end">
                    <Button onClick={handleSendMessage} disabled={sendMessageMutation.isLoading}>
                      {sendMessageMutation.isLoading ? "Sending…" : "Send"}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      <RescheduleDialog
        open={rescheduleOpen}
        onOpenChange={setRescheduleOpen}
        windows={rescheduleQuery.data?.windows ?? portalData?.reschedulePolicy.windows ?? []}
        submitting={false}
        onSubmit={handleRescheduleSubmit}
        policy={{
          minimumNoticeMinutes:
            rescheduleQuery.data?.minimumNoticeMinutes ?? portalData?.reschedulePolicy.minimumNoticeMinutes ?? 0,
          remainingReschedules:
            rescheduleQuery.data?.remainingReschedules ?? portalData?.reschedulePolicy.remainingReschedules ?? 0,
        }}
      />
    </div>
  );
}

export default function DeliveryTrackingPage() {
  return <DeliveryTrackingContent />;
}
