import { OfficialHeader } from "@/components/OfficialHeader";
import { OfficialCard } from "@/components/OfficialCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useCreateComplaint } from "@/hooks/use-complaints";
import { insertComplaintSchema, type InsertComplaint } from "@shared/schema";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useLocation } from "wouter";
import { Loader2, AlertCircle, CheckCircle2, ChevronDown, ChevronUp } from "lucide-react";
import { motion } from "framer-motion";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useState, useCallback, useEffect } from "react";
import { apiUrl } from "@/config";

interface Department {
  id: number;
  name: string;
  slug: string;
  description: string | null;
}

interface SubscriptionStatus {
  active: boolean;
  tier?: string;
  complaintsUsed?: number;
  complaintsAllowed?: number | null;
}

const TIER_NAMES: Record<string, string> = {
  registered_complainant: 'Registered Complainant',
  pro_complainant: 'Pro Complainant',
};

export default function FileComplaint() {
  const [, setLocation] = useLocation();
  const mutation = useCreateComplaint();
  const [subStatus, setSubStatus] = useState<SubscriptionStatus | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [selectedDepartmentId, setSelectedDepartmentId] = useState<number | null>(null);
  const [routingExpanded, setRoutingExpanded] = useState(false);

  useEffect(() => {
    fetch(apiUrl('/api/departments'))
      .then(r => r.ok ? r.json() : [])
      .then(setDepartments)
      .catch(() => setDepartments([]));
  }, []);

  const hasAllowanceRemaining = subStatus?.active && (
    subStatus.complaintsAllowed === null ||
    (subStatus.complaintsUsed ?? 0) < (subStatus.complaintsAllowed ?? 0)
  );

  const handleEmailBlur = useCallback(async (email: string) => {
    if (!email || !email.includes('@')) {
      setSubStatus(null);
      return;
    }
    try {
      const res = await fetch(apiUrl(`/api/subscriptions/status?email=${encodeURIComponent(email)}`));
      if (res.ok) setSubStatus(await res.json());
      else setSubStatus(null);
    } catch {
      setSubStatus(null);
    }
  }, []);

  const form = useForm<InsertComplaint>({
    resolver: zodResolver(insertComplaintSchema),
    defaultValues: {
      customerEmail: "",
      content: "",
      departmentId: null,
    },
  });

  const onSubmit = (data: InsertComplaint) => {
    mutation.mutate({ ...data, departmentId: selectedDepartmentId }, {
      onSuccess: (complaint) => {
        setLocation(`/payment/${complaint.id}`);
      },
    });
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
            <h1 className="text-3xl font-serif font-bold text-foreground">File a Grievance</h1>
            <p className="mt-2 text-muted-foreground">Please provide detailed information regarding your dissatisfaction.</p>
          </div>

          <OfficialCard>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
                <FormField
                  control={form.control}
                  name="customerEmail"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email Address</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="citizen@example.com"
                          {...field}
                          className="bg-background font-mono"
                          onBlur={e => { field.onBlur(); handleEmailBlur(e.target.value); }}
                        />
                      </FormControl>
                      {hasAllowanceRemaining ? (
                        <div className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400 mt-1">
                          <CheckCircle2 className="w-4 h-4 shrink-0" />
                          <span>
                            {TIER_NAMES[subStatus!.tier!] ?? subStatus!.tier} —{' '}
                            {subStatus!.complaintsAllowed === null
                              ? 'unlimited complaints remaining'
                              : `${Math.max(0, (subStatus!.complaintsAllowed ?? 0) - (subStatus!.complaintsUsed ?? 0))} of ${subStatus!.complaintsAllowed} complaints remaining this month`}
                          </span>
                        </div>
                      ) : subStatus?.active ? (
                        <FormDescription>
                          Your valued {TIER_NAMES[subStatus.tier!] ?? subStatus.tier} membership is on file and deeply appreciated. Regrettably, your allotted complaint quota for the current billing period has been fully expended. You are, of course, welcome to remit the standard filing fee below.
                        </FormDescription>
                      ) : (
                        <FormDescription>
                          We will send official correspondence to this address.
                        </FormDescription>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {departments.length > 0 && (
                  <div className="border border-border rounded-md overflow-hidden">
                    <button
                      type="button"
                      className="w-full flex items-center justify-between px-4 py-3 bg-muted/30 hover:bg-muted/50 transition-colors text-left"
                      onClick={() => setRoutingExpanded(e => !e)}
                    >
                      <div>
                        <div className="text-sm font-medium flex items-center gap-2">
                          Premium Grievance Routing
                          {selectedDepartmentId !== null && (
                            <span className="text-xs font-normal bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                              {departments.find(d => d.id === selectedDepartmentId)?.name}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">Participating departments have been certified by the Bureau to receive complaints within their designated area of expertise. Standard filing fee applies.</div>
                      </div>
                      {routingExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0 ml-3" /> : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0 ml-3" />}
                    </button>
                    {routingExpanded && (
                      <div className="p-3 grid gap-2 border-t border-border">
                        <div
                          className={`flex items-center gap-3 p-3 rounded-md border cursor-pointer transition-colors ${selectedDepartmentId === null ? 'border-primary bg-primary/5' : 'border-border hover:border-muted-foreground/50'}`}
                          onClick={() => setSelectedDepartmentId(null)}
                        >
                          <div className={`w-3 h-3 rounded-full border-2 flex-shrink-0 ${selectedDepartmentId === null ? 'border-primary bg-primary' : 'border-muted-foreground'}`} />
                          <div>
                            <div className="text-sm font-medium">None — General Grievance Filing</div>
                            <div className="text-xs text-muted-foreground">Standard platform processing</div>
                          </div>
                        </div>
                        {departments.map(dept => (
                          <div
                            key={dept.id}
                            className={`flex items-center gap-3 p-3 rounded-md border cursor-pointer transition-colors ${selectedDepartmentId === dept.id ? 'border-primary bg-primary/5' : 'border-border hover:border-muted-foreground/50'}`}
                            onClick={() => setSelectedDepartmentId(dept.id)}
                          >
                            <div className={`w-3 h-3 rounded-full border-2 flex-shrink-0 ${selectedDepartmentId === dept.id ? 'border-primary bg-primary' : 'border-muted-foreground'}`} />
                            <div>
                              <div className="text-sm font-medium">{dept.name}</div>
                              {dept.description && <div className="text-xs text-muted-foreground">{dept.description}</div>}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <FormField
                  control={form.control}
                  name="content"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nature of Complaint</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="Please describe your grievance in detail..." 
                          className="min-h-[200px] bg-background font-mono leading-relaxed resize-none"
                          {...field} 
                        />
                      </FormControl>
                      <FormDescription>
                        Minimum 10 characters. Be specific.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {hasAllowanceRemaining ? (
                  <div className="bg-green-50 dark:bg-green-950/30 p-4 rounded-md border border-green-200 dark:border-green-800 flex items-start gap-3">
                    <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400 shrink-0 mt-0.5" />
                    <div className="text-sm text-green-700 dark:text-green-400">
                      <span className="font-semibold block text-green-800 dark:text-green-300 mb-1">Membership Covers This Filing</span>
                      No payment required. This complaint will be filed against your membership allowance.
                    </div>
                  </div>
                ) : (
                  <div className="bg-muted/30 p-4 rounded-md border border-border flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
                    <div className="text-sm text-muted-foreground">
                      <span className="font-semibold block text-foreground mb-1">Processing Fee Required</span>
                      A nominal filing fee of <strong>$5.00</strong> will be required on the next step to process this form.
                    </div>
                  </div>
                )}

                <p className="text-xs text-center text-muted-foreground italic">
                  This is a satirical demo site. By default, test payments use Stripe sandbox. A real payment option ($0.50) is available at checkout.
                </p>

                <div className="flex justify-end pt-4 border-t border-border">
                  <Button 
                    type="submit" 
                    size="lg" 
                    className="w-full sm:w-auto"
                    disabled={mutation.isPending}
                  >
                    {mutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Drafting Record...
                      </>
                    ) : hasAllowanceRemaining ? "Proceed" : "Proceed to Payment"
                    }
                  </Button>
                </div>
              </form>
            </Form>
          </OfficialCard>

          <p className="text-center text-xs text-muted-foreground mt-8 font-mono">
            Form ID: COMP-INTAKE-V4 • Rev. 2024
          </p>
        </motion.div>
      </main>
    </div>
  );
}
