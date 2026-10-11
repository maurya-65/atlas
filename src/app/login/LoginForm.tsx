"use client";

import { useState } from "react";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input } from "@/components/ui";

export default function LoginForm({ askUsername, shown }: { askUsername: boolean; shown: { username: string; password: string } | null }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!password || (askUsername && !username) || working) return;
    setWorking(true);
    setError(null);
    try {
      const res = await fetch("/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password }) });
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
          <CardDescription>This copy of Atlas is private. {askUsername ? "Enter its username and password" : "Enter its password"} to continue.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
            className="space-y-3"
          >
            {askUsername && (
              <label className="block text-xs text-muted-foreground" htmlFor="atlas-username">
                Username
                <Input
                  id="atlas-username"
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  autoFocus
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="mt-1 text-foreground"
                />
              </label>
            )}
            <label className="block text-xs text-muted-foreground" htmlFor="atlas-password">
              Password
              <Input
                id="atlas-password"
                type="password"
                autoComplete="current-password"
                autoFocus={!askUsername}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 text-foreground"
              />
            </label>
            <Button type="submit" disabled={working || !password || (askUsername && !username)} className="w-full">
              {working ? "Signing in…" : "Sign in"}
            </Button>
            {error && (
              <p className="text-sm text-live" role="alert">
                {error}
              </p>
            )}
          </form>
          {shown && (
            <div className="mt-5 rounded-lg border border-white/12 bg-white/5 p-3 text-xs text-muted-foreground">
              <p className="mb-2 text-foreground">Reviewer sign-in</p>
              {shown.username && (
                <p>
                  Username: <span className="select-all font-mono text-foreground">{shown.username}</span>
                </p>
              )}
              <p>
                Password: <span className="select-all font-mono text-foreground">{shown.password}</span>
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
