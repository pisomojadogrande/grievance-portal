import { Link } from "wouter";
import { OfficialHeader } from "@/components/OfficialHeader";
import { OfficialCard } from "@/components/OfficialCard";
import { Button } from "@/components/ui/button";
import { FileText, ArrowRight, ShieldCheck, Clock } from "lucide-react";
import { motion } from "framer-motion";

export default function Home() {
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
              <Link href="/file-complaint">
                <Button size="lg" className="h-14 px-8 text-base shadow-lg shadow-primary/20 hover:shadow-primary/30 transition-all hover:-translate-y-0.5">
                  <FileText className="mr-2 h-5 w-5" />
                  File a Complaint
                </Button>
              </Link>
              <div className="flex items-center gap-2 px-4 py-2 bg-muted/50 rounded-lg border border-border/50 text-sm font-mono text-muted-foreground">
                <span>Filing Fee:</span>
                <span className="font-bold text-foreground">$5.00</span>
              </div>
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
      </main>
    </div>
  );
}
