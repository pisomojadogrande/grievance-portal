import { useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { Scale } from "lucide-react";

export function OfficialHeader() {
  const [location, setLocation] = useLocation();

  return (
    <header className="w-full border-b border-border bg-background/80 backdrop-blur-sm sticky top-0 z-50">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        <button 
          onClick={() => setLocation("/")} 
          className="flex items-center gap-3 hover:opacity-80 transition-opacity"
          data-testid="link-home-logo"
        >
          <div className="w-8 h-8 bg-primary text-primary-foreground flex items-center justify-center rounded-sm shadow-sm">
            <Scale className="w-5 h-5" />
          </div>
          <div className="text-left">
            <h1 className="text-sm font-bold tracking-wider uppercase font-sans leading-none">
              Complaints Dept.
            </h1>
            <p className="text-[10px] text-muted-foreground font-mono leading-none mt-1">
              EST. 2024 • OFFICIAL
            </p>
          </div>
        </button>

        <nav className="hidden md:flex items-center gap-6 text-sm font-medium">
          <button 
            onClick={() => setLocation("/")}
            className={cn(
              "cursor-pointer transition-colors hover:text-primary",
              location === "/" ? "text-primary font-semibold" : "text-muted-foreground"
            )}
            data-testid="link-home"
          >
            Home
          </button>
          <button 
            onClick={() => setLocation("/file-complaint")}
            className={cn(
              "cursor-pointer transition-colors hover:text-primary",
              location === "/file-complaint" ? "text-primary font-semibold" : "text-muted-foreground"
            )}
            data-testid="link-file-complaint"
          >
            File New Case
          </button>
        </nav>
      </div>
    </header>
  );
}
