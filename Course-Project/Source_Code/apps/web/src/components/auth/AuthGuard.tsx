"use client";

import React, { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAppContext } from "@/context/AppContext";

interface AuthGuardProps {
  allowedRoles: string[];
  children: React.ReactNode;
}

export function AuthGuard({ allowedRoles, children }: AuthGuardProps) {
  const router = useRouter();
  const { currentUser, handleSwitchUser } = useAppContext();
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [userName, setUserName] = useState<string | null>(null);

  const rolesKey = allowedRoles.slice().sort().join(",");
  const verifiedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    let active = true;

    async function verify() {
      try {
        const res = await fetch("/api/auth/me", { cache: "no-store" });
        if (!res.ok) {
          if (active) {
            setAuthorized(false);
            router.replace("/login");
          }
          return;
        }
        const data = await res.json();
        const role = data?.user?.role;
        if (!role) {
          if (active) {
            setAuthorized(false);
            router.replace("/login");
          }
          return;
        }
        if (active) {
          setUserRole(role);
          setUserName(data.user.displayName || data.user.email);
          const isAllowed = allowedRoles.includes(role) || role === "SYSTEM_ADMIN";
          setAuthorized(isAllowed);

          if (isAllowed && currentUser.id !== data.user.id) {
            // Update context only when authorized and user identity changed
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
          }
        }
      } catch {
        if (active) {
          setAuthorized(false);
          router.replace("/login");
        }
      }
    }

    if (verifiedKeyRef.current !== rolesKey) {
      verifiedKeyRef.current = rolesKey;
      verify();
    }

    return () => {
      active = false;
    };
  }, [rolesKey, router, allowedRoles, currentUser.id, handleSwitchUser]);

  if (authorized === null) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center font-serif text-slate-600 text-sm">
        Verifying institutional credentials...
      </div>
    );
  }

  if (authorized === false) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 font-serif">
        <div id="auth-guard-denied-modal" className="max-w-md w-full bg-white border border-slate-200 rounded-xl p-8 shadow-sm text-center">
          <div className="w-12 h-12 bg-red-100 text-[#8B1D24] rounded-full flex items-center justify-center mx-auto mb-4 font-bold text-lg">
            403
          </div>
          <h1 className="text-xl font-bold text-slate-900 mb-2">Access Denied</h1>
          <p className="text-sm text-slate-600 mb-6">
            Your account ({userName || "current session"} with role <span className="font-semibold text-slate-800">{userRole}</span>) is not authorized to access this portal.
          </p>
          <div className="flex flex-col gap-2">
            <Link
              href={
                userRole === "STUDENT"
                  ? "/student"
                  : userRole === "LECTURER" || userRole === "FACULTY"
                  ? "/lecturer"
                  : userRole === "INVIGILATOR"
                  ? "/invigilator/live"
                  : "/coe"
              }
              className="inline-block bg-[#8B1D24] hover:bg-[#73171D] text-white font-serif font-bold text-sm py-2 px-4 rounded-md transition-colors"
            >
              Return to Your Dashboard
            </Link>
            <Link
              href="/login"
              className="inline-block text-xs text-slate-500 hover:text-slate-800 font-serif underline mt-2"
            >
              Switch Account / Sign In
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
