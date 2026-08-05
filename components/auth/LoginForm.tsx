"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Loader2, ShieldCheck, Globe2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useLogin } from "@/lib/hooks/use-auth";
import { isValidGuid } from "@/lib/utils";
import { BRAND } from "@/lib/brand";

export function LoginForm() {
  const [tenantId, setTenantId] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [lighthouse, setLighthouse] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const login = useLogin();
  const router = useRouter();

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const t = tenantId.trim();
    const c = clientId.trim();
    if (!isValidGuid(t)) {
      setError("Tenant ID must be a valid GUID (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx).");
      return;
    }
    if (!isValidGuid(c)) {
      setError("Client ID must be a valid GUID.");
      return;
    }
    if (!clientSecret.trim()) {
      setError("Client Secret is required.");
      return;
    }

    try {
      const result = await login.mutateAsync({
        tenantId: t,
        clientId: c,
        clientSecret: clientSecret.trim(),
        lighthouse,
      });
      if (result.subscriptions.length === 0) {
        setError(
          "Authentication succeeded but the service principal has no accessible subscriptions. Grant it at least the Reader role and try again.",
        );
        return;
      }
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
            <KeyRound className="h-4 w-4" />
          </div>
          <div>
            <CardTitle>Sign in to {BRAND.name}</CardTitle>
            <CardDescription>
              Service Principal · Reader role · Read-only
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="tenant-id">HOME / MSP Tenant ID</Label>
            <Input
              id="tenant-id"
              placeholder="12345678-1234-1234-1234-123456789012"
              value={tenantId}
              onChange={(e) => setTenantId(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="client-id">Client ID (Application ID)</Label>
            <Input
              id="client-id"
              placeholder="abcdefgh-1234-5678-90ab-cdef12345678"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="client-secret">Client Secret</Label>
            <Input
              id="client-secret"
              type="password"
              placeholder="Secret value from Azure AD"
              value={clientSecret}
              onChange={(e) => setClientSecret(e.target.value)}
              autoComplete="off"
              required
            />
          </div>

          <label className="flex cursor-pointer items-start gap-2 rounded-md border bg-card/50 p-3 text-sm">
            <Checkbox
              checked={lighthouse}
              onChange={(e) => setLighthouse(e.currentTarget.checked)}
              className="mt-0.5"
            />
            <div>
              <div className="flex items-center gap-1.5 font-medium">
                <Globe2 className="h-3.5 w-3.5 text-warning" />
                Enable Azure Lighthouse (MSP multi-tenant)
              </div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                Discovers subscriptions delegated to this Service Principal
                across customer tenants. Leave off for single-tenant setups.
              </div>
            </div>
          </label>

          {error && (
            <Alert variant="destructive">
              <AlertTitle>Authentication failed</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <Button
            type="submit"
            className="w-full"
            disabled={login.isPending}
          >
            {login.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Authenticating…
              </>
            ) : (
              <>
                <ShieldCheck className="h-4 w-4" />
                Connect to Azure
              </>
            )}
          </Button>

          <p className="text-center text-[11px] text-muted-foreground">
            Credentials are encrypted (AES-GCM) in an HttpOnly, Secure cookie
            and never leave this browser session.
          </p>
          <p className="text-center text-[10px] uppercase tracking-[0.13em] text-muted-foreground/70">
            {BRAND.attribution}
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
