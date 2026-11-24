"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function FacultyRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/lecturer");
  }, [router]);

  return (
    <div className="min-h-screen bg-white flex items-center justify-center font-serif text-slate-600 text-sm">
      Routing to Faculty Cockpit...
    </div>
  );
}
