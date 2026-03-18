import { OfficialHeader } from "@/components/OfficialHeader";
import { OfficialCard } from "@/components/OfficialCard";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Clock, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useParams, useLocation, useSearch } from "wouter";
import { motion } from "framer-motion";
import { apiUrl } from "@/config";

export default function DepartmentOnboardingComplete() {
  const params = useParams<{ slug: string }>();
  const search = useSearch();
  const [, setLocation] = useLocation();
  const [status, setStatus] = useState<'loading' | 'active' | 'pending' | 'error'>('loading');
  const [refreshLoading, setRefreshLoading] = useState(false);

  const slug = params.slug;

  // Handle reauth redirect: /department/onboarding?reauth=1&account=acct_xxx
  useEffect(() => {
    const searchParams = new URLSearchParams(search);
    if (searchParams.get('reauth') === '1') {
      const account = searchParams.get('account');
      if (account) {
        // Find the slug for this account via a fresh onboarding link
        // Since we don't have slug here, redirect to the onboarding link endpoint
        // by fetching from a generic endpoint isn't possible without the slug.
        // We'll just show a message asking the user to return to their admin page.
        setStatus('pending');
        return;
      }
    }
  }, [search]);

  useEffect(() => {
    if (!slug) return;
    fetch(apiUrl(`/api/departments/${slug}`))
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) { setStatus('error'); return; }
        setStatus(data.chargesEnabled ? 'active' : 'pending');
      })
      .catch(() => setStatus('error'));
  }, [slug]);

  const handleGetFreshLink = async () => {
    if (!slug) return;
    setRefreshLoading(true);
    try {
      const res = await fetch(apiUrl(`/api/departments/${slug}/admin/onboarding-link`));
      if (res.ok) {
        const { url } = await res.json();
        window.location.href = url;
      }
    } catch {
      // ignore
    } finally {
      setRefreshLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background font-sans pb-20">
      <OfficialHeader />
      <main className="max-w-lg mx-auto px-4 sm:px-6 pt-12">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <OfficialCard>
            {status === 'loading' && (
              <div className="flex flex-col items-center gap-4 py-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                <p className="text-muted-foreground text-sm">Verifying account status...</p>
              </div>
            )}

            {status === 'active' && (
              <div className="space-y-6 text-center py-4">
                <div className="flex justify-center">
                  <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
                    <CheckCircle2 className="h-8 w-8 text-green-600" />
                  </div>
                </div>
                <div>
                  <h1 className="text-2xl font-serif font-bold text-foreground">Your Department is Active</h1>
                  <p className="mt-2 text-muted-foreground text-sm">
                    Complaints will now be routed to your jurisdiction. Your $4 share of each filing fee will be transferred automatically.
                  </p>
                </div>
                {slug && (
                  <Button onClick={() => setLocation(`/department/${slug}/admin`)} className="w-full">
                    Go to Department Admin
                  </Button>
                )}
              </div>
            )}

            {status === 'pending' && (
              <div className="space-y-6 text-center py-4">
                <div className="flex justify-center">
                  <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center">
                    <Clock className="h-8 w-8 text-amber-600" />
                  </div>
                </div>
                <div>
                  <h1 className="text-2xl font-serif font-bold text-foreground">Onboarding In Progress</h1>
                  <p className="mt-2 text-muted-foreground text-sm">
                    Stripe is still reviewing your account. This typically takes a few minutes. Check back shortly, or return to complete any missing steps.
                  </p>
                </div>
                <div className="flex flex-col gap-2">
                  <Button
                    variant="outline"
                    onClick={handleGetFreshLink}
                    disabled={refreshLoading}
                  >
                    {refreshLoading ? (
                      <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Loading...</>
                    ) : 'Return to Complete Onboarding'}
                  </Button>
                  {slug && (
                    <Button variant="ghost" onClick={() => setLocation(`/department/${slug}/admin`)}>
                      Check Admin Page
                    </Button>
                  )}
                </div>
              </div>
            )}

            {status === 'error' && (
              <div className="text-center py-4 space-y-4">
                <h1 className="text-2xl font-serif font-bold text-foreground">Department Not Found</h1>
                <p className="text-muted-foreground text-sm">Could not locate department "{slug}".</p>
                <Button variant="outline" onClick={() => setLocation('/department/register')}>
                  Register a New Department
                </Button>
              </div>
            )}
          </OfficialCard>
        </motion.div>
      </main>
    </div>
  );
}
