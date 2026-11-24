"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function RootHomePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function determineDestination() {
      try {
        const res = await fetch("/api/auth/me", { cache: "no-store" });
        if (!res.ok) {
          router.replace("/login");
          return;
        }
        const data = await res.json();
        const role = data?.user?.role;
        if (role === "STUDENT") {
          router.replace("/student");
        } else if (role === "LECTURER" || role === "FACULTY") {
          router.replace("/lecturer");
        } else if (role === "INVIGILATOR") {
          router.replace("/invigilator/live");
        } else if (role === "COE_ADMIN" || role === "SYSTEM_ADMIN") {
          router.replace("/coe");
        } else {
          router.replace("/login");
        }
      } catch {
        router.replace("/login");
      }
    }
    determineDestination();
  }, [router]);

  return (
    <div className="min-h-screen bg-white flex items-center justify-center font-serif text-slate-700 text-sm">
      Loading KLE Tech Examination Portal...
    </div>
  );
}
