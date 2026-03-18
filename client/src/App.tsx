import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Home from "@/pages/Home";
import FileComplaint from "@/pages/FileComplaint";
import Payment from "@/pages/Payment";
import Status from "@/pages/Status";
import Admin from "@/pages/Admin";
import Subscribe from "@/pages/Subscribe";
import SubscriptionConfirmation from "@/pages/SubscriptionConfirmation";
import DepartmentRegister from "@/pages/DepartmentRegister";
import DepartmentAdmin from "@/pages/DepartmentAdmin";
import DepartmentOnboardingComplete from "@/pages/DepartmentOnboardingComplete";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/file-complaint" component={FileComplaint} />
      <Route path="/payment/:id" component={Payment} />
      <Route path="/status/:id" component={Status} />
      <Route path="/admin" component={Admin} />
      <Route path="/subscribe" component={Subscribe} />
      <Route path="/subscription/confirmation" component={SubscriptionConfirmation} />
      <Route path="/department/register" component={DepartmentRegister} />
      <Route path="/department/onboarding" component={DepartmentOnboardingComplete} />
      <Route path="/department/:slug/admin" component={DepartmentAdmin} />
      <Route path="/department/:slug/onboarding-complete" component={DepartmentOnboardingComplete} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
