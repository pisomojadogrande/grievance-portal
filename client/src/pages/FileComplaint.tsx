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
import { Loader2, AlertCircle } from "lucide-react";
import { motion } from "framer-motion";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export default function FileComplaint() {
  const [, setLocation] = useLocation();
  const mutation = useCreateComplaint();

  const form = useForm<InsertComplaint>({
    resolver: zodResolver(insertComplaintSchema),
    defaultValues: {
      customerEmail: "",
      content: "",
    },
  });

  const onSubmit = (data: InsertComplaint) => {
    mutation.mutate(data, {
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
                        <Input placeholder="citizen@example.com" {...field} className="bg-background font-mono" />
                      </FormControl>
                      <FormDescription>
                        We will send official correspondence to this address.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

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

                <div className="bg-muted/30 p-4 rounded-md border border-border flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
                  <div className="text-sm text-muted-foreground">
                    <span className="font-semibold block text-foreground mb-1">Processing Fee Required</span>
                    A nominal filing fee of <strong>$5.00</strong> will be required on the next step to process this form.
                  </div>
                </div>

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
                    ) : (
                      "Proceed to Payment"
                    )}
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
