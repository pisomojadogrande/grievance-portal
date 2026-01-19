import { OfficialHeader } from "@/components/OfficialHeader";
import { OfficialCard } from "@/components/OfficialCard";
import { Button } from "@/components/ui/button";
import { useComplaint } from "@/hooks/use-complaints";
import { useRoute, useLocation } from "wouter";
import { Loader2, CheckCircle2, DollarSign, AlertCircle, CreditCard, Info } from "lucide-react";
import { motion } from "framer-motion";
import { useState, useEffect } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";

export default function Payment() {
  const [, params] = useRoute("/payment/:id");
  const [, setLocation] = useLocation();
  const id = Number(params?.id);
  const { toast } = useToast();
  
  const { data: complaint, isLoading: isLoadingComplaint, error: complaintError } = useComplaint(id);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [paymentCancelled, setPaymentCancelled] = useState(false);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('payment') === 'cancelled') {
      setPaymentCancelled(true);
      toast({
        title: "Payment Cancelled",
        description: "You can try again when you're ready.",
        variant: "destructive",
      });
      window.history.replaceState({}, '', `/payment/${id}`);
    }
  }, [id, toast]);

  const handleStripeCheckout = async () => {
    setIsRedirecting(true);
    try {
      const response = await fetch('/api/stripe/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ complaintId: id }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to create checkout session');
      }

      const { url } = await response.json();
      
      if (url) {
        window.location.href = url;
      } else {
        throw new Error('No checkout URL received');
      }
    } catch (error: any) {
      setIsRedirecting(false);
      toast({
        title: "Payment Error",
        description: error.message || "Failed to initiate payment. Please try again.",
        variant: "destructive",
      });
    }
  };

  if (isLoadingComplaint) {
    return <PaymentSkeleton />;
  }

  if (complaintError || !complaint) {
    return <PaymentError />;
  }

  if (complaint.status !== 'pending_payment') {
    setLocation(`/status/${id}`);
    return null;
  }

  return (
    <div className="min-h-screen bg-background font-sans pb-20">
      <OfficialHeader />

      <main className="max-w-xl mx-auto px-4 sm:px-6 pt-12">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4 }}
        >
          <div className="mb-8 flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-2xl font-serif font-bold text-foreground">Remit Filing Fee</h1>
              <p className="text-sm text-muted-foreground font-mono mt-1">Case #{complaint.id}</p>
            </div>
            <div className="text-right">
              <div className="text-xs text-muted-foreground uppercase tracking-wider font-bold">Amount Due</div>
              <div className="text-2xl font-mono font-bold text-foreground flex items-center justify-end">
                <DollarSign className="w-5 h-5 text-muted-foreground" />
                {(complaint.filingFee / 100).toFixed(2)}
              </div>
            </div>
          </div>

          <OfficialCard>
            <div className="space-y-6">
              <div className="bg-primary/5 p-4 rounded-lg border border-primary/10 flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-semibold text-sm">Complaint Draft Recorded</h4>
                  <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                    "{complaint.content}"
                  </p>
                </div>
              </div>

              <div className="border-t border-border my-6" />

              <div className="bg-amber-50 dark:bg-amber-950/30 p-4 rounded-lg border border-amber-200 dark:border-amber-800 flex items-start gap-3">
                <Info className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-semibold text-sm text-amber-800 dark:text-amber-300">Test Mode - Sandbox Payment</h4>
                  <p className="text-sm text-amber-700 dark:text-amber-400 mt-1">
                    This is a <strong>test payment</strong>. No real money will be charged. 
                    Use Stripe's test card: <code className="bg-amber-100 dark:bg-amber-900 px-1 rounded font-mono text-xs">4242 4242 4242 4242</code> with any future expiry date and any CVC.
                  </p>
                </div>
              </div>

              <Button 
                data-testid="button-pay-stripe"
                className="w-full h-12 text-lg shadow-lg" 
                size="lg"
                onClick={handleStripeCheckout}
                disabled={isRedirecting}
              >
                {isRedirecting ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Redirecting to Stripe...
                  </>
                ) : (
                  <>
                    <CreditCard className="mr-2 h-5 w-5" />
                    Pay ${(complaint.filingFee / 100).toFixed(2)} with Stripe
                  </>
                )}
              </Button>
            </div>
          </OfficialCard>
          
          <p className="text-center text-xs text-muted-foreground mt-6 max-w-sm mx-auto">
            By clicking "Pay", you agree to the non-refundable filing fee for the administrative processing of your complaint. Secure payment powered by Stripe.
          </p>
        </motion.div>
      </main>
    </div>
  );
}

function PaymentSkeleton() {
  return (
    <div className="min-h-screen bg-background">
      <OfficialHeader />
      <main className="max-w-xl mx-auto px-4 pt-12">
        <div className="flex justify-between mb-8 gap-4 flex-wrap">
          <div className="space-y-2">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-24" />
          </div>
          <div className="space-y-2 flex flex-col items-end">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-8 w-24" />
          </div>
        </div>
        <Skeleton className="h-[400px] w-full rounded-lg" />
      </main>
    </div>
  );
}

function PaymentError() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <OfficialHeader />
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <div className="mx-auto w-12 h-12 bg-destructive/10 rounded-full flex items-center justify-center mb-4">
            <AlertCircle className="w-6 h-6 text-destructive" />
          </div>
          <h2 className="text-xl font-bold mb-2">Error Loading Case</h2>
          <p className="text-muted-foreground mb-6">We could not locate the complaint record. It may have expired or the ID is incorrect.</p>
          <Button asChild variant="outline">
            <a href="/">Return Home</a>
          </Button>
        </div>
      </div>
    </div>
  );
}
