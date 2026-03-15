import { OfficialHeader } from "@/components/OfficialHeader";
import { OfficialCard } from "@/components/OfficialCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { motion } from "framer-motion";
import { useState } from "react";
import { loadStripe, Stripe } from "@stripe/stripe-js";
import { EmbeddedCheckoutProvider, EmbeddedCheckout } from "@stripe/react-stripe-js";
import { apiUrl } from "@/config";

type Tier = 'registered_complainant' | 'pro_complainant';

const TIERS = [
  {
    id: 'registered_complainant' as Tier,
    name: 'Registered Complainant',
    testPrice: '$3',
    livePrice: '$0.30',
    period: '/month',
    allowance: '3 complaints per month',
    description: 'For the occasional aggrieved party.',
    badge: 'STANDARD',
  },
  {
    id: 'pro_complainant' as Tier,
    name: 'Pro Complainant',
    testPrice: '$8',
    livePrice: '$0.80',
    period: '/month',
    allowance: 'Unlimited complaints',
    description: 'For the chronically dissatisfied.',
    badge: 'UNLIMITED',
  },
];

// Lazily loads a Stripe instance, cached per mode.
function makeStripeLoader(configUrl: string): () => Promise<Stripe | null> {
  let promise: Promise<Stripe | null> | null = null;
  return () => {
    if (!promise) {
      promise = fetch(apiUrl(configUrl))
        .then(res => res.ok ? res.json() : Promise.reject(new Error('Failed to load config')))
        .then(({ publishableKey }: { publishableKey: string }) => loadStripe(publishableKey))
        .catch(() => null);
    }
    return promise;
  };
}

const getTestStripe = makeStripeLoader('/api/stripe/config');
const getLiveStripe = makeStripeLoader('/api/stripe/live-config');

