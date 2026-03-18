import { OfficialHeader } from "@/components/OfficialHeader";
import { OfficialCard } from "@/components/OfficialCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";
import { motion } from "framer-motion";
import { apiUrl } from "@/config";

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

export default function DepartmentRegister() {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
  const [adminEmail, setAdminEmail] = useState('');
  const [description, setDescription] = useState('');
  const [officialTitle, setOfficialTitle] = useState('');
  const [departmentStyle, setDepartmentStyle] = useState('');
  const [signaturePhrase, setSignaturePhrase] = useState('');
  const [promptAddendum, setPromptAddendum] = useState('');
  const [personaOpen, setPersonaOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleNameChange = (val: string) => {
    setName(val);
    if (!slugManuallyEdited) {
      setSlug(slugify(val));
    }
  };

  const handleSlugChange = (val: string) => {
    setSlugManuallyEdited(true);
    setSlug(val.toLowerCase().replace(/[^a-z0-9-]/g, ''));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim() || !slug.trim() || !adminEmail.trim()) {
      setError('Department name, slug, and admin email are required.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(apiUrl('/api/departments/register'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          slug: slug.trim(),
          adminEmail: adminEmail.trim(),
          description: description.trim() || undefined,
          officialTitle: officialTitle.trim() || undefined,
          departmentStyle: departmentStyle.trim() || undefined,
          signaturePhrase: signaturePhrase.trim() || undefined,
          promptAddendum: promptAddendum.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || 'Registration failed.');
        return;
      }
      window.location.href = data.onboardingUrl;
    } catch {
      setError('A network error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background font-sans pb-20">
      <OfficialHeader />
      <main className="max-w-2xl mx-auto px-4 sm:px-6 pt-12">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <div className="mb-8 text-center">
            <h1 className="text-3xl font-serif font-bold text-foreground">Register a Complaint Domain</h1>
            <p className="mt-2 text-muted-foreground">
              Establish your jurisdictional authority. Receive a $4 share of every $5 filing fee.
            </p>
          </div>

          <OfficialCard>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <label className="text-sm font-medium">Department Name <span className="text-destructive">*</span></label>
                <Input
                  placeholder="e.g. Department of Motor Vehicles"
                  value={name}
                  onChange={e => handleNameChange(e.target.value)}
                  className="font-mono"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Slug <span className="text-destructive">*</span></label>
                <Input
                  placeholder="e.g. dmv"
                  value={slug}
                  onChange={e => handleSlugChange(e.target.value)}
                  className="font-mono"
                />
                {slug && (
                  <p className="text-xs text-muted-foreground">
                    Admin page will be at: <span className="font-mono">/department/{slug}/admin</span>
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Admin Email <span className="text-destructive">*</span></label>
                <Input
                  type="email"
                  placeholder="your@email.com"
                  value={adminEmail}
                  onChange={e => setAdminEmail(e.target.value)}
                  className="font-mono"
                />
                <p className="text-xs text-muted-foreground">Used to set up your Stripe Connect account for receiving payouts.</p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Description <span className="text-muted-foreground text-xs">(optional)</span></label>
                <Input
                  placeholder="Brief description shown to complainants"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                />
              </div>

              <div className="border border-border rounded-md overflow-hidden">
                <button
                  type="button"
                  className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium hover:bg-muted/30 transition-colors"
                  onClick={() => setPersonaOpen(o => !o)}
                >
                  <span>Response Persona <span className="text-muted-foreground font-normal">(optional)</span></span>
                  {personaOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>
                {personaOpen && (
                  <div className="px-4 pb-4 space-y-4 border-t border-border">
                    <p className="text-xs text-muted-foreground pt-3">
                      Customize how the AI responds to complaints filed with your department.
                    </p>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Official Title</label>
                      <Input
                        placeholder="e.g. Deputy Commissioner of Vehicular Grievances"
                        value={officialTitle}
                        onChange={e => setOfficialTitle(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Response Style</label>
                      <Input
                        placeholder='e.g. "imperious and dismissive" or "sympathetic but utterly powerless"'
                        value={departmentStyle}
                        onChange={e => setDepartmentStyle(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Signature Phrase</label>
                      <Input
                        placeholder='e.g. "Per Regulation 47-C, Subsection 12"'
                        value={signaturePhrase}
                        onChange={e => setSignaturePhrase(e.target.value)}
                      />
                      <p className="text-xs text-muted-foreground">This phrase will always appear somewhere in the response.</p>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Additional Instructions</label>
                      <Textarea
                        placeholder="Any other instructions for the AI..."
                        value={promptAddendum}
                        onChange={e => setPromptAddendum(e.target.value)}
                        className="min-h-[80px] resize-none"
                      />
                    </div>
                  </div>
                )}
              </div>

              {error && (
                <div className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">
                  {error}
                </div>
              )}

              <div className="bg-muted/30 p-3 rounded-md border border-border text-xs text-muted-foreground space-y-1">
                <p>After submitting, you'll be redirected to Stripe to complete identity verification and set up payouts.</p>
                <p>You'll receive <strong className="text-foreground">$4.00</strong> for each $5 complaint filed with your department. The platform retains a $1 fee.</p>
              </div>

              <Button type="submit" size="lg" className="w-full" disabled={loading}>
                {loading ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Registering...</>
                ) : 'Register & Complete Stripe Onboarding'}
              </Button>
            </form>
          </OfficialCard>
        </motion.div>
      </main>
    </div>
  );
}
