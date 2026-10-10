"use client";

import { useState } from "react";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input } from "@/components/ui";

export default function Login() {
  const [password, setPassword] = useState("");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!password || working) return;
    setWorking(true);
    setError(null);
    try {
      const res = await fetch("/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
      if (res.ok) {
        window.location.replace("/");
        return;
      }
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(data?.error ?? `Something went wrong (status ${res.status}).`);
    } catch {
      setError("Atlas couldn't be reached. Check your connection and try again.");
    }
    setWorking(false);
  };

  return (
    <main className="atlas-wash grid flex-1 place-items-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Sign in to Atlas</CardTitle>
          <CardDescription>This copy of Atlas is private. Enter its password to continue.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
            className="space-y-3"
          >
            <label className="block text-xs text-muted-foreground" htmlFor="atlas-password">
              Password
              <Input
                id="atlas-password"
                type="password"
                autoComplete="current-password"
                autoFocus
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 text-foreground"
              />
            </label>
            <Button type="submit" disabled={working || !password} className="w-full">
              {working ? "Signing in…" : "Sign in"}
            </Button>
            {error && (
              <p className="text-sm text-live" role="alert">
                {error}
              </p>
            )}
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
