import { OfficialHeader } from "@/components/OfficialHeader";
import { OfficialCard } from "@/components/OfficialCard";
import { Button } from "@/components/ui/button";
import { useComplaint } from "@/hooks/use-complaints";
import { useRoute, useLocation } from "wouter";
import { Loader2, CheckCircle2, DollarSign, AlertCircle, Info } from "lucide-react";
import { motion } from "framer-motion";
import { useState, useEffect, useCallback } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { loadStripe, Stripe } from "@stripe/stripe-js";
import { EmbeddedCheckoutProvider, EmbeddedCheckout } from "@stripe/react-stripe-js";

import { apiUrl } from "@/config";

const TIER_NAMES: Record<string, string> = {
  registered_complainant: 'Registered Complainant',
  pro_complainant: 'Pro Complainant',
};

interface SubscriptionStatus {
  active: boolean;
  tier?: string;
  complaintsUsed?: number;
  complaintsAllowed?: number | null;
  currentPeriodEnd?: string;
}

// Factory: lazily loads a Stripe instance by fetching the publishable key from configUrl.
// The returned promise is cached so Stripe is only initialized once per mode.
function makeStripeLoader(configUrl: string): { load: () => Promise<Stripe | null>; error: string | null } {
  let promise: Promise<Stripe | null> | null = null;
  const loader = {
    error: null as string | null,
    load(): Promise<Stripe | null> {
      if (!promise) {
        promise = fetch(apiUrl(configUrl))
          .then(res => res.ok ? res.json() : res.json().then((d: any) => { throw new Error(d.message || 'Failed to load payment configuration'); }))
          .then(({ publishableKey }: { publishableKey: string }) => {
            if (!publishableKey) throw new Error('Payment configuration missing');
            return loadStripe(publishableKey);
          })
          .catch(err => {
            loader.error = err.message;
            return null;
          });
      }
      return promise;
    },
  };
  return loader;
}

const testStripe = makeStripeLoader('/api/stripe/config');
const liveStripe = makeStripeLoader('/api/stripe/live-config');

async function fetchCheckoutClientSecret(sessionUrl: string, complaintId: number): Promise<string> {
  const res = await fetch(apiUrl(sessionUrl), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ complaintId }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || 'Failed to create checkout session');
  }
  const { clientSecret } = await res.json();
  return clientSecret;
}

interface CheckoutSectionProps {
  banner: React.ReactNode;
  buttonLabel: string;
  buttonClassName?: string;
  loaded: boolean;
  error: string | null;
  showCheckout: boolean;
  onStart: () => void;
  stripeLoader: () => Promise<Stripe | null>;
  fetchSecret: () => Promise<string>;
  completionNote: string;
  testId?: string;
}

function CheckoutSection({
  banner, buttonLabel, buttonClassName, loaded, error, showCheckout, onStart,
  stripeLoader, fetchSecret, completionNote, testId,
}: CheckoutSectionProps) {
  if (error) {
    return (
      <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg text-center">
        <AlertCircle className="w-8 h-8 text-destructive mx-auto mb-2" />
        <p className="text-sm text-destructive">{error}</p>
        <Button variant="outline" size="sm" className="mt-3" onClick={() => window.location.reload()}>
          Try Again
        </Button>
      </div>
    );
  }
  if (!showCheckout) {
    return (
      <Button
        data-testid={testId}
        className={`w-full h-12 text-lg ${buttonClassName ?? 'shadow-lg'}`}
        size="lg"
        onClick={onStart}
        disabled={!loaded}
      >
        {!loaded ? <><Loader2 className="mr-2 h-5 w-5 animate-spin" />Loading Payment Form...</> : buttonLabel}
      </Button>
    );
  }
  return (
    <div className="space-y-4">
      <div data-testid={testId ? `${testId}-checkout` : undefined}>
        <EmbeddedCheckoutProvider stripe={stripeLoader()} options={{ fetchClientSecret: fetchSecret }}>
          <EmbeddedCheckout />
        </EmbeddedCheckoutProvider>
      </div>
      <p className="text-xs text-muted-foreground text-center">{completionNote}</p>
    </div>
  );
}

