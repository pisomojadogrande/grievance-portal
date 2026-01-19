import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { Scale } from "lucide-react";

export function OfficialHeader() {
  const [location] = useLocation();

  return (
    <header className="w-full border-b border-border bg-background/80 backdrop-blur-sm sticky top-0 z-50">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
          <div className="w-8 h-8 bg-primary text-primary-foreground flex items-center justify-center rounded-sm shadow-sm">
            <Scale className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-wider uppercase font-sans leading-none">
              Complaints Dept.
            </h1>
            <p className="text-[10px] text-muted-foreground font-mono leading-none mt-1">
              EST. 2024 • OFFICIAL
            </p>
          </div>
        </Link>

        <nav className="hidden md:flex items-center gap-6 text-sm font-medium">
          <Link href="/">
            <span className={cn(
              "cursor-pointer transition-colors hover:text-primary",
              location === "/" ? "text-primary font-semibold" : "text-muted-foreground"
            )}>
              Home
            </span>
          </Link>
          <Link href="/file-complaint">
            <span className={cn(
              "cursor-pointer transition-colors hover:text-primary",
              location === "/file-complaint" ? "text-primary font-semibold" : "text-muted-foreground"
            )}>
              File New Case
            </span>
          </Link>
        </nav>
      </div>
    </header>
  );
}
