import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, LogOut, Shield, Mail, Calendar, FileText, AlertCircle, BarChart3 } from "lucide-react";
import { format } from "date-fns";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import type { Complaint } from "@shared/schema";

type DailyStat = { date: string; count: number };

export default function Admin() {
  const { user, isLoading: authLoading, isAuthenticated, logout } = useAuth();
  const [selectedComplaint, setSelectedComplaint] = useState<Complaint | null>(null);

  const { data: adminCheck, isLoading: adminCheckLoading } = useQuery<{ isAdmin: boolean; wasFirstAdmin: boolean }>({
    queryKey: ["/api/admin/check"],
    enabled: isAuthenticated,
  });

  const { data: complaints, isLoading: complaintsLoading } = useQuery<Complaint[]>({
    queryKey: ["/api/admin/complaints"],
    enabled: isAuthenticated && adminCheck?.isAdmin,
  });

  const { data: dailyStats, isLoading: statsLoading } = useQuery<DailyStat[]>({
    queryKey: ["/api/admin/stats/daily"],
    enabled: isAuthenticated && adminCheck?.isAdmin,
  });

  if (authLoading || adminCheckLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-muted-foreground" />
          <p className="text-muted-foreground">Verifying access...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-4">
              <Shield className="w-6 h-6 text-primary" />
            </div>
            <CardTitle>Admin Portal</CardTitle>
            <CardDescription>
              Sign in to access the complaints administration dashboard
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button 
              className="w-full" 
              size="lg"
              onClick={() => window.location.href = "/api/login?returnTo=/admin"}
              data-testid="button-admin-login"
            >
              Sign In with Replit
            </Button>
            <p className="text-xs text-center text-muted-foreground mt-4">
              The first user to sign in will be granted admin access.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!adminCheck?.isAdmin) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 bg-destructive/10 rounded-full flex items-center justify-center mb-4">
              <AlertCircle className="w-6 h-6 text-destructive" />
            </div>
            <CardTitle>Access Denied</CardTitle>
            <CardDescription>
              You do not have admin privileges for this application.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground text-center">
              Signed in as: {user?.email}
            </p>
            <Button 
              variant="outline" 
              className="w-full"
              onClick={() => logout()}
              data-testid="button-logout"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Sign Out
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      pending_payment: "outline",
      received: "secondary",
      processing: "default",
      resolved: "default",
    };
    return (
      <Badge variant={variants[status] || "outline"} data-testid={`badge-status-${status}`}>
        {status.replace("_", " ")}
      </Badge>
    );
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card sticky top-0 z-50">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Shield className="w-6 h-6 text-primary" />
            <h1 className="font-semibold text-lg">Admin Dashboard</h1>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground hidden sm:block">
              {user?.email}
            </span>
            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => logout()}
              data-testid="button-header-logout"
            >
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-6">
        {adminCheck?.wasFirstAdmin && (
          <Card className="border-primary/50 bg-primary/5">
            <CardContent className="py-3">
              <p className="text-sm text-primary flex items-center gap-2">
                <Shield className="w-4 h-4" />
                You are the first admin. You have been granted admin access automatically.
              </p>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5" />
              Complaints Per Day (Last 30 Days)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <div className="h-64 flex items-center justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : dailyStats && dailyStats.length > 0 ? (
              <div className="h-64" data-testid="chart-daily-complaints">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dailyStats}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis 
                      dataKey="date" 
                      tickFormatter={(value) => format(new Date(value), "MMM d")}
                      className="text-xs"
                    />
                    <YAxis allowDecimals={false} className="text-xs" />
                    <Tooltip 
                      labelFormatter={(value) => format(new Date(value), "MMMM d, yyyy")}
                      formatter={(value: number) => [value, "Complaints"]}
                    />
                    <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-64 flex items-center justify-center text-muted-foreground">
                No complaint data available yet
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid lg:grid-cols-2 gap-6">
          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5" />
                Complaints ({complaints?.length || 0})
              </CardTitle>
              <CardDescription>Click a complaint to view details</CardDescription>
            </CardHeader>
            <CardContent>
              {complaintsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : complaints && complaints.length > 0 ? (
                <div className="space-y-2 max-h-96 overflow-y-auto" data-testid="list-complaints">
                  {complaints.map((complaint) => (
                    <div
                      key={complaint.id}
                      className={`p-3 rounded-md border cursor-pointer transition-colors hover-elevate ${
                        selectedComplaint?.id === complaint.id 
                          ? "border-primary bg-primary/5" 
                          : "border-border"
                      }`}
                      onClick={() => setSelectedComplaint(complaint)}
                      data-testid={`complaint-item-${complaint.id}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="font-mono text-sm font-medium">
                            Case #{complaint.id}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">
                            {complaint.customerEmail}
                          </p>
                        </div>
                        {getStatusBadge(complaint.status)}
                      </div>
                      <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                        {complaint.content}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  No complaints submitted yet
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle>Complaint Details</CardTitle>
              <CardDescription>
                {selectedComplaint 
                  ? `Case #${selectedComplaint.id}` 
                  : "Select a complaint to view details"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {selectedComplaint ? (
                <div className="space-y-4" data-testid="complaint-details">
                  <div className="flex items-center gap-2 flex-wrap">
                    {getStatusBadge(selectedComplaint.status)}
                    {selectedComplaint.complexityScore && (
                      <Badge variant="outline">
                        Complexity: {selectedComplaint.complexityScore}/10
                      </Badge>
                    )}
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-start gap-2">
                      <Mail className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                      <div>
                        <p className="text-xs text-muted-foreground">Email</p>
                        <p className="text-sm">{selectedComplaint.customerEmail}</p>
                      </div>
                    </div>

                    <div className="flex items-start gap-2">
                      <Calendar className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                      <div>
                        <p className="text-xs text-muted-foreground">Submitted</p>
                        <p className="text-sm">
                          {selectedComplaint.createdAt 
                            ? format(new Date(selectedComplaint.createdAt), "PPpp")
                            : "Unknown"}
                        </p>
                      </div>
                    </div>

                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Filing Fee</p>
                      <p className="text-sm font-mono">
                        ${(selectedComplaint.filingFee / 100).toFixed(2)}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Complaint</p>
                      <p className="text-sm bg-muted/50 p-3 rounded-md whitespace-pre-wrap">
                        {selectedComplaint.content}
                      </p>
                    </div>

                    {selectedComplaint.aiResponse && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">AI Response</p>
                        <p className="text-sm bg-muted/50 p-3 rounded-md whitespace-pre-wrap max-h-48 overflow-y-auto">
                          {selectedComplaint.aiResponse}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  Select a complaint from the list to view its details
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
