"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff, ArrowRight, Shield } from "lucide-react";

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password, inviteCode }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Registration failed");
        setLoading(false);
        return;
      }

      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-black px-4 relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-[#1a1a2e] via-black to-black opacity-60" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-[#2997ff]/[0.03] rounded-full blur-[120px]" />

      <div className="relative z-10 w-full max-w-sm">
        <div className="mb-10 text-center">
          <div className="flex justify-center mb-6">
            <Logo size="lg" showText={false} />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-white mb-1.5">
            Join ATIS
          </h1>
          <p className="text-sm text-[#86868b]">Create your analyst account</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="name" className="text-sm text-[#86868b]">
              Full Name
            </Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="Jane Analyst"
              className="h-11 bg-white/[0.04] border-white/[0.08] text-white placeholder:text-[#86868b]/50 focus:border-[#2997ff]/50 focus:ring-[#2997ff]/20 rounded-xl"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="email" className="text-sm text-[#86868b]">
              Email
            </Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="analyst@atis.local"
              className="h-11 bg-white/[0.04] border-white/[0.08] text-white placeholder:text-[#86868b]/50 focus:border-[#2997ff]/50 focus:ring-[#2997ff]/20 rounded-xl"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password" className="text-sm text-[#86868b]">
              Password
            </Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="Minimum 8 characters"
                className="h-11 bg-white/[0.04] border-white/[0.08] text-white placeholder:text-[#86868b]/50 focus:border-[#2997ff]/50 focus:ring-[#2997ff]/20 rounded-xl pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#86868b] hover:text-white transition-colors"
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label
              htmlFor="invite"
              className="text-sm text-[#86868b] flex items-center gap-1.5"
            >
              <Shield className="h-3 w-3" /> Invitation Code
            </Label>
            <Input
              id="invite"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value)}
              required
              placeholder="16-character code"
              className="h-11 bg-white/[0.04] border-white/[0.08] text-white placeholder:text-[#86868b]/50 focus:border-[#2997ff]/50 focus:ring-[#2997ff]/20 rounded-xl font-mono text-sm tracking-wider"
            />
          </div>

          {error && (
            <div className="rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          <Button
            type="submit"
            disabled={loading}
            className="w-full h-11 bg-[#2997ff] hover:bg-[#0077ed] text-white rounded-xl font-medium transition-all duration-200 disabled:opacity-50"
          >
            {loading ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            ) : (
              <span className="flex items-center justify-center gap-2">
                Create Account <ArrowRight className="h-4 w-4" />
              </span>
            )}
          </Button>
        </form>

        <p className="mt-8 text-center text-sm text-[#86868b]">
          Already have an account?{" "}
          <Link
            href="/login"
            className="text-[#2997ff] hover:text-[#5ac8fa] transition-colors font-medium"
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
