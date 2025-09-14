# Common UI Helpers

This directory houses small presentational helpers shared across the client.

## LoadingScreen

Displays a full-screen spinner. Optionally accepts a `message` to show below the
spinner.

```tsx
import LoadingScreen from "@/components/common/LoadingScreen";

<LoadingScreen message="Loading products..." />
```

## EmptyState

Provides a consistent way to communicate that a list or section has no data. It
accepts an `icon`, `title` and optional `description`.

```tsx
import EmptyState from "@/components/common/EmptyState";
import { Package } from "lucide-react";

<EmptyState
  icon={<Package className="h-12 w-12 text-gray-400" />}
  title="No products found"
  description="Try adjusting your search."
/>
```
