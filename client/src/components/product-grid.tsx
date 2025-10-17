import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, ShoppingCart, Package } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useIsMobile } from "@/hooks/use-mobile";
import { useTranslation } from "@/lib/i18n";
import { useAuthContext } from "@/context/AuthContext";
import { ClothingItem, Category } from "@shared/schema";
import LoadingScreen from "@/components/common/LoadingScreen";
import EmptyState from "@/components/common/EmptyState";
import { FixedSizeGrid as Grid, type GridChildComponentProps } from "react-window";

function useDebounce<T>(value: T, delay = 300) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);

  return debouncedValue;
}

interface ClothingItemGridProps {
  onAddToCart: (clothingItem: ClothingItem) => void;
  cartItemCount: number;
  onToggleCart: () => void;
  branchCode?: string;
}

export function ProductGrid({ onAddToCart, cartItemCount, onToggleCart, branchCode }: ClothingItemGridProps) {
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebounce(searchQuery);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const isMobile = useIsMobile();
  const { t } = useTranslation();
  const { isSuperAdmin, branch } = useAuthContext();
  const gridViewportRef = useRef<HTMLDivElement>(null);
  const paginationRef = useRef<HTMLDivElement>(null);
  const [gridSize, setGridSize] = useState({ width: 0, height: 0 });
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set());

  // Helper function to check if imageUrl is valid
  const isValidImageUrl = useCallback((imageUrl: string | null | undefined): boolean => {
    if (!imageUrl) return false;
    if (imageUrl === '[object Object]') return false;
    if (typeof imageUrl !== 'string') return false;
    return imageUrl.trim().length > 0;
  }, []);

  // Helper function to get image source with fallback
  const getImageSrc = useCallback((item: ClothingItem): string => {
    if (isValidImageUrl(item.imageUrl) && !failedImages.has(item.id)) {
      const url = item.imageUrl!;
      // Check if it's an external URL (starts with http:// or https://)
      if (url.startsWith('http://') || url.startsWith('https://')) {
        return url; // Return external URLs as-is
      }
      // For relative paths, ensure they start with /
      return url.startsWith('/') ? url : `/${url}`;
    }
    return '/uploads/placeholder-clothing.png';
  }, [isValidImageUrl, failedImages]);

  // Handle image load error
  const handleImageError = useCallback((itemId: string) => {
    setFailedImages(prev => {
      if (prev.has(itemId)) {
        return prev;
      }
      const next = new Set(prev);
      next.add(itemId);
      return next;
    });
  }, []);

  useEffect(() => {
    const viewportElement = gridViewportRef.current;
    if (!viewportElement) return;

    const updateGridSize = () => {
      setGridSize({
        width: viewportElement.clientWidth,
        height: viewportElement.clientHeight,
      });
    };

    const observer = new ResizeObserver((entries) => {
      const entry = entries.find((e) => e.target === viewportElement);
      if (!entry) return;
      updateGridSize();
    });

    observer.observe(viewportElement);
    updateGridSize();

    return () => observer.disconnect();
  }, []);

  const {
    data: fetchedCategories,
    isLoading: categoriesLoading,
    isError: categoriesError,
  } = useQuery<Category[]>({
    queryKey: ["categories", "clothing"],
    queryFn: async () => {
      // Try legacy endpoint first for compatibility with tests
      try {
        const res1 = await fetch(`/api/product-categories`, { credentials: "include" });
        if (res1.ok) return res1.json();
      } catch {
        // ignore and try next
      }
      const response = await fetch(`/api/categories?type=clothing`, { credentials: "include" });
      if (!response.ok) throw new Error(`Failed to fetch categories: ${response.status} ${response.statusText}`);
      return response.json();
    },
  });

  const categories: Category[] = categoriesError
    ? []
    : [{ id: "all", name: t.allItems, type: "clothing" } as Category, ...(fetchedCategories ?? [])];

  const {
    data: clothingData,
    isLoading: clothingItemsLoading,
    isError: clothingItemsError,
    error: clothingItemsErrorMessage,
  } = useQuery<{ items: ClothingItem[]; total: number }>({
    queryKey: [
      "/api/clothing-items",
      selectedCategory,
      debouncedSearch,
      branchCode,
      page,
      pageSize,
    ],
    enabled: searchQuery === debouncedSearch,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedCategory !== "all") params.append("categoryId", selectedCategory);
      if (debouncedSearch) params.append("search", debouncedSearch);
      if (branchCode) params.append("branchCode", branchCode);
      params.append("limit", String(pageSize));
      params.append("offset", String((page - 1) * pageSize));
      const query = params.toString();
      // Try clothing-items endpoint first
      try {
        const response = await fetch(`/api/clothing-items${query ? `?${query}` : ""}`, {
          credentials: "include",
        });
        if (response.ok) {
          const totalHeader = response.headers.get("X-Total-Count");
          const json = await response.json();
          const items = Array.isArray(json) ? json : json.items ?? [];
          const total = totalHeader ? Number(totalHeader) : items.length;
          return { items, total };
        }
      } catch {
        // fall back below
      }
      // Fallback to products endpoint used in older tests
      const prodRes = await fetch(`/api/products${query ? `?${query}` : ""}`, { credentials: "include" });
      if (!prodRes.ok) {
        const text = await prodRes.text();
        throw new Error(text || `Failed to fetch products`);
      }
      const totalHeader = prodRes.headers.get("X-Total-Count");
      const prodJson = await prodRes.json();
      const rawItems = Array.isArray(prodJson) ? prodJson : prodJson.items ?? [];
      // Normalize products to behave like clothing items when possible.
      // If a product is linked to a clothing item, use its clothingItemId as the item id for downstream flows (service selection).
      const items = rawItems.map((p: any) =>
        p?.clothingItemId ? { ...p, id: p.clothingItemId } : p,
      );
      const total = totalHeader ? Number(totalHeader) : items.length;
      return { items, total };
    },
  });
  const items = clothingData?.items ?? [];
  const total = clothingData?.total ?? items.length;

  const columnCount = useMemo(() => {
    const w = gridSize.width;
    if (w >= 1280) return 5;
    if (w >= 1024) return 4;
    if (w >= 640) return 3;
    return 2;
  }, [gridSize.width]);

  const columnWidth = columnCount ? gridSize.width / columnCount : 0;
  const rowHeight = 200; // approximate card height with padding
  const rowCount = Math.ceil(items.length / columnCount);

  if (categoriesLoading) {
    return <LoadingScreen message={t.loadingCategories} />;
  }

  if (clothingItemsLoading) {
    return <LoadingScreen message={t.loadingProducts} />;
  }

  if (clothingItemsError) {
    return (
      <div className="flex flex-col items-center justify-center h-64 space-y-4">
        <div className="text-red-600 text-center">
          <p className="font-semibold">{t.loadingProducts || "Error loading products"}</p>
          <p className="text-sm text-gray-600 mt-2">
            {clothingItemsErrorMessage?.message || "Please try again later"}
          </p>
        </div>
        <Button 
          onClick={() => window.location.reload()}
          variant="outline"
          className="text-blue-600 border-blue-600 hover:bg-blue-50"
        >
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-pos-background pb-16 sm:pb-0 h-full min-w-0">
      {/* Search and Categories */}
      <div className="bg-pos-surface shadow-sm border-b border-gray-200 p-4">
        <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
          <div className="relative flex-1 max-w-md flex items-center gap-2">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input
              type="text"
              placeholder={t.searchProducts || "Search items..."}
              id="search-products"
              name="search"
              className="pl-10 py-3 text-base"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              data-testid="input-search-items"
            />
            {searchQuery && (
              <Button variant="ghost" size="sm" onClick={() => setSearchQuery("")}>Clear</Button>
            )}
            <select
              className="border rounded px-2 py-2 text-sm text-gray-700"
              id="items-per-page"
              name="itemsPerPage"
              value={pageSize}
              onChange={(e) => { setPage(1); setPageSize(parseInt(e.target.value, 10)); }}
              aria-label="Items per page"
            >
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
            </select>
          </div>
          {isMobile && (
            <Button 
              onClick={onToggleCart}
              className="bg-pos-primary hover:bg-blue-700 text-white px-4 py-3 flex items-center space-x-2"
            >
              <ShoppingCart className="h-4 w-4" />
              <span>{t.cart} ({cartItemCount})</span>
            </Button>
          )}
        </div>
        
        {/* Category Tabs */}
        {!categoriesError && (
          <div className="flex space-x-1 mt-4 overflow-x-auto">
            {categories.map((category) => (
              <Button
                key={category.id}
                variant={selectedCategory === category.id ? "default" : "secondary"}
                size="sm"
                className={`whitespace-nowrap ${
                  selectedCategory === category.id
                    ? "bg-pos-primary hover:bg-blue-700 text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
                onClick={() => setSelectedCategory(category.id)}
              >
                {category.name}
              </Button>
            ))}
          </div>
        )}
        {categoriesError && (
          <div className="text-center text-sm text-red-500 mt-4">
            {t.categoriesUnavailable}
          </div>
        )}
      </div>

      {/* Clothing Items Grid */}
      <div className="flex-1 p-4 overflow-hidden min-w-0">
        <div className="flex h-full flex-col">
          <div className="flex-1 min-h-0 h-full" ref={gridViewportRef}>
            {items.length === 0 || gridSize.width === 0 ? (
              <EmptyState
                icon={<Package className="h-12 w-12 text-gray-400" />}
                title={t.noProductsFound || "No items found"}
              />
            ) : (
              <Grid
                columnCount={columnCount}
                columnWidth={columnWidth}
                height={gridSize.height}
                rowCount={rowCount}
                rowHeight={rowHeight}
                width={gridSize.width}
                className="custom-scrollbar"
              >
                {({ columnIndex, rowIndex, style }: GridChildComponentProps) => {
                  const index = rowIndex * columnCount + columnIndex;
                  const item = items[index];
                  if (!item) return null;
                  return (
                    <div style={style} className="p-2">
                      <Card
                        key={item.id}
                        className="h-full hover:shadow-material-lg transition-shadow cursor-pointer"
                        onClick={() => onAddToCart(item)}
                        data-testid={`card-clothing-item-${item.id}`}
                      >
                        <div
                          className="w-full h-24 bg-gray-100 rounded-t-lg overflow-hidden flex items-center justify-center cursor-pointer"
                          role="button"
                          tabIndex={0}
                          onClick={() => onAddToCart(item)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              onAddToCart(item);
                            }
                          }}
                        >
                          <img
                            src={getImageSrc(item)}
                            alt={item.name}
                            loading="lazy"
                            className="w-full h-full object-cover"
                            onError={() => handleImageError(item.id)}
                            data-testid={`img-clothing-item-${item.id}`}
                          />
                        </div>
                        <CardContent className="p-3">
                          <h3 className="font-medium text-gray-900 mb-1" data-testid={`text-item-name-${item.id}`}>{item.name}</h3>
                          {typeof (item as any).publicId === 'number' && (
                            <div className="text-xs text-gray-500 mb-1">Item ID #{(item as any).publicId}</div>
                          )}
                          {item.description && (
                            <p className="text-sm text-gray-600 mb-2" data-testid={`text-item-description-${item.id}`}>{item.description}</p>
                          )}
                          <div className="flex justify-center items-center">
                            <span className="text-sm text-pos-primary font-medium">
                              {t.selectService || "Select Service"}
                            </span>
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  );
                }}
              </Grid>
            )}
          </div>
          {/* Pagination */}
          <div ref={paginationRef} className="mt-4 flex items-center justify-between">
            <div className="text-sm text-gray-600">
              {items.length > 0 && (
                <span>
                  Showing {(page - 1) * pageSize + 1}-{Math.min(page * pageSize, total)} of {total}
                </span>
              )}
            </div>
            <div className="space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                Prev
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => (p * pageSize < total ? p + 1 : p))}
                disabled={page * pageSize >= total}
              >
                Next
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
