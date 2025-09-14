import { useMemo } from "react";
import { AlertCircle } from "lucide-react";
import EmptyState from "@/components/common/EmptyState";
import { useTranslation } from "@/lib/i18n";

export function useApiError(error: unknown) {
  const { t } = useTranslation();
  return useMemo(() => {
    if (!error) return null;
    const message = error instanceof Error ? error.message : String(error);
    return (
      <EmptyState
        icon={<AlertCircle className="w-12 h-12 text-red-500 mb-4" />}
        title={t.error}
        description={message}
      />
    );
  }, [error, t]);
}
