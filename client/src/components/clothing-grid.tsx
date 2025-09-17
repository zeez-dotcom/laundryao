import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, Package } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Product } from "@shared/schema";
import { useTranslation } from "@/lib/i18n";
import LoadingScreen from "@/components/common/LoadingScreen";
import EmptyState from "@/components/common/EmptyState";
import { useAuthContext } from "@/context/AuthContext";

interface ClothingGridProps {
  onSelectProduct: (item: Product) => void;
  branchId?: string;
}

interface Category {
  id: string;
  name: string;
}

export function ClothingGrid({ onSelectProduct, branchId }: ClothingGridProps) {
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const { t } = useTranslation();
  const { isSuperAdmin, branch } = useAuthContext();
  const resolvedBranchId = branchId ?? (isSuperAdmin ? branch?.id : undefined);
  // simple debounce
  const [debounced, setDebounced] = useState(searchQuery);
  useEffect(() => {
    const h = setTimeout(() => setDebounced(searchQuery), 300);
    return () => clearTimeout(h);
  }, [searchQuery]);

  const {
    data: fetchedCategories,
    isError: categoriesError,
  } = useQuery<Category[]>({
    queryKey: ["/api/categories", "clothing"],
    queryFn: async () => {
      const response = await fetch("/api/categories?type=clothing", {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch categories");
      return response.json();
    },
  });

  const productCategories =
    categoriesError || !fetchedCategories?.length
      ? [{ id: "all", label: t.allItems }]
      : [
          { id: "all", label: t.allItems },
          ...fetchedCategories.map((c) => ({ id: c.id, label: c.name })),
        ];

  const { data: productData, isLoading } = useQuery({
    queryKey: ["/api/products", resolvedBranchId, selectedCategory, debounced, page, pageSize],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (resolvedBranchId) params.append("branchId", resolvedBranchId);
      if (selectedCategory !== "all") params.append("categoryId", selectedCategory);
      if (debounced) params.append("search", debounced);
      params.append("limit", String(pageSize));
      params.append("offset", String((page - 1) * pageSize));

      const response = await fetch(`/api/products?${params}`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch products");
      const totalHeader = response.headers.get("X-Total-Count");
      const json = await response.json();
      const items = (json?.items ?? []) as Product[];
      const total = totalHeader ? Number(totalHeader) : items.length;
      return { items, total };
    },
  }) as { data: { items: Product[]; total: number }; isLoading: boolean };

  const products = productData?.items ?? [];
  const total = productData?.total ?? products.length;

  if (isLoading) {
    return <LoadingScreen message={t.loadingProducts} />;
  }

  return (
    <div className="flex-1 flex flex-col bg-pos-background">
      {/* Search and Categories */}
      <div className="bg-pos-surface shadow-sm border-b border-gray-200 p-4">
        <div className="flex justify-center">
          <div className="relative w-full max-w-2xl flex items-center gap-2">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input
              type="text"
              placeholder={t.searchProducts}
              className="pl-10 py-3 text-base w-full"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <Button variant="ghost" size="sm" onClick={() => setSearchQuery("")}>Clear</Button>
            )}
            <select
              className="border rounded px-2 py-2 text-sm text-gray-700"
              value={pageSize}
              onChange={(e) => { setPage(1); setPageSize(parseInt(e.target.value, 10)); }}
              aria-label="Items per page"
            >
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
            </select>
          </div>
        </div>

        {/* Category Tabs */}
        <div className="flex space-x-1 mt-4 overflow-x-auto">
          {productCategories.map((category) => (
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
              {category.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Products Grid */}
      <div className="flex-1 overflow-y-auto p-4">
        {products.length === 0 ? (
          <EmptyState
            icon={<Package className="h-12 w-12 text-gray-400" />}
            title={t.noProductsFound}
          />
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {products.map((item) => (
              <Card
                key={item.id}
                className="hover:shadow-material-lg transition-shadow"
              >
                {item.imageUrl && (
                  <img
                    src={item.imageUrl}
                    alt={item.name}
                    className="w-full h-32 object-cover rounded-t-lg"
                  />
                )}
                <CardContent className="p-3">
                  <h3 className="font-medium text-gray-900 mb-1">
                    {item.name}
                  </h3>
                  {typeof (item as any).publicId === 'number' && (
                    <div className="text-xs text-gray-500 mb-1">Item ID #{(item as any).publicId}</div>
                  )}
                  {item.description && (
                    <p className="text-sm text-gray-600 mb-2">{item.description}</p>
                  )}
                  <div className="text-center">
                    <span className="text-sm text-gray-500 capitalize">
                      {item.name}
                    </span>
                  </div>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          className="mt-3 w-full bg-pos-secondary hover:bg-green-600 text-white"
                          onClick={() => onSelectProduct(item)}
                        >
                          {t.selectService}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>{t.servicePriceInfo}</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
        <div className="mt-4 flex items-center justify-between">
          <div className="text-sm text-gray-600">
            {products.length > 0 && (
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
  );
}
