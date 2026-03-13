import { OfficialHeader } from "@/components/OfficialHeader";
import { OfficialCard } from "@/components/OfficialCard";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Loader2, AlertCircle } from "lucide-react";
import { motion } from "framer-motion";
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { apiUrl } from "@/config";

const TIER_LABELS: Record<string, { name: string; allowance: string }> = {
  registered_complainant: { name: 'Registered Complainant', allowance: '3 complaints per month' },
  pro_complainant: { name: 'Pro Complainant', allowance: 'Unlimited complaints per month' },
};

export default function SubscriptionConfirmation() {
  const [, setLocation] = useLocation();
  const [portalLoading, setPortalLoading] = useState(false);
  const [portalError, setPortalError] = useState<string | null>(null);

  const params = new URLSearchParams(window.location.search);
  const sessionId = params.get('session_id');

  // Extract email from localStorage (saved during subscribe flow) or fall back to empty
  const [email, setEmail] = useState('');
  const [tier, setTier] = useState<string>('');

  useEffect(() => {
    // Try to get email from sessionStorage (set during subscribe flow)
    const storedEmail = sessionStorage.getItem('subscribe_email') || '';
    const storedTier = sessionStorage.getItem('subscribe_tier') || '';
    setEmail(storedEmail);
    setTier(storedTier);
  }, []);

  const handleManageSubscription = async () => {
    if (!email) {
      setPortalError('Email not available. Please visit your subscription settings directly.');
      return;
    }
    setPortalLoading(true);
    setPortalError(null);
    try {
      const res = await fetch(apiUrl('/api/subscriptions/customer-portal'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Failed to open portal');
      }
      const { url } = await res.json();
      window.location.href = url;
    } catch (err: any) {
      setPortalError(err.message || 'Failed to open subscription portal');
      setPortalLoading(false);
    }
  };

  const tierInfo = TIER_LABELS[tier] || { name: 'Complainant', allowance: 'subscription benefits' };

  return (
    <div className="min-h-screen bg-background font-sans pb-20">
      <OfficialHeader />

      <main className="max-w-lg mx-auto px-4 sm:px-6 pt-16">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4 }}
        >
          <div className="text-center mb-8">
            <div className="mx-auto w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mb-4">
              <CheckCircle2 className="w-8 h-8 text-green-600 dark:text-green-400" />
            </div>
            <h1 className="text-3xl font-serif font-bold text-foreground">
              Welcome, {tierInfo.name}!
            </h1>
            <p className="mt-3 text-muted-foreground">
              Your membership has been activated. You are now entitled to {tierInfo.allowance}.
            </p>
          </div>

          <OfficialCard>
            <div className="space-y-5">
              <div className="bg-green-50 dark:bg-green-950/30 p-4 rounded-lg border border-green-200 dark:border-green-800">
                <h3 className="font-semibold text-sm text-green-800 dark:text-green-300 mb-1">
                  Membership Confirmed
                </h3>
                <p className="text-sm text-green-700 dark:text-green-400">
                  <span className="font-medium">{tierInfo.name}</span> — {tierInfo.allowance}
                </p>
                {email && (
                  <p className="text-xs text-green-600 dark:text-green-500 mt-1">
                    Registered to: {email}
                  </p>
                )}
              </div>

              <p className="text-sm text-muted-foreground">
                When filing a complaint, use the same email address to automatically apply your membership allowance. Your subscription renews monthly.
              </p>

              <div className="space-y-3">
                <Button className="w-full" size="lg" onClick={() => setLocation('/file-complaint')}>
                  File a Complaint
                </Button>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={handleManageSubscription}
                  disabled={portalLoading}
                >
                  {portalLoading
                    ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Opening Portal...</>
                    : 'Manage Subscription'}
                </Button>
              </div>

              {portalError && (
                <div className="flex items-center gap-2 text-sm text-destructive">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {portalError}
                </div>
              )}
            </div>
          </OfficialCard>
        </motion.div>
      </main>
    </div>
  );
}
