import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "@/lib/i18n";
import { CitySelect } from "@/components/city-select";
import defaultLogo from "@/assets/logo.png";
import type { Branch, Customer } from "@shared/schema";
import { CustomerResetPassword } from "./customer-reset-password";

interface GuestInfo {
  name: string;
  phoneNumber: string;
  address: string;
}

interface CustomerAuthProps {
  branchCode: string;
  onAuth: (customer: Customer) => void;
  onGuest?: (guest: GuestInfo) => void;
}

export function CustomerAuth({ branchCode, onAuth, onGuest }: CustomerAuthProps) {
  const [mode, setMode] = useState<"login" | "register" | "guest">("login");
  const [showReset, setShowReset] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [addressLabel, setAddressLabel] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [branch, setBranch] = useState<Branch | null>(null);
  const { toast } = useToast();
  const { t: translations, language } = useTranslation();

  useEffect(() => {
    fetch(`/api/branches/${branchCode}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setBranch(data))
      .catch(() => {});
  }, [branchCode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (mode === "guest") {
        onGuest?.({ name, phoneNumber, address });
        return;
      }
      if (mode === "register" && password.length < 8) {
        toast({
          title: "Password too short",
          description: "Password must be at least 8 characters",
          variant: "destructive",
        });
        return;
      }
      if (
        mode === "register" &&
        (branch as any)?.serviceCityIds?.length &&
        !(branch as any).serviceCityIds.includes(city)
      ) {
        toast({
          title: translations.areas?.notServed || "Area not served",
          variant: "destructive",
        });
        return;
      }
      const endpoint = mode === "login" ? "/customer/login" : "/customer/register";
      const payload: any = { phoneNumber, password };
      if (mode === "register") {
        payload.name = name;
        payload.branchCode = branchCode;
        payload.addressLabel = addressLabel;
        payload.address = address;
        payload.city = city;
      }
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Request failed");
      }
      const customer = (await res.json()) as Customer;
      onAuth(customer);
    } catch (err: any) {
      toast({
        title: "Authentication failed",
        description: err.message,
        variant: "destructive",
      });
    }
  };

  return (
    showReset ? (
      <CustomerResetPassword onDone={() => setShowReset(false)} />
    ) : (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="flex items-center justify-center gap-3 mb-4">
              <img
                src={branch?.logoUrl || defaultLogo}
                alt="Branch Logo"
                className="h-16 w-16 object-cover rounded-lg"
              />
              {branch?.name && (
                <span className="text-2xl font-bold">{branch.name}</span>
              )}
            </div>
            <CardTitle>
              {mode === "login"
                ? "Customer Login"
                : mode === "register"
                ? "Customer Registration"
                : "Guest Checkout"}
            </CardTitle>
          </CardHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <CardContent className="space-y-4">
          {(mode === "register" || mode === "guest") && (
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
          )}
          {mode === "register" && (
            <div className="space-y-2">
              <Label htmlFor="addressLabel">Address Label</Label>
              <Input
                id="addressLabel"
                value={addressLabel}
                onChange={(e) => setAddressLabel(e.target.value)}
                required
              />
            </div>
          )}
          {mode === "register" && (
            <div className="space-y-2">
              <Label htmlFor="city">City</Label>
              <CitySelect
                value={city}
                onChange={setCity}
                cityIds={
                  (branch as any)?.serviceCityIds && (branch as any).serviceCityIds.length > 0
                    ? (branch as any).serviceCityIds
                    : undefined
                }
              />
            </div>
          )}
          {(mode === "register" || mode === "guest") && (
            <div className="space-y-2">
              <Label htmlFor="address">Address</Label>
              <Textarea
                id="address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                required
              />
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="phone">Mobile Number</Label>
            <Input
              id="phone"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              required
            />
          </div>
          {mode !== "guest" && (
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
          )}
        </CardContent>
            <CardFooter className="flex flex-col space-y-2">
              <Button type="submit" className="w-full">
                {mode === "login"
                  ? "Login"
                  : mode === "register"
                  ? "Register"
                  : "Continue as Guest"}
              </Button>
              {mode === "login" && (
                <Button
                  type="button"
                  variant="link"
                  className="w-full"
                  onClick={() => setShowReset(true)}
                >
                  Forgot password?
                </Button>
              )}
              {mode !== "guest" && (
                <Button
                  type="button"
                  variant="link"
                  className="w-full"
                  onClick={() =>
                    setMode(mode === "login" ? "register" : "login")
                  }
                >
                  {mode === "login"
                    ? "Need an account? Register"
                    : "Have an account? Login"}
                </Button>
              )}
              {mode !== "guest" ? (
                <Button
                  type="button"
                  variant="link"
                  className="w-full"
                  onClick={() => setMode("guest")}
                >
                  Continue as Guest
                </Button>
              ) : (
                <div className="flex w-full gap-2">
                  <Button
                    type="button"
                    variant="link"
                    className="flex-1"
                    onClick={() => setMode("login")}
                  >
                    Login
                  </Button>
                  <Button
                    type="button"
                    variant="link"
                    className="flex-1"
                    onClick={() => setMode("register")}
                  >
                    Register
                  </Button>
                </div>
              )}
            </CardFooter>
          </form>
        </Card>
      </div>
    )
  );
}
