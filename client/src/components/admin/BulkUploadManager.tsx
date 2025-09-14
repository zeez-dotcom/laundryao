import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import type { Branch } from "@shared/schema";

export function BulkUploadManager() {
  const { data: branches = [] } = useQuery<Branch[]>({
    queryKey: ["/api/branches"],
  });
  const { toast } = useToast();
  const [branchId, setBranchId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const downloadTemplate = async () => {
    try {
      const res = await fetch("/api/catalog/bulk-template", { credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "catalog-bulk-template.xlsx";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      toast({
        title: "Download failed",
        description: err.message,
        variant: "destructive",
      });
    }
  };

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!file || !branchId) throw new Error("Please select a branch and file");
      const formData = new FormData();
      formData.append("file", file);
      formData.append("branchId", branchId);
      const res = await fetch("/api/catalog/bulk-upload", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      return await res.json();
    },
    onSuccess: () => {
      setStatus("Upload successful");
      setError(null);
      toast({ title: "Upload successful" });
      setFile(null);
    },
    onError: (err: any) => {
      setError(err.message);
      setStatus(null);
      toast({
        title: "Upload failed",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const handleUpload = () => {
    if (!branchId) {
      setError("Please select a branch");
      toast({
        title: "Upload failed",
        description: "Please select a branch",
        variant: "destructive",
      });
      return;
    }
    if (!file) {
      setError("Please select a file");
      toast({
        title: "Upload failed",
        description: "Please select a file",
        variant: "destructive",
      });
      return;
    }
    uploadMutation.mutate();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Bulk Upload</CardTitle>
        <CardDescription>Upload catalog items using an Excel template</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="branch">Branch</Label>
          <Select value={branchId} onValueChange={setBranchId}>
            <SelectTrigger id="branch" className="w-[240px]">
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
        <Button variant="outline" onClick={downloadTemplate}>
          Download Template
        </Button>
        <div className="space-y-2">
          <Label htmlFor="file">Excel File</Label>
          <Input
            id="file"
            type="file"
            accept=".xlsx"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
        </div>
        <Button
          onClick={handleUpload}
          disabled={uploadMutation.isPending || !file || !branchId}
        >
          {uploadMutation.isPending ? "Uploading..." : "Upload"}
        </Button>
        {status && <p className="text-green-600">{status}</p>}
        {error && <p className="text-red-600">{error}</p>}
      </CardContent>
    </Card>
  );
}

