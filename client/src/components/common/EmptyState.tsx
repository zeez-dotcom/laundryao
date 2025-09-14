import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  description?: string;
  className?: string;
  titleClassName?: string;
  descriptionClassName?: string;
}

export default function EmptyState({
  icon,
  title,
  description,
  className,
  titleClassName,
  descriptionClassName,
}: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center text-center py-8", className)}>
      {icon}
      <h3 className={cn("mt-2 text-lg font-medium text-gray-900", titleClassName)}>{title}</h3>
      {description && (
        <p className={cn("mt-1 text-sm text-gray-500", descriptionClassName)}>{description}</p>
      )}
    </div>
  );
}
