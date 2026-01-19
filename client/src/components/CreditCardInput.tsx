import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CreditCard, Calendar, Lock } from "lucide-react";
import React, { useState } from "react";

interface CreditCardInputProps {
  onChange: (details: { number: string; expiry: string; cvc: string }) => void;
  disabled?: boolean;
}

export function CreditCardInput({ onChange, disabled }: CreditCardInputProps) {
  const [details, setDetails] = useState({ number: "", expiry: "", cvc: "" });

  const handleChange = (field: keyof typeof details, value: string) => {
    const newDetails = { ...details, [field]: value };
    setDetails(newDetails);
    onChange(newDetails);
  };

  return (
    <div className="space-y-4 p-6 border rounded-lg bg-muted/30">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-medium text-sm text-muted-foreground flex items-center gap-2">
          <Lock className="w-3 h-3" /> Secure Payment Simulation
        </h3>
        <div className="flex gap-2 opacity-50 grayscale">
          {/* Mock card icons */}
          <div className="w-8 h-5 bg-foreground/10 rounded" />
          <div className="w-8 h-5 bg-foreground/10 rounded" />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="cardNumber">Card Number</Label>
        <div className="relative">
          <CreditCard className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input 
            id="cardNumber"
            placeholder="0000 0000 0000 0000"
            className="pl-9 font-mono bg-background"
            maxLength={19}
            value={details.number}
            onChange={(e) => handleChange("number", e.target.value)}
            disabled={disabled}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="expiry">Expiry Date</Label>
          <div className="relative">
            <Calendar className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input 
              id="expiry"
              placeholder="MM/YY"
              className="pl-9 font-mono bg-background"
              maxLength={5}
              value={details.expiry}
              onChange={(e) => handleChange("expiry", e.target.value)}
              disabled={disabled}
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="cvc">CVC</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input 
              id="cvc"
              placeholder="123"
              className="pl-9 font-mono bg-background"
              maxLength={3}
              type="password"
              value={details.cvc}
              onChange={(e) => handleChange("cvc", e.target.value)}
              disabled={disabled}
            />
          </div>
        </div>
      </div>
      
      <p className="text-xs text-muted-foreground mt-2">
        <span className="font-bold text-primary">Note:</span> This is a simulation. No real money will be charged. Enter any 16-digit number.
      </p>
    </div>
  );
}
