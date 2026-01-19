import { OfficialHeader } from "@/components/OfficialHeader";
import { OfficialCard } from "@/components/OfficialCard";
import { Button } from "@/components/ui/button";
import { useComplaint } from "@/hooks/use-complaints";
import { useRoute } from "wouter";
import { Loader2, FileCheck, RefreshCcw } from "lucide-react";
import { motion } from "framer-motion";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";

export default function Status() {
  const [, params] = useRoute("/status/:id");
  const id = Number(params?.id);
  const { data: complaint, isLoading, refetch } = useComplaint(id);

  if (isLoading) return <StatusSkeleton />;
  if (!complaint) return <StatusError />;

  const isProcessing = complaint.status === "received" || complaint.status === "processing";
  const isResolved = complaint.status === "resolved";

  // Use a query effect to poll if not resolved
  const { data: pollingData } = useComplaint(id, {
    enabled: !isResolved,
    refetchInterval: isResolved ? false : 3000, // Poll every 3 seconds until resolved
  });

  // Update complaint with polling data if available
  const displayComplaint = isResolved ? complaint : (pollingData || complaint);

  return (
    <div className="min-h-screen bg-background font-sans pb-20">
      <OfficialHeader />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 pt-12">
        <div className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-serif font-bold text-foreground">Case Status</h1>
            <p className="text-sm text-muted-foreground font-mono mt-1">
              Reference #{displayComplaint.id} • Filed on {format(new Date(displayComplaint.createdAt || new Date()), "MMM dd, yyyy")}
            </p>
          </div>
          
          <div className="flex items-center gap-2">
             <div className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-xs font-bold uppercase tracking-wide border border-green-200">
               Fee Paid
             </div>
             {isResolved && (
               <div className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-bold uppercase tracking-wide border border-blue-200">
                 Resolved
               </div>
             )}
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Main Content: The Response */}
          <div className="lg:col-span-2 space-y-6">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              <OfficialCard stamp={isResolved ? "received" : undefined} className="min-h-[400px]">
                <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-6 border-b pb-2">
                  Official Correspondence
                </h3>

                {isProcessing ? (
                  <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
                    <Loader2 className="w-10 h-10 animate-spin text-primary/50" />
                    <div>
                      <h4 className="font-medium text-lg">Bureaucratic Review in Progress</h4>
                      <p className="text-muted-foreground max-w-xs mx-auto mt-2">
                        Our advanced algorithms are carefully considering the nuances of your grievance. This may take a moment.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="prose prose-sm md:prose-base max-w-none font-serif leading-relaxed text-foreground/90">
                    {/* Render newlines correctly */}
                    {displayComplaint.aiResponse?.split('\n').map((paragraph, i) => (
                      <p key={i} className="mb-4">{paragraph}</p>
                    ))}
                    
                    <div className="mt-12 pt-8 border-t border-dashed border-border/50">
                      <div className="flex items-center gap-4">
                        <div className="h-12 w-12 border-2 border-primary/20 rounded-full flex items-center justify-center font-serif italic text-primary/40 text-xs text-center">
                          AI<br/>Signed
                        </div>
                        <div className="font-mono text-xs text-muted-foreground">
                          <div>Digitally Signed by Automated Agent #883</div>
                          <div>Complaints Department • Division of Grievances</div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </OfficialCard>
            </motion.div>
          </div>

          {/* Sidebar: Metadata */}
          <div className="space-y-6">
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
            >
              <div className="bg-card border border-border rounded-lg p-6 space-y-6">
                <div>
                  <h4 className="text-xs font-bold uppercase text-muted-foreground mb-2">Original Complaint</h4>
                  <p className="text-sm text-foreground/80 italic border-l-2 border-muted pl-3 py-1">
                    "{complaint.content}"
                  </p>
                </div>

                <Separator />

                <div>
                  <h4 className="text-xs font-bold uppercase text-muted-foreground mb-2">Case Metadata</h4>
                  <dl className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Complexity Score</dt>
                      <dd className="font-mono font-bold">
                        {displayComplaint.complexityScore ?? "Calculating..."}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Filing Fee</dt>
                      <dd className="font-mono">$5.00</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Customer</dt>
                      <dd className="truncate max-w-[120px]" title={displayComplaint.customerEmail}>
                        {displayComplaint.customerEmail}
                      </dd>
                    </div>
                  </dl>
                </div>

                <div className="pt-2">
                  <Button variant="outline" className="w-full text-xs" onClick={() => window.print()}>
                    <FileCheck className="w-3 h-3 mr-2" />
                    Print Official Record
                  </Button>
                </div>
              </div>
              
              <div className="mt-6 text-center">
                <Button variant="ghost" className="text-xs text-muted-foreground hover:text-foreground" onClick={() => window.location.href = "/"}>
                  Return to Home
                </Button>
              </div>
            </motion.div>
          </div>
        </div>
      </main>
    </div>
  );
}

function StatusSkeleton() {
  return (
    <div className="min-h-screen bg-background">
      <OfficialHeader />
      <main className="max-w-4xl mx-auto px-4 pt-12">
        <div className="space-y-4 mb-8">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-4 w-48" />
        </div>
        <div className="grid lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2">
            <Skeleton className="h-[500px] w-full rounded-lg" />
          </div>
          <div className="space-y-4">
            <Skeleton className="h-[300px] w-full rounded-lg" />
          </div>
        </div>
      </main>
    </div>
  );
}

function StatusError() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <OfficialHeader />
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="text-center">
           <h2 className="text-lg font-bold">Case Not Found</h2>
           <Button className="mt-4" onClick={() => window.location.href = "/"}>Home</Button>
        </div>
      </div>
    </div>
  );
}
