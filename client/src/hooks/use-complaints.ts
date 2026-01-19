import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { type InsertComplaint } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

// GET /api/complaints/:id
export function useComplaint(id: number) {
  return useQuery({
    queryKey: [api.complaints.get.path, id],
    queryFn: async () => {
      const url = buildUrl(api.complaints.get.path, { id });
      const res = await fetch(url);
      
      if (!res.ok) {
        if (res.status === 404) return null;
        throw new Error("Failed to fetch complaint");
      }
      
      return api.complaints.get.responses[200].parse(await res.json());
    },
    enabled: !!id,
    refetchInterval: (query) => {
      // Poll if status is processing or received (waiting for AI)
      const data = query.state.data;
      if (data && (data.status === "processing" || data.status === "received")) return 2000;
      return false;
    },
  });
}

// POST /api/complaints
export function useCreateComplaint() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: InsertComplaint) => {
      const validated = api.complaints.create.input.parse(data);
      const res = await fetch(api.complaints.create.path, {
        method: api.complaints.create.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validated),
      });

      if (!res.ok) {
        if (res.status === 400) {
          const error = api.complaints.create.responses[400].parse(await res.json());
          throw new Error(error.message);
        }
        throw new Error("Failed to submit complaint");
      }

      return api.complaints.create.responses[201].parse(await res.json());
    },
    onSuccess: (data) => {
      toast({
        title: "Complaint Drafted",
        description: `Case #${data.id} created. Proceeding to payment.`,
      });
    },
    onError: (error) => {
      toast({
        title: "Submission Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

// POST /api/payments
export function useProcessPayment() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: { complaintId: number; paymentMethodId: string; cardLast4: string }) => {
      // We parse against the input schema defined in routes
      const validated = api.payments.process.input.parse(data);
      
      const res = await fetch(api.payments.process.path, {
        method: api.payments.process.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validated),
      });

      if (!res.ok) {
        if (res.status === 400) {
          const error = api.payments.process.responses[400].parse(await res.json());
          throw new Error(error.message);
        }
        if (res.status === 404) {
          throw new Error("Complaint record not found");
        }
        throw new Error("Payment processing failed");
      }

      return api.payments.process.responses[200].parse(await res.json());
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [api.complaints.get.path, variables.complaintId] });
      toast({
        title: "Payment Processed",
        description: "Your filing fee has been accepted. Processing complaint...",
      });
    },
    onError: (error) => {
      toast({
        title: "Payment Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}