export default function Subscribe() {
  const [selectedTier, setSelectedTier] = useState<Tier | null>(null);
  const [email, setEmail] = useState('');

  const [testClientSecret, setTestClientSecret] = useState<string | null>(null);
  const [testLoading, setTestLoading] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);

  const [liveClientSecret, setLiveClientSecret] = useState<string | null>(null);
  const [liveLoading, setLiveLoading] = useState(false);
  const [liveError, setLiveError] = useState<string | null>(null);

  const handleTierSelect = (tier: Tier) => {
    setSelectedTier(tier);
    setTestClientSecret(null);
    setLiveClientSecret(null);
    setTestError(null);
    setLiveError(null);
  };

  const handleSubscribe = async (mode: 'test' | 'live') => {
    if (!email || !selectedTier) return;
    const tier = selectedTier;
    const emailValue = email;
    const setLoading = mode === 'test' ? setTestLoading : setLiveLoading;
    const setError = mode === 'test' ? setTestError : setLiveError;
    const setClientSecret = mode === 'test' ? setTestClientSecret : setLiveClientSecret;
    const endpoint = mode === 'test'
      ? '/api/subscriptions/create-checkout-session'
      : '/api/subscriptions/create-live-checkout-session';

    setLoading(true);
    setError(null);
    try {
      const [res] = await Promise.all([
        fetch(apiUrl(endpoint), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: emailValue, tier }),
        }),
        mode === 'test' ? getTestStripe() : getLiveStripe(),
      ]);

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Failed to create checkout session');
      }

      const { clientSecret: secret } = await res.json();
      sessionStorage.setItem('subscribe_email', emailValue);
      sessionStorage.setItem('subscribe_tier', tier);
      setClientSecret(secret);
    } catch (err: any) {
      setError(err.message || 'Failed to initialize payment');
    } finally {
      setLoading(false);
    }
  };

  const tierInfo = TIERS.find(t => t.id === selectedTier);

  return (
    <div className="min-h-screen bg-background font-sans pb-20">
      <OfficialHeader />

      <main className="max-w-2xl mx-auto px-4 sm:px-6 pt-12">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <div className="mb-8 text-center">
            <div className="inline-block px-3 py-1 bg-primary/5 text-primary rounded-full text-xs font-mono font-medium mb-4">
              MEMBERSHIP TIERS
            </div>
            <h1 className="text-3xl font-serif font-bold text-foreground">Subscribe to The Complaints Department</h1>
            <p className="mt-3 text-muted-foreground">
              File complaints at a reduced rate with a monthly membership.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 gap-4 mb-8">
            {TIERS.map(tier => (
              <button
                key={tier.id}
                onClick={() => handleTierSelect(tier.id)}
                className={`text-left rounded-lg border-2 p-5 transition-all ${
                  selectedTier === tier.id
                    ? 'border-primary bg-primary/5'
                    : 'border-border bg-card hover:border-primary/50'
                }`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="text-xs font-mono font-bold text-muted-foreground">{tier.badge}</div>
                  {selectedTier === tier.id && <CheckCircle2 className="w-4 h-4 text-primary" />}
                </div>
                <div className="font-serif font-bold text-lg text-foreground">{tier.name}</div>
                <div className="mt-1 mb-3">
                  <span className="text-2xl font-bold text-foreground">{tier.testPrice}</span>
                  <span className="text-muted-foreground text-sm">{tier.period}</span>
                </div>
                <div className="text-sm font-medium text-foreground">{tier.allowance}</div>
                <div className="text-xs text-muted-foreground mt-1">{tier.description}</div>
              </button>
            ))}
          </div>

          {selectedTier && !testClientSecret && !liveClientSecret && (
            <OfficialCard>
              <div className="space-y-4">
                <h3 className="font-serif font-semibold text-foreground">
                  Subscribe: {tierInfo?.name}
                </h3>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">
                    Email Address
                  </label>
                  <Input
                    type="email"
                    placeholder="your@email.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSubscribe('test')}
                  />
                  <p className="text-xs text-muted-foreground mt-1.5">
                    Your email will be used to identify your subscription when filing complaints.
                  </p>
                </div>

                {/* Test payment — primary */}
                <div className="space-y-2">
                  {testError && (
                    <div className="flex items-center gap-2 text-sm text-destructive">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      {testError}
                    </div>
                  )}
                  <Button
                    className="w-full"
                    size="lg"
                    onClick={() => handleSubscribe('test')}
                    disabled={!email || testLoading}
                  >
                    {testLoading
                      ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Loading...</>
                      : `Subscribe (Test) — ${tierInfo?.testPrice}/month`}
                  </Button>
                  <p className="text-xs text-muted-foreground text-center">
                    Sandbox mode — use card 4242 4242 4242 4242. No real charge.
                  </p>
                </div>

                {/* Live payment — secondary */}
                <div className="border-t border-border pt-4 space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Real Payment</p>
                  {liveError && (
                    <div className="flex items-center gap-2 text-sm text-destructive">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      {liveError}
                    </div>
                  )}
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => handleSubscribe('live')}
                    disabled={!email || liveLoading}
                  >
                    {liveLoading
                      ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Loading...</>
                      : `Subscribe (Real) — ${tierInfo?.livePrice}/month`}
                  </Button>
                  <p className="text-xs text-muted-foreground text-center">
                    This is a real charge of {tierInfo?.livePrice}/month to your card.
                  </p>
                </div>
              </div>
            </OfficialCard>
          )}

          {testClientSecret && (
            <OfficialCard>
              <div className="space-y-4">
                <EmbeddedCheckoutProvider
                  stripe={getTestStripe()}
                  options={{ clientSecret: testClientSecret }}
                >
                  <EmbeddedCheckout />
                </EmbeddedCheckoutProvider>
                <p className="text-xs text-muted-foreground text-center">
                  Complete your subscription above. You'll be redirected automatically.
                </p>
              </div>
            </OfficialCard>
          )}

          {liveClientSecret && (
            <OfficialCard>
              <div className="space-y-4">
                <EmbeddedCheckoutProvider
                  stripe={getLiveStripe()}
                  options={{ clientSecret: liveClientSecret }}
                >
                  <EmbeddedCheckout />
                </EmbeddedCheckoutProvider>
                <p className="text-xs text-muted-foreground text-center">
                  Complete your real subscription above. You'll be redirected automatically.
                </p>
              </div>
            </OfficialCard>
          )}
        </motion.div>
      </main>
    </div>
  );
}
