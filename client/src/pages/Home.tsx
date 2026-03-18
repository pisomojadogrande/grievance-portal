import { Link, useLocation } from "wouter";
import { OfficialHeader } from "@/components/OfficialHeader";
import { OfficialCard } from "@/components/OfficialCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FileText, ShieldCheck, Clock, Star, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { motion } from "framer-motion";
import { useState } from "react";
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

export default function Home() {
  const [, setLocation] = useLocation();
  const [manageEmail, setManageEmail] = useState('');
  const [subStatus, setSubStatus] = useState<SubscriptionStatus | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);

  const handleLookup = async () => {
    if (!manageEmail) return;
    setLookupLoading(true);
    setLookupError(null);
    setSubStatus(null);
    try {
      const res = await fetch(apiUrl(`/api/subscriptions/status?email=${encodeURIComponent(manageEmail)}`));
      if (!res.ok) throw new Error('Failed to look up subscription');
      setSubStatus(await res.json());
    } catch {
      setLookupError('Could not retrieve subscription status. Please try again.');
    } finally {
      setLookupLoading(false);
    }
  };

  const handleManagePortal = async () => {
    setPortalLoading(true);
    try {
      const res = await fetch(apiUrl('/api/subscriptions/customer-portal'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: manageEmail }),
      });
      if (!res.ok) throw new Error('Failed to open portal');
      const { url } = await res.json();
      window.location.href = url;
    } catch {
      setLookupError('Could not open the subscription portal. Please try again.');
      setPortalLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background font-sans">
      <OfficialHeader />
      
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-12 md:py-20">
        <div className="grid md:grid-cols-2 gap-12 items-center">
          
          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6 }}
            className="space-y-8"
          >
            <div>
              <div className="inline-block px-3 py-1 bg-primary/5 text-primary rounded-full text-xs font-mono font-medium mb-4">
                OFFICIAL GRIEVANCE CHANNEL
              </div>
              <h1 className="text-5xl md:text-6xl font-serif text-foreground leading-[1.1]">
                The Complaints Department
              </h1>
              <p className="mt-6 text-lg text-muted-foreground leading-relaxed max-w-md">
                We are listening. For a nominal administrative fee, your grievances will be officially recorded, categorized, and processed by our advanced bureaucratic systems.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-4">
              <Button
                size="lg"
                className="h-14 px-8 text-base shadow-lg shadow-primary/20 hover:shadow-primary/30 transition-all hover:-translate-y-0.5"
                onClick={() => setLocation("/file-complaint")}
                data-testid="button-file-complaint"
              >
                <FileText className="mr-2 h-5 w-5" />
                File a Complaint
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="h-14 px-8 text-base transition-all hover:-translate-y-0.5"
                onClick={() => setLocation("/subscribe")}
              >
                <Star className="mr-2 h-5 w-5" />
                Subscribe
              </Button>
            </div>
            <div className="text-center sm:text-left">
              <button
                onClick={() => setLocation("/department/register")}
                className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
              >
                Register a Complaint Domain →
              </button>
            </div>
            <div className="flex items-center gap-2 px-4 py-2 bg-muted/50 rounded-lg border border-border/50 text-sm font-mono text-muted-foreground w-fit">
              <span>Filing Fee:</span>
              <span className="font-bold text-foreground">$5.00</span>
              <span className="text-muted-foreground">or from</span>
              <span className="font-bold text-foreground">$3/mo</span>
            </div>

            <div className="grid grid-cols-2 gap-6 pt-8 border-t border-dashed">
              <div className="flex gap-3">
                <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
                  <ShieldCheck className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <h4 className="font-medium text-sm">Secure Processing</h4>
                  <p className="text-xs text-muted-foreground mt-1">Encrypted transactions</p>
                </div>
              </div>
              <div className="flex gap-3">
                <div className="w-10 h-10 rounded-full bg-amber-50 flex items-center justify-center shrink-0">
                  <Clock className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <h4 className="font-medium text-sm">Timely Response</h4>
                  <p className="text-xs text-muted-foreground mt-1">Automated review</p>
                </div>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="relative"
          >
            <div className="absolute inset-0 bg-gradient-to-tr from-primary/5 to-transparent rounded-full blur-3xl transform -translate-y-12" />
            <OfficialCard className="transform rotate-2 hover:rotate-0 transition-transform duration-500">
              <div className="space-y-6">
                <div className="flex justify-between items-start border-b border-border pb-4">
                  <div>
                    <h3 className="font-mono text-xs uppercase text-muted-foreground">Form 72-B</h3>
                    <div className="text-lg font-serif font-bold mt-1">Official Complaint Record</div>
                  </div>
                  <div className="w-12 h-12 border border-foreground/20 rounded-full flex items-center justify-center">
                    <div className="w-8 h-8 border border-foreground/20 rounded-full" />
                  </div>
                </div>
                
                <div className="space-y-4 font-mono text-sm opacity-60">
                  <div className="h-4 bg-muted rounded w-3/4" />
                  <div className="h-4 bg-muted rounded w-full" />
                  <div className="h-4 bg-muted rounded w-5/6" />
                  <div className="h-4 bg-muted rounded w-1/2" />
                </div>

                <div className="pt-6 flex justify-end">
                  <div className="border-2 border-primary/20 text-primary/40 px-4 py-2 font-black uppercase text-xs transform -rotate-12 select-none">
                    For Internal Use Only
                  </div>
                </div>
              </div>
            </OfficialCard>
          </motion.div>

        </div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="mt-16 max-w-lg mx-auto"
        >
          <OfficialCard>
            <div className="space-y-4">
              <div>
                <h3 className="font-serif font-semibold text-foreground">Manage Your Subscription</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Enter your email to view or cancel your membership.
                </p>
              </div>
              <div className="flex gap-2">
                <Input
                  type="email"
                  placeholder="your@email.com"
                  value={manageEmail}
                  onChange={e => { setManageEmail(e.target.value); setSubStatus(null); setLookupError(null); }}
                  onKeyDown={e => e.key === 'Enter' && handleLookup()}
                  className="font-mono"
                />
                <Button
                  variant="outline"
                  onClick={handleLookup}
                  disabled={!manageEmail || lookupLoading}
                >
                  {lookupLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Look Up'}
                </Button>
              </div>

              {lookupError && (
                <div className="flex items-center gap-2 text-sm text-destructive">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {lookupError}
                </div>
              )}

              {subStatus && !subStatus.active && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  No active subscription found for this email.
                </div>
              )}

              {subStatus?.active && (
                <div className="bg-green-50 dark:bg-green-950/30 rounded-md border border-green-200 dark:border-green-800 p-3 space-y-3">
                  <div className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span className="font-medium">{TIER_NAMES[subStatus.tier!] ?? subStatus.tier}</span>
                  </div>
                  <div className="text-xs text-green-700 dark:text-green-400 space-y-0.5">
                    {subStatus.complaintsAllowed === null ? (
                      <div>Unlimited complaints/month</div>
                    ) : (
                      <div>
                        {Math.max(0, (subStatus.complaintsAllowed ?? 0) - (subStatus.complaintsUsed ?? 0))} of {subStatus.complaintsAllowed} complaints remaining this period
                      </div>
                    )}
                    {subStatus.currentPeriodEnd && (
                      <div>Renews {new Date(subStatus.currentPeriodEnd).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</div>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full border-green-300 dark:border-green-700 text-green-700 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/30"
                    onClick={handleManagePortal}
                    disabled={portalLoading}
                  >
                    {portalLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Opening portal...</> : 'Manage Subscription'}
                  </Button>
                </div>
              )}
            </div>
          </OfficialCard>
        </motion.div>

      </main>
    </div>
  );
}
