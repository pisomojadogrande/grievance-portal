import { cn } from "@/lib/utils";
import { forwardRef } from "react";

interface OfficialCardProps extends React.HTMLAttributes<HTMLDivElement> {
  stamp?: "urgent" | "approved" | "rejected" | "received";
}

export const OfficialCard = forwardRef<HTMLDivElement, OfficialCardProps>(
  ({ className, children, stamp, ...props }, ref) => {
    return (
      <div 
        ref={ref}
        className={cn(
          "bg-white rounded-lg border border-border p-8 relative overflow-hidden paper-shadow",
          className
        )}
        {...props}
      >
        {/* Subtle texture overlay */}
        <div className="absolute inset-0 bg-noise opacity-[0.03] pointer-events-none mix-blend-multiply" />
        
        {/* Top bureaucratic marker */}
        <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none">
          <div className="w-24 h-24 border-4 border-foreground rounded-full flex items-center justify-center transform rotate-12">
            <span className="font-mono font-bold text-xs uppercase tracking-widest text-center">
              Official<br/>Record
            </span>
          </div>
        </div>

        {stamp && (
          <div className={cn(
            "absolute top-8 right-8 w-32 h-32 border-4 rounded-lg flex items-center justify-center transform -rotate-12 opacity-80 pointer-events-none z-10 mix-blend-multiply",
            stamp === "rejected" && "border-destructive text-destructive",
            stamp === "approved" && "border-green-700 text-green-700",
            stamp === "received" && "border-blue-700 text-blue-700",
            stamp === "urgent" && "border-red-600 text-red-600"
          )}>
            <div className="text-center font-black uppercase tracking-widest text-lg border-y-2 border-current py-1 w-full transform -rotate-2">
              {stamp}
            </div>
          </div>
        )}

        <div className="relative z-10">
          {children}
        </div>
      </div>
    );
  }
);

OfficialCard.displayName = "OfficialCard";
