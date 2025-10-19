import { Switch, Route, useLocation } from "wouter";
import { useEffect } from "react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuthContext } from "@/context/AuthContext";
import { useTranslationContext } from "@/context/TranslationContext";
import { LoginForm } from "@/components/auth/LoginForm";
import NotFound from "@/pages/not-found";
import POS from "@/pages/pos";
import AdminDashboard from "@/pages/admin-dashboard";
import ForgotPasswordPage from "@/pages/forgot-password";
import ResetPasswordPage from "@/pages/reset-password";
import PackagesPage from "@/pages/packages";
import CustomerOrderPage from "@/pages/customer-order";
import CustomerAuthPage from "@/pages/customer-auth";
import CustomerOrderingPage from "@/pages/customer-ordering";
import CustomerDashboardPage from "@/pages/customer-dashboard";
import DeliveryTrackingPage from "@/pages/portal/DeliveryTracking";
import DriverDashboard from "@/pages/driver";
import LoadingScreen from "@/components/common/LoadingScreen";
import { ThemeProvider } from "@/theme";
import CommandCenterPage from "@/pages/customers/CommandCenter";
import ControlTowerPage from "@/pages/delivery/ControlTower";
import { CommandPaletteProvider } from "@/hooks/useCommandPalette";
import CommandPalette from "@/components/navigation/CommandPalette";
import { TourProvider } from "@/components/onboarding/TourProvider";
import CreateOrderPage from "@/pages/orders/CreateOrder";
import OrderDetailsPage from "@/pages/orders/OrderDetails";
import CatalogExperimentsPage from "@/pages/catalog/Experiments";
import WorkflowBuilderPage from "@/pages/automation/WorkflowBuilder";
import IntegrationsCatalogPage from "@/pages/automation/IntegrationsCatalog";

function Router() {
  const { isAuthenticated, isLoading } = useAuthContext();
  const [location, setLocation] = useLocation();
  const { t } = useTranslationContext();

  if (isLoading) {
    return <LoadingScreen message={t.loading} />;
  }

  // Public routes - accessible without authentication
  return (
    <Switch>
      <Route path="/order" component={CustomerOrderPage} />
      <Route path="/customer-auth" component={CustomerAuthPage} />
      <Route path="/customer-dashboard" component={CustomerDashboardPage} />
      <Route path="/customer-ordering" component={CustomerOrderingPage} />
      <Route path="/portal/delivery-tracking" component={DeliveryTrackingPage} />
      <Route path="/forgot-password" component={ForgotPasswordPage} />
      <Route path="/reset-password/:token" component={ResetPasswordPage} />
      {!isAuthenticated && <Route component={() => <LoginForm />} />}
      {isAuthenticated && <Route path="/" component={POS} />}
      {isAuthenticated && <Route path="/admin" component={AdminDashboard} />}
      {isAuthenticated && <Route path="/packages" component={PackagesPage} />}
      {isAuthenticated && <Route path="/orders/create" component={CreateOrderPage} />}
      {isAuthenticated && <Route path="/orders/:id" component={OrderDetailsPage} />}
      {isAuthenticated && <Route path="/catalog/experiments" component={CatalogExperimentsPage} />}
      {isAuthenticated && <Route path="/automation/workflows" component={WorkflowBuilderPage} />}
      {isAuthenticated && <Route path="/automation/integrations" component={IntegrationsCatalogPage} />}
      {isAuthenticated && (
        <Route path="/customers/:id/command-center" component={CommandCenterPage} />
      )}
      {isAuthenticated && <Route path="/delivery/control-tower" component={ControlTowerPage} />}
      {isAuthenticated && <Route path="/driver" component={DriverDashboard} />}
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ThemeProvider>
          <CommandPaletteProvider>
            <TourProvider>
              <TooltipProvider>
                <Toaster />
                <CommandPalette />
                <Router />
              </TooltipProvider>
            </TourProvider>
          </CommandPaletteProvider>
        </ThemeProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
