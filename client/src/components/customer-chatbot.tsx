import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Bot, Send, User } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "@/lib/i18n";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface CustomerChatbotProps {
  branchCode: string;
  open: boolean;
  onClose: () => void;
}

export function CustomerChatbot({ branchCode, open, onClose }: CustomerChatbotProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { toast } = useToast();
  const [show, setShow] = useState(open);
  const { t } = useTranslation();

  useEffect(() => {
    if (open) setShow(true);
  }, [open]);

  const handleAnimationEnd = () => {
    if (!open) setShow(false);
  };

  const sendMessage = async () => {
    if (!input.trim()) return;
    const userMessage: Message = { role: "user", content: input };
    setMessages((msgs) => [...msgs, userMessage]);
    setInput("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }

    try {
      const res = await fetch("/api/chatbot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMessage.content }),
      });
      const data = await res.json();
      if (typeof data.reply === "string") {
        setMessages((msgs) => [...msgs, { role: "assistant", content: data.reply }]);
      }
      if (data.order) {
        try {
          const orderRes = await fetch("/delivery/orders", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...data.order, branchCode }),
          });
          const orderData = await orderRes.json();
          if (orderRes.ok) {
            toast({
              title: t.customerChatbot.orderPlaced,
              description: orderData.orderNumber ? `#${orderData.orderNumber}` : undefined,
            });
          } else {
            toast({ title: t.customerChatbot.orderFailed, description: orderData.message, variant: "destructive" });
          }
        } catch (err: any) {
          toast({ title: t.customerChatbot.orderFailed, description: String(err), variant: "destructive" });
        }
      }
    } catch (err: any) {
      setMessages((msgs) => [
        ...msgs,
        { role: "assistant", content: t.customerChatbot.somethingWentWrong },
      ]);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void sendMessage();
  };

  if (!show) return null;

  return (
    <div
      onAnimationEnd={handleAnimationEnd}
      className={`fixed bottom-4 right-4 z-50 flex w-full max-w-md flex-col rounded-lg border bg-background shadow-lg transition-all sm:max-w-lg ${
        open
          ? "animate-in fade-in slide-in-from-bottom-2 zoom-in-95"
          : "animate-out fade-out slide-out-to-bottom-2 zoom-out-95"
      }`}
    >
      <div className="flex items-center justify-between p-3 border-b">
        <h4 className="font-semibold">{t.customerChatbot.title}</h4>
        <button type="button" onClick={onClose} className="text-sm">
          {t.customerChatbot.close}
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-[200px] max-h-[60vh] custom-scrollbar">
        {messages.map((m, i) => (
          <div
            key={i}
            className={`flex items-start gap-2 ${m.role === "user" ? "justify-end" : "justify-start"}`}
          >
            {m.role === "assistant" && (
              <Avatar className="h-6 w-6">
                <AvatarFallback>
                  <Bot className="h-3 w-3" />
                </AvatarFallback>
              </Avatar>
            )}
            <div
              className={`rounded-lg px-3 py-2 text-sm ${
                m.role === "user" ? "bg-muted" : "bg-primary/10"
              }`}
            >
              {m.content}
            </div>
            {m.role === "user" && (
              <Avatar className="h-6 w-6">
                <AvatarFallback>
                  <User className="h-3 w-3" />
                </AvatarFallback>
              </Avatar>
            )}
          </div>
        ))}
      </div>
      <form onSubmit={handleSubmit} className="flex items-end gap-2 p-3 border-t">
        <Textarea
          ref={textareaRef}
          className="flex-1 min-h-[40px] resize-none text-sm"
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            e.target.style.height = "auto";
            e.target.style.height = `${e.target.scrollHeight}px`;
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void sendMessage();
            }
          }}
          placeholder={t.customerChatbot.typeMessage}
        />
        <Button type="submit" size="icon">
          <Send className="h-4 w-4" />
          <span className="sr-only">{t.customerChatbot.send}</span>
        </Button>
      </form>
    </div>
  );
}

