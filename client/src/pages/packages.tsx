import { useState } from "react";
import PackageList from "@/components/package-list";
import { Button } from "@/components/ui/button";
import PackageChatbot from "@/components/PackageChatbot";

export default function PackagesPage() {
  const [showChatbot, setShowChatbot] = useState(false);
  return (
    <div className="p-4">
      <div className="flex justify-end mb-4">
        <Button onClick={() => setShowChatbot((prev) => !prev)}>
          Package Assistant
        </Button>
      </div>
      <PackageList />
      <PackageChatbot open={showChatbot} onClose={() => setShowChatbot(false)} />
    </div>
  );
}
