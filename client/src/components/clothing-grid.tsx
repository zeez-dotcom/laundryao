import { useState } from "react";
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
  const { t } = useTranslation();
  const { isSuperAdmin, branch } = useAuthContext();
  const resolvedBranchId = branchId ?? (isSuperAdmin ? branch?.id : undefined);

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
    queryKey: ["/api/products", resolvedBranchId, selectedCategory, searchQuery],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (resolvedBranchId) params.append("branchId", resolvedBranchId);
      if (selectedCategory !== "all") params.append("categoryId", selectedCategory);
      if (searchQuery) params.append("search", searchQuery);

      const response = await fetch(`/api/products?${params}`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch products");
      return response.json();
    },
  }) as { data: { items: Product[] }; isLoading: boolean };

  const products = productData?.items ?? [];

  if (isLoading) {
    return <LoadingScreen message={t.loadingProducts} />;
  }

  return (
    <div className="flex-1 flex flex-col bg-pos-background">
      {/* Search and Categories */}
      <div className="bg-pos-surface shadow-sm border-b border-gray-200 p-4">
        <div className="flex justify-center">
          <div className="relative w-full max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input
              type="text"
              placeholder={t.searchProducts}
              className="pl-10 py-3 text-base w-full"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
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
      </div>
    </div>
  );
}