export default function Payment() {
  const [, params] = useRoute("/payment/:id");
  const [, setLocation] = useLocation();
  const id = Number(params?.id);
  const { toast } = useToast();
  
  const { data: complaint, isLoading: isLoadingComplaint, error: complaintError } = useComplaint(id);
  const [showCheckout, setShowCheckout] = useState(false);
  const [stripeLoaded, setStripeLoaded] = useState(false);
  const [stripeError, setStripeError] = useState<string | null>(null);
  const [showLiveCheckout, setShowLiveCheckout] = useState(false);
  const [liveStripeLoaded, setLiveStripeLoaded] = useState(false);
  const [liveStripeError, setLiveStripeError] = useState<string | null>(null);
  const [subStatus, setSubStatus] = useState<SubscriptionStatus | null>(null);
  const [subLoading, setSubLoading] = useState(false);
  const [subUsing, setSubUsing] = useState(false);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('payment') === 'cancelled') {
      toast({
        title: "Payment Cancelled",
        description: "You can try again when you're ready.",
        variant: "destructive",
      });
      window.history.replaceState({}, '', `/payment/${id}`);
    }
  }, [id, toast]);

  useEffect(() => {
    testStripe.load().then(s => s ? setStripeLoaded(true) : setStripeError(testStripe.error));
    liveStripe.load().then(s => s ? setLiveStripeLoaded(true) : setLiveStripeError(liveStripe.error));
  }, []);

  useEffect(() => {
    if (!complaint?.customerEmail) return;
    setSubLoading(true);
    fetch(apiUrl(`/api/subscriptions/status?email=${encodeURIComponent(complaint.customerEmail)}`))
      .then(res => res.ok ? res.json() : null)
      .then(data => setSubStatus(data))
      .catch(() => setSubStatus(null))
      .finally(() => setSubLoading(false));
  }, [complaint?.customerEmail]);

  const handleUseSubscription = async () => {
    if (!complaint) return;
    setSubUsing(true);
    try {
      const res = await fetch(apiUrl('/api/subscriptions/use-complaint'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ complaintId: complaint.id, email: complaint.customerEmail }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Failed to process complaint');
      }
      // Use full navigation to bypass stale React Query cache (complaint still shows pending_payment)
      window.location.href = `/status/${complaint.id}`;
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
      setSubUsing(false);
    }
  };

  const fetchClientSecret = useCallback(() => fetchCheckoutClientSecret('/api/stripe/create-checkout-session', id), [id]);
  const fetchLiveClientSecret = useCallback(() => fetchCheckoutClientSecret('/api/stripe/create-live-checkout-session', id), [id]);

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

  const hasAllowanceRemaining = !subLoading && subStatus?.active && (
    subStatus.complaintsAllowed === null ||
    (subStatus.complaintsUsed ?? 0) < (subStatus.complaintsAllowed ?? 0)
  );
  const allowanceExhausted = !subLoading && subStatus?.active && !hasAllowanceRemaining;

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
            {!hasAllowanceRemaining && (
              <div className="text-right">
                <div className="text-xs text-muted-foreground uppercase tracking-wider font-bold">Amount Due</div>
                <div className="text-2xl font-mono font-bold text-foreground flex items-center justify-end">
                  <DollarSign className="w-5 h-5 text-muted-foreground" />
                  {(complaint.filingFee / 100).toFixed(2)}
                </div>
              </div>
            )}
          </div>

          {allowanceExhausted && (
            <div className="mb-6 bg-muted/60 p-4 rounded-lg border border-border">
              <h4 className="font-semibold text-sm text-muted-foreground">
                {TIER_NAMES[subStatus!.tier!] ?? subStatus!.tier} Membership — Allowance Exhausted
              </h4>
              <p className="text-sm text-muted-foreground mt-1">
                You have used all {subStatus!.complaintsAllowed} complaints this month.
                Resets {subStatus!.currentPeriodEnd ? new Date(subStatus!.currentPeriodEnd).toLocaleDateString() : 'next month'}.
                You can still file below for the standard fee.
              </p>
            </div>
          )}

          {hasAllowanceRemaining && (
            <OfficialCard className="mb-6">
              <div className="bg-green-50 dark:bg-green-950/30 p-4 rounded-lg border border-green-200 dark:border-green-800">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <h4 className="font-semibold text-sm text-green-800 dark:text-green-300">
                      {TIER_NAMES[subStatus!.tier!] ?? subStatus!.tier} Membership
                    </h4>
                    <p className="text-sm text-green-700 dark:text-green-400 mt-1">
                      {subStatus!.complaintsAllowed === null
                        ? 'Unlimited complaints included in your membership.'
                        : `${subStatus!.complaintsUsed} of ${subStatus!.complaintsAllowed} complaints used this month.`}
                    </p>
                  </div>
                </div>
                <Button
                  className="w-full mt-4 bg-green-600 hover:bg-green-700 text-white"
                  size="lg"
                  onClick={handleUseSubscription}
                  disabled={subUsing}
                >
                  {subUsing
                    ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Processing...</>
                    : 'File Using Subscription — Free'}
                </Button>
              </div>
            </OfficialCard>
          )}

          {!hasAllowanceRemaining && <>
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

              <CheckoutSection
                banner={null}
                buttonLabel={`Pay $${(complaint.filingFee / 100).toFixed(2)} - Enter Card Details`}
                loaded={stripeLoaded}
                error={stripeError}
                showCheckout={showCheckout}
                onStart={() => setShowCheckout(true)}
                stripeLoader={testStripe.load}
                fetchSecret={fetchClientSecret}
                completionNote="Complete your payment above. You'll be redirected automatically after payment."
                testId="button-pay-stripe"
              />
            </div>
          </OfficialCard>

          <div className="mt-8 flex items-center gap-3">
            <div className="flex-1 border-t border-border" />
            <span className="text-xs text-muted-foreground uppercase tracking-wider">or</span>
            <div className="flex-1 border-t border-border" />
          </div>

          <OfficialCard className="mt-6">
            <div className="space-y-4">
              <div className="bg-blue-50 dark:bg-blue-950/30 p-4 rounded-lg border border-blue-200 dark:border-blue-800 flex items-start gap-3">
                <Info className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-semibold text-sm text-blue-800 dark:text-blue-300">Real Payment — $0.50</h4>
                  <p className="text-sm text-blue-700 dark:text-blue-400 mt-1">
                    This charges <strong>$0.50</strong> to your actual credit card via Stripe live mode. Use your real card details.
                  </p>
                </div>
              </div>

              <CheckoutSection
                banner={null}
                buttonLabel="Pay $0.50 - Real Payment"
                buttonClassName="border border-blue-300 text-blue-700 hover:bg-blue-50 dark:border-blue-700 dark:text-blue-300 dark:hover:bg-blue-950/30"
                loaded={liveStripeLoaded}
                error={liveStripeError}
                showCheckout={showLiveCheckout}
                onStart={() => setShowLiveCheckout(true)}
                stripeLoader={liveStripe.load}
                fetchSecret={fetchLiveClientSecret}
                completionNote="Complete your real payment above. You'll be redirected automatically after payment."
              />
            </div>
          </OfficialCard>
          </>}

          <p className="text-center text-xs text-muted-foreground mt-6 max-w-sm mx-auto">
            {hasAllowanceRemaining
              ? 'File your complaint using your membership allowance above.'
              : 'By proceeding with payment, you agree to the non-refundable filing fee for the administrative processing of your complaint. Secure payment powered by Stripe.'}
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
  const [, setLocation] = useLocation();
  
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
          <Button 
            variant="outline"
            onClick={() => setLocation("/")}
            data-testid="button-return-home"
          >
            Return Home
          </Button>
        </div>
      </div>
    </div>
  );
}
