import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const alertVariants = cva(
  "relative w-full rounded-lg border p-4 [&>svg~*]:pl-7 [&>svg+div]:translate-y-[-3px] [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 [&>svg]:text-foreground",
  {
    variants: {
      variant: {
        default: "bg-background text-foreground",
        destructive:
          "border-destructive/50 text-destructive dark:border-destructive [&>svg]:text-destructive",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

const Alert = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof alertVariants>
>(({ className, variant, ...props }, ref) => (
  <div
    ref={ref}
    role="alert"
    className={cn(alertVariants({ variant }), className)}
    {...props}
  />
))
Alert.displayName = "Alert"

const AlertTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h5
    ref={ref}
    className={cn("mb-1 font-medium leading-none tracking-tight", className)}
    {...props}
  />
))
AlertTitle.displayName = "AlertTitle"

const AlertDescription = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { copyable?: boolean }
>(({ className, children, copyable, ...props }, ref) => {
  const localRef = React.useRef<HTMLDivElement | null>(null)
  const contentRef = (node: HTMLDivElement) => {
    localRef.current = node
    if (typeof ref === 'function') ref(node as any)
    else if (ref) (ref as any).current = node
  }
  const isCopyable = copyable || (props as any)["data-copyable"] !== undefined
  const onCopy = async () => {
    const text = localRef.current?.innerText || ""
    try { await navigator.clipboard.writeText(text) } catch {}
  }
  return (
    <div
      ref={contentRef}
      className={cn("text-sm [&_p]:leading-relaxed select-text relative pr-10", className)}
      {...props}
    >
      {children}
      {isCopyable && (
        <button
          type="button"
          onClick={onCopy}
          className="absolute top-0 right-0 text-xs text-muted-foreground hover:text-foreground underline"
          aria-label="Copy error"
        >
          Copy
        </button>
      )}
    </div>
  )
})
AlertDescription.displayName = "AlertDescription"

export { Alert, AlertTitle, AlertDescription }
