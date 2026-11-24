"use client";

import React, { useState, Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAppContext } from "@/context/AppContext";

export const dynamic = "force-dynamic";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectParam = searchParams.get("redirect");

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { handleSwitchUser } = useAppContext();

  // If already logged in, redirect to intended role portal
  useEffect(() => {
    async function checkExistingAuth() {
      try {
        const res = await fetch("/api/auth/me", { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          if (data?.user?.role) {
            const role = data.user.role;
            const target =
              redirectParam ||
              (role === "STUDENT"
                ? "/student"
                : role === "LECTURER" || role === "FACULTY"
                ? "/lecturer"
                : role === "INVIGILATOR"
                ? "/invigilator/live"
                : "/coe");
            router.replace(target);
          }
        }
      } catch {}
    }
    checkExistingAuth();
  }, [redirectParam, router]);

  const handleLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!identifier.trim()) {
      setError("Please enter your USN or institutional email.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: identifier.trim(), password }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Invalid institutional credentials.");
      }

      // Map role to AppContext
      const role = data.user.role;
      const mappedRole =
        role === "COE_ADMIN" || role === "SYSTEM_ADMIN"
          ? "author"
          : role === "STUDENT"
          ? "student"
          : "faculty";

      handleSwitchUser({
        id: data.user.id,
        email: data.user.email,
        displayName: data.user.displayName,
        role: mappedRole as any,
        roleTitle: role,
        department: "KLE Technological University",
        attendanceRate: 100,
        feeCleared: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // Strict role-based destination routing
      let targetRoute =
        role === "STUDENT"
          ? "/student"
          : role === "LECTURER" || role === "FACULTY"
          ? "/lecturer"
          : role === "INVIGILATOR"
          ? "/invigilator/live"
          : "/coe";

      if (redirectParam && redirectParam.startsWith("/") && redirectParam !== "/") {
        targetRoute = redirectParam;
      }

      router.push(targetRoute);
    } catch (err: any) {
      setError(err.message || "Invalid institutional credentials.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8F8F7] flex items-center justify-center p-4 font-serif">
      <div className="w-full max-w-[340px] bg-white border border-[#E6E4E4] rounded-lg p-7 shadow-xs">
        {/* Title matching reference image */}
        <h1 className="text-xl font-bold text-center text-[#161616] mb-5 font-serif tracking-normal">
          Account Login
        </h1>

        {/* Error message */}
        {error && (
          <div
            id="login-error-alert"
            role="alert"
            className="mb-4 p-2 text-center text-xs text-red-700 bg-red-50 border border-red-200 rounded-md font-serif"
          >
            {error}
          </div>
        )}

        {/* Clean Form */}
        <form onSubmit={handleLogin} className="space-y-3.5">
          <div>
            <input
              id="login-identifier-input"
              type="text"
              placeholder="USN or institutional email"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              required
              autoFocus
              className="w-full bg-white border border-[#D1D5DB] focus:border-[#8B1D24] focus:ring-1 focus:ring-[#8B1D24] rounded-md px-3 py-2 text-sm text-[#161616] placeholder:text-[#9CA3AF] font-serif outline-none transition-colors"
            />
          </div>

          <div>
            <input
              id="login-password-input"
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full bg-white border border-[#D1D5DB] focus:border-[#8B1D24] focus:ring-1 focus:ring-[#8B1D24] rounded-md px-3 py-2 text-sm text-[#161616] placeholder:text-[#9CA3AF] font-serif outline-none transition-colors"
            />
          </div>

          <div className="pt-0.5">
            <button
              id="login-submit-btn"
              type="submit"
              disabled={loading}
              className="w-full bg-[#8B1D24] hover:bg-[#73171D] disabled:opacity-50 text-white font-bold py-2 px-4 rounded-md font-serif text-sm transition-colors cursor-pointer"
            >
              {loading ? "Signing In..." : "Sign In"}
            </button>
          </div>
        </form>

        {/* Quick Demo Persona Switcher */}
        <div className="mt-6 pt-5 border-t border-[#E6E4E4] space-y-2.5">
          <div className="text-[11px] font-bold text-[#686868] uppercase tracking-wider text-center">
            One-Click Demo Personas
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <button
              type="button"
              onClick={() => {
                setIdentifier("coe.demo@example.invalid");
                setPassword("");
              }}
              className="p-2 text-left rounded border border-[#E6E4E4] hover:border-[#8B1D24] hover:bg-slate-50 transition-colors"
            >
              <div className="font-bold text-[#8B1D24]">COE Admin</div>
              <div className="text-[10px] text-slate-500 font-mono">coe.demo</div>
            </button>

            <button
              type="button"
              onClick={() => {
                setIdentifier("uday.demo@example.invalid");
                setPassword("");
              }}
              className="p-2 text-left rounded border border-[#E6E4E4] hover:border-[#8B1D24] hover:bg-slate-50 transition-colors"
            >
              <div className="font-bold text-sky-800">Faculty</div>
              <div className="text-[10px] text-slate-500 font-mono">uday.demo</div>
            </button>

            <button
              type="button"
              onClick={() => {
                setIdentifier("DEMO094@example.invalid");
                setPassword("");
              }}
              className="p-2 text-left rounded border border-[#E6E4E4] hover:border-[#8B1D24] hover:bg-slate-50 transition-colors"
            >
              <div className="font-bold text-emerald-800">Candidate</div>
              <div className="text-[10px] text-slate-500 font-mono">DEMO094</div>
            </button>

            <button
              type="button"
              onClick={() => {
                setIdentifier("invigilator.demo@example.invalid");
                setPassword("");
              }}
              className="p-2 text-left rounded border border-[#E6E4E4] hover:border-[#8B1D24] hover:bg-slate-50 transition-colors"
            >
              <div className="font-bold text-amber-800">Invigilator</div>
              <div className="text-[10px] text-slate-500 font-mono">invigilator.demo</div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-50 flex items-center justify-center font-serif text-sm text-slate-500">
          Loading login portal...
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
