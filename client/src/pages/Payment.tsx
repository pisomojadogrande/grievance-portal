import { OfficialHeader } from "@/components/OfficialHeader";
import { OfficialCard } from "@/components/OfficialCard";
import { CreditCardInput } from "@/components/CreditCardInput";
import { Button } from "@/components/ui/button";
import { useComplaint, useProcessPayment } from "@/hooks/use-complaints";
import { useRoute, useLocation } from "wouter";
import { Loader2, CheckCircle2, DollarSign } from "lucide-react";
import { motion } from "framer-motion";
import { useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";

export default function Payment() {
  const [, params] = useRoute("/payment/:id");
  const [, setLocation] = useLocation();
  const id = Number(params?.id);
  
  const { data: complaint, isLoading: isLoadingComplaint, error: complaintError } = useComplaint(id);
  const paymentMutation = useProcessPayment();
  const [cardDetails, setCardDetails] = useState({ number: "", expiry: "", cvc: "" });

  const isCardValid = cardDetails.number.length >= 15 && cardDetails.expiry.length >= 4 && cardDetails.cvc.length >= 3;

  const handlePayment = () => {
    paymentMutation.mutate({
      complaintId: id,
      paymentMethodId: "pm_mock_success", // In a real app, this comes from Stripe.js
      cardLast4: cardDetails.number.slice(-4) || "4242",
    }, {
      onSuccess: () => {
        setLocation(`/status/${id}`);
      }
    });
  };

  if (isLoadingComplaint) {
    return <PaymentSkeleton />;
  }

  if (complaintError || !complaint) {
    return <PaymentError />;
  }

  return (
    <div className="min-h-screen bg-background font-sans pb-20">
      <OfficialHeader />

      <main className="max-w-xl mx-auto px-4 sm:px-6 pt-12">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4 }}
        >
          <div className="mb-8 flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-serif font-bold text-foreground">Remit Filing Fee</h1>
              <p className="text-sm text-muted-foreground font-mono mt-1">Case #{complaint.id}</p>
            </div>
            <div className="text-right">
              <div className="text-xs text-muted-foreground uppercase tracking-wider font-bold">Amount Due</div>
              <div className="text-2xl font-mono font-bold text-foreground flex items-center justify-end">
                <DollarSign className="w-5 h-5 text-muted-foreground" />
                {(complaint.filingFee / 100).toFixed(2)}
              </div>
            </div>
          </div>

          <OfficialCard>
            <div className="space-y-6">
              <div className="bg-primary/5 p-4 rounded-lg border border-primary/10 flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-semibold text-sm">Complaint Draft Recorded</h4>
                  <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                    "{complaint.content}"
                  </p>
                </div>
              </div>

              <div className="border-t border-border my-6" />

              <CreditCardInput 
                onChange={setCardDetails} 
                disabled={paymentMutation.isPending}
              />

              <Button 
                className="w-full h-12 text-lg shadow-lg" 
                size="lg"
                onClick={handlePayment}
                disabled={!isCardValid || paymentMutation.isPending}
              >
                {paymentMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Processing Transaction...
                  </>
                ) : (
                  `Pay $${(complaint.filingFee / 100).toFixed(2)}`
                )}
              </Button>
            </div>
          </OfficialCard>
          
          <p className="text-center text-xs text-muted-foreground mt-6 max-w-sm mx-auto">
            By clicking "Pay", you agree to the non-refundable filing fee for the administrative processing of your complaint.
          </p>
        </motion.div>
      </main>
    </div>
  );
}

function PaymentSkeleton() {
  return (
    <div className="min-h-screen bg-background">
      <OfficialHeader />
      <main className="max-w-xl mx-auto px-4 pt-12">
        <div className="flex justify-between mb-8">
          <div className="space-y-2">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-24" />
          </div>
          <div className="space-y-2 flex flex-col items-end">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-8 w-24" />
          </div>
        </div>
        <Skeleton className="h-[400px] w-full rounded-lg" />
      </main>
    </div>
  );
}

function PaymentError() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <OfficialHeader />
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <div className="mx-auto w-12 h-12 bg-destructive/10 rounded-full flex items-center justify-center mb-4">
            <AlertCircle className="w-6 h-6 text-destructive" />
          </div>
          <h2 className="text-xl font-bold mb-2">Error Loading Case</h2>
          <p className="text-muted-foreground mb-6">We could not locate the complaint record. It may have expired or the ID is incorrect.</p>
          <Button asChild variant="outline">
            <a href="/">Return Home</a>
          </Button>
        </div>
      </div>
    </div>
  );
}
