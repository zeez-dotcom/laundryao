import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Product, Branch } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuthContext } from "@/context/AuthContext";

const ITEM_TYPE_OPTIONS = ["everyday", "premium"] as const;

interface ProductFormProps {
  product?: Product | null;
  onClose: () => void;
}

export function ProductForm({ product, onClose }: ProductFormProps) {
  const [name, setName] = useState(product?.name || "");
  const [description, setDescription] = useState(product?.description || "");
  const [price, setPrice] = useState(product?.price?.toString() || "");
  const [stock, setStock] = useState(product?.stock?.toString() || "");
  const [itemType, setItemType] = useState<string>(product?.itemType || "everyday");
  const [branchId, setBranchId] = useState<string>(product?.branchId || "");

  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { isSuperAdmin } = useAuthContext();

  const { data: branches = [] } = useQuery<Branch[]>({
    queryKey: ["/api/branches"],
    enabled: isSuperAdmin,
  });

  const mutation = useMutation({
    mutationFn: async (data: any) => {
      if (product?.id) {
        return apiRequest("PUT", `/api/products/${product.id}`, data);
      }
      return apiRequest("POST", "/api/products", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      onClose();
    },
    onError: () => {
      toast({ title: "Failed to save product", variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isSuperAdmin && !branchId) {
      toast({ title: "Please select a branch", variant: "destructive" });
      return;
    }
    mutation.mutate({
      name,
      description,
      price,
      stock: parseInt(stock || "0", 10),
      itemType,
      ...(isSuperAdmin ? { branchId } : {}),
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {isSuperAdmin && (
        <div className="space-y-2">
          <Label htmlFor="branch">Branch</Label>
          <Select value={branchId} onValueChange={setBranchId}>
            <SelectTrigger id="branch">
              <SelectValue placeholder="Select branch" />
            </SelectTrigger>
            <SelectContent>
              {branches.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      <div className="space-y-2">
        <Label htmlFor="name">Name</Label>
        <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Input
          id="description"
          value={description || ""}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="price">Price</Label>
        <Input id="price" value={price} onChange={(e) => setPrice(e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="stock">Stock</Label>
        <Input id="stock" value={stock} onChange={(e) => setStock(e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="itemType">Item Type</Label>
        <Select value={itemType} onValueChange={setItemType}>
          <SelectTrigger id="itemType">
            <SelectValue placeholder="Select item type" />
          </SelectTrigger>
          <SelectContent>
            {ITEM_TYPE_OPTIONS.map((type) => (
              <SelectItem key={type} value={type}>
                {type.charAt(0).toUpperCase() + type.slice(1)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex justify-end space-x-2">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={mutation.isPending}>
          {product?.id ? "Update" : "Create"}
        </Button>
      </div>
    </form>
  );
}

export default ProductForm;
