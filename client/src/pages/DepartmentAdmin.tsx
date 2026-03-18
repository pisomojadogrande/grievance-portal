import { OfficialHeader } from "@/components/OfficialHeader";
import { OfficialCard } from "@/components/OfficialCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, ExternalLink, CheckCircle2, Clock, ChevronDown, ChevronUp } from "lucide-react";
import { useEffect, useState } from "react";
import { useParams } from "wouter";
import { motion } from "framer-motion";
import { apiUrl } from "@/config";

interface Complaint {
  id: number;
  content: string;
  customerEmail: string;
  status: string;
  aiResponse: string | null;
  complexityScore: number | null;
  createdAt: string;
}

interface Department {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  chargesEnabled: boolean;
  officialTitle: string | null;
  departmentStyle: string | null;
  signaturePhrase: string | null;
  promptAddendum: string | null;
  applicationFeeAmount: number;
  complaints: Complaint[];
}

export default function DepartmentAdmin() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;

  const [dept, setDept] = useState<Department | null>(null);
  const [loading, setLoading] = useState(true);
  const [saveLoading, setSaveLoading] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [dashboardLoading, setDashboardLoading] = useState(false);

  const [officialTitle, setOfficialTitle] = useState('');
  const [departmentStyle, setDepartmentStyle] = useState('');
  const [signaturePhrase, setSignaturePhrase] = useState('');
  const [promptAddendum, setPromptAddendum] = useState('');
  const [applicationFeeAmount, setApplicationFeeAmount] = useState('100');

  const [expandedComplaint, setExpandedComplaint] = useState<number | null>(null);

  useEffect(() => {
    if (!slug) return;
    fetch(apiUrl(`/api/departments/${slug}/admin`))
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) {
          setDept(data);
          setOfficialTitle(data.officialTitle || '');
          setDepartmentStyle(data.departmentStyle || '');
          setSignaturePhrase(data.signaturePhrase || '');
          setPromptAddendum(data.promptAddendum || '');
          setApplicationFeeAmount(String(data.applicationFeeAmount ?? 100));
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [slug]);

  const handleSaveSettings = async () => {
    if (!slug) return;
    setSaveLoading(true);
    setSaveSuccess(false);
    try {
      const res = await fetch(apiUrl(`/api/departments/${slug}/admin/settings`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          officialTitle: officialTitle || null,
          departmentStyle: departmentStyle || null,
          signaturePhrase: signaturePhrase || null,
          promptAddendum: promptAddendum || null,
          applicationFeeAmount: Number(applicationFeeAmount) || 100,
        }),
      });
      if (res.ok) setSaveSuccess(true);
    } catch {
      // ignore
    } finally {
      setSaveLoading(false);
    }
  };

  const handleOpenDashboard = async () => {
    if (!slug) return;
    setDashboardLoading(true);
    try {
      const res = await fetch(apiUrl(`/api/departments/${slug}/admin/onboarding-link`));
      if (res.ok) {
        const { url } = await res.json();
        window.open(url, '_blank');
      }
    } catch {
      // ignore
    } finally {
      setDashboardLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!dept) {
    return (
      <div className="min-h-screen bg-background font-sans">
        <OfficialHeader />
        <main className="max-w-2xl mx-auto px-4 pt-12 text-center">
          <h1 className="text-2xl font-serif font-bold">Department Not Found</h1>
          <p className="text-muted-foreground mt-2">No department with slug "{slug}".</p>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background font-sans pb-20">
      <OfficialHeader />
      <main className="max-w-3xl mx-auto px-4 sm:px-6 pt-12 space-y-8">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          {/* Header */}
          <OfficialCard>
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="flex-1">
                <h1 className="text-2xl font-serif font-bold">{dept.name}</h1>
                <div className="flex items-center gap-2 mt-1">
                  {dept.chargesEnabled ? (
                    <span className="inline-flex items-center gap-1 text-xs text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
                      <CheckCircle2 className="h-3 w-3" /> Active
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                      <Clock className="h-3 w-3" /> Pending Onboarding
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground font-mono">/department/{dept.slug}/admin</span>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleOpenDashboard}
                disabled={dashboardLoading}
              >
                {dashboardLoading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <ExternalLink className="mr-2 h-4 w-4" />
                )}
                Stripe Dashboard
              </Button>
            </div>
          </OfficialCard>

          {/* Persona Settings */}
          <OfficialCard>
            <div className="space-y-5">
              <h2 className="font-serif font-semibold text-lg">Response Persona</h2>
              <div className="space-y-4">
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
                    placeholder='e.g. "imperious and dismissive"'
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
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Additional Instructions</label>
                  <Textarea
                    placeholder="Freeform instructions for the AI..."
                    value={promptAddendum}
                    onChange={e => setPromptAddendum(e.target.value)}
                    className="min-h-[80px] resize-none"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Application Fee (cents)</label>
                  <Input
                    type="number"
                    min="1"
                    max="499"
                    value={applicationFeeAmount}
                    onChange={e => setApplicationFeeAmount(e.target.value)}
                    className="font-mono w-32"
                  />
                  <p className="text-xs text-muted-foreground">
                    Platform keeps this amount; you receive the rest. Default: 100 ($1.00).
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Button onClick={handleSaveSettings} disabled={saveLoading}>
                  {saveLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving...</> : 'Save Settings'}
                </Button>
                {saveSuccess && (
                  <span className="text-sm text-green-600 flex items-center gap-1">
                    <CheckCircle2 className="h-4 w-4" /> Saved
                  </span>
                )}
              </div>
            </div>
          </OfficialCard>

          {/* Complaints */}
          <OfficialCard>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-serif font-semibold text-lg">Complaints Filed</h2>
                <span className="text-sm text-muted-foreground">{dept.complaints.length} total</span>
              </div>
              {dept.complaints.length === 0 ? (
                <p className="text-muted-foreground text-sm text-center py-8">No complaints filed with this department yet.</p>
              ) : (
                <div className="space-y-3">
                  {dept.complaints.map(complaint => (
                    <div key={complaint.id} className="border border-border rounded-md overflow-hidden">
                      <div
                        className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors"
                        onClick={() => setExpandedComplaint(expandedComplaint === complaint.id ? null : complaint.id)}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="font-mono text-xs text-muted-foreground shrink-0">#{complaint.id}</span>
                          <span className="text-sm font-medium truncate">{complaint.customerEmail}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${
                            complaint.status === 'resolved' ? 'bg-green-100 text-green-700' :
                            complaint.status === 'received' ? 'bg-blue-100 text-blue-700' :
                            'bg-muted text-muted-foreground'
                          }`}>{complaint.status}</span>
                          {complaint.complexityScore !== null && (
                            <span className="text-xs text-muted-foreground shrink-0">Score: {complaint.complexityScore}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0 ml-2">
                          <span className="text-xs text-muted-foreground hidden sm:block">
                            {new Date(complaint.createdAt).toLocaleDateString()}
                          </span>
                          {expandedComplaint === complaint.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </div>
                      </div>
                      {expandedComplaint === complaint.id && (
                        <div className="px-4 pb-4 border-t border-border space-y-3">
                          <div>
                            <p className="text-xs font-medium text-muted-foreground mt-3 mb-1">COMPLAINT</p>
                            <p className="text-sm whitespace-pre-wrap">{complaint.content}</p>
                          </div>
                          {complaint.aiResponse && (
                            <div>
                              <p className="text-xs font-medium text-muted-foreground mb-1">AI RESPONSE</p>
                              <p className="text-sm whitespace-pre-wrap text-muted-foreground">{complaint.aiResponse}</p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </OfficialCard>
        </motion.div>
      </main>
    </div>
  );
}
