import { Link } from "wouter";
import { OfficialHeader } from "@/components/OfficialHeader";
import { Button } from "@/components/ui/button";
import { FileQuestion } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-background font-sans flex flex-col">
      <OfficialHeader />
      
      <main className="flex-1 flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center space-y-6 bg-card border border-border p-12 rounded-lg paper-shadow">
          <div className="mx-auto w-16 h-16 bg-muted rounded-full flex items-center justify-center">
            <FileQuestion className="w-8 h-8 text-muted-foreground" />
          </div>
          
          <div>
            <h1 className="text-4xl font-serif font-bold text-foreground">404</h1>
            <div className="text-sm font-mono text-muted-foreground mt-2 uppercase tracking-widest">
              Record Not Found
            </div>
          </div>
          
          <p className="text-muted-foreground">
            The page you are looking for has been misplaced, redacted, or never existed in our official records.
          </p>

          <div className="pt-4">
            <Link href="/">
              <Button variant="default" className="w-full">
                Return to Department Home
              </Button>
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
