import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, LogOut, Shield, Mail, Calendar, FileText, AlertCircle, BarChart3, UserPlus, Users } from "lucide-react";
import { format } from "date-fns";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { useToast } from "@/hooks/use-toast";
import type { Complaint } from "@shared/schema";

type DailyStat = { date: string; count: number };

type AuthStatus = {
  authenticated: boolean;
  authType?: 'replit' | 'password';
  email?: string;
  isAdmin: boolean;
};

type AdminUser = {
  id: number;
  email: string;
  hasPassword: boolean;
  createdAt: string | null;
};

export default function Admin() {
  const { user, isLoading: authLoading, isAuthenticated: replitAuthenticated, logout: replitLogout } = useAuth();
  const { toast } = useToast();
  const [selectedComplaint, setSelectedComplaint] = useState<Complaint | null>(null);
  const [showAddAdmin, setShowAddAdmin] = useState(false);
  
  // Password login form state
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  
  // New admin form state
  const [newAdminEmail, setNewAdminEmail] = useState("");
  const [newAdminPassword, setNewAdminPassword] = useState("");

  // Use the unified auth-status endpoint
  const { data: authStatus, isLoading: authStatusLoading, refetch: refetchAuthStatus } = useQuery<AuthStatus>({
    queryKey: ["/api/admin/auth-status"],
  });

  const isAuthenticated = authStatus?.authenticated || false;
  const isAdmin = authStatus?.isAdmin || false;

  const { data: complaints, isLoading: complaintsLoading, error: complaintsError } = useQuery<Complaint[]>({
    queryKey: ["/api/admin/complaints"],
    enabled: isAuthenticated && isAdmin,
  });

  const { data: dailyStats, isLoading: statsLoading } = useQuery<DailyStat[]>({
    queryKey: ["/api/admin/stats/daily"],
    enabled: isAuthenticated && isAdmin,
  });

  const { data: adminUsers } = useQuery<AdminUser[]>({
    queryKey: ["/api/admin/users"],
    enabled: isAuthenticated && isAdmin,
  });

  // Password login mutation
  const loginMutation = useMutation({
    mutationFn: async (data: { email: string; password: string }) => {
      const res = await apiRequest("POST", "/api/admin/login", data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Login successful" });
      refetchAuthStatus();
      queryClient.invalidateQueries({ queryKey: ["/api/admin/complaints"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stats/daily"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
    },
    onError: (error: Error) => {
      toast({ title: "Login failed", description: error.message, variant: "destructive" });
    },
  });

  // Password logout mutation
  const logoutMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/logout");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Logged out" });
      refetchAuthStatus();
    },
  });

  // Create admin mutation
  const createAdminMutation = useMutation({
    mutationFn: async (data: { email: string; password: string }) => {
      const res = await apiRequest("POST", "/api/admin/users", data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Admin user created", description: "Share the credentials securely with the new admin." });
      setNewAdminEmail("");
      setNewAdminPassword("");
      setShowAddAdmin(false);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to create admin", description: error.message, variant: "destructive" });
    },
  });

  const handleLogout = () => {
    if (authStatus?.authType === 'password') {
      logoutMutation.mutate();
    } else {
      replitLogout();
    }
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    loginMutation.mutate({ email: loginEmail, password: loginPassword });
  };

  const handleCreateAdmin = (e: React.FormEvent) => {
    e.preventDefault();
    createAdminMutation.mutate({ email: newAdminEmail, password: newAdminPassword });
  };

  if (authLoading || authStatusLoading) {
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
          <CardContent className="space-y-4">
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="admin@example.com"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  required
                  data-testid="input-login-email"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Enter password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  required
                  data-testid="input-login-password"
                />
              </div>
              <Button 
                type="submit" 
                className="w-full" 
                disabled={loginMutation.isPending}
                data-testid="button-login-submit"
              >
                {loginMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Sign In
              </Button>
            </form>
            
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">Or</span>
              </div>
            </div>

            <Button 
              variant="outline"
              className="w-full" 
              onClick={() => window.location.href = "/api/login?returnTo=/admin"}
              data-testid="button-admin-login-replit"
            >
              Sign In with Replit
            </Button>
            <p className="text-xs text-center text-muted-foreground">
              The first Replit user to sign in will be granted admin access.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!isAdmin) {
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
              Signed in as: {authStatus?.email || user?.email}
            </p>
            <Button 
              variant="outline" 
              className="w-full"
              onClick={handleLogout}
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
              {authStatus?.email || user?.email}
            </span>
            <Button 
              variant="ghost" 
              size="sm"
              onClick={handleLogout}
              data-testid="button-header-logout"
            >
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-6">
        {/* Admin Users Management Section */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5" />
                Admin Users ({adminUsers?.length || 0})
              </CardTitle>
              <CardDescription>Manage admin access</CardDescription>
            </div>
            <Button 
              size="sm" 
              onClick={() => setShowAddAdmin(!showAddAdmin)}
              data-testid="button-toggle-add-admin"
            >
              <UserPlus className="w-4 h-4 mr-2" />
              Add Admin
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {showAddAdmin && (
              <form onSubmit={handleCreateAdmin} className="p-4 border rounded-md space-y-4 bg-muted/20">
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="new-admin-email">Email</Label>
                    <Input
                      id="new-admin-email"
                      type="email"
                      placeholder="newadmin@example.com"
                      value={newAdminEmail}
                      onChange={(e) => setNewAdminEmail(e.target.value)}
                      required
                      data-testid="input-new-admin-email"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="new-admin-password">Password (min 8 chars)</Label>
                    <Input
                      id="new-admin-password"
                      type="password"
                      placeholder="Create password"
                      value={newAdminPassword}
                      onChange={(e) => setNewAdminPassword(e.target.value)}
                      required
                      minLength={8}
                      data-testid="input-new-admin-password"
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button 
                    type="submit" 
                    disabled={createAdminMutation.isPending}
                    data-testid="button-create-admin"
                  >
                    {createAdminMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    Create Admin
                  </Button>
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={() => setShowAddAdmin(false)}
                  >
                    Cancel
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Share these credentials securely with the new admin (not through the app).
                </p>
              </form>
            )}
            
            {adminUsers && adminUsers.length > 0 && (
              <div className="space-y-2" data-testid="list-admin-users">
                {adminUsers.map((admin) => (
                  <div 
                    key={admin.id} 
                    className="flex items-center justify-between p-3 border rounded-md"
                    data-testid={`admin-user-${admin.id}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center">
                        <Mail className="w-4 h-4 text-primary" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">{admin.email}</p>
                        <p className="text-xs text-muted-foreground">
                          {admin.hasPassword ? "Password login" : "Replit login"}
                        </p>
                      </div>
                    </div>
                    {admin.createdAt && (
                      <span className="text-xs text-muted-foreground">
                        Added {format(new Date(admin.createdAt), "MMM d, yyyy")}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Daily Stats Chart */}
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

        {/* Complaints Grid */}
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
              ) : complaintsError ? (
                <div className="text-center py-8 text-destructive">
                  Error loading complaints: {complaintsError.message}
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
