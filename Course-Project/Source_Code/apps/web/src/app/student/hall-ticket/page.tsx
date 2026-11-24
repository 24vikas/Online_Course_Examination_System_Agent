"use client";

import React, { useEffect, useState } from "react";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { ShieldCheck, Printer } from "lucide-react";

export default function StudentHallTicketPage() {
  const [ticket, setTicket] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/student/hall-ticket")
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (data.hallTicket) setTicket(data.hallTicket);
        else setError(data.error || "Unable to load hall ticket");
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <AuthGuard allowedRoles={["STUDENT", "SYSTEM_ADMIN"]}>
      <div className="max-w-3xl mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold font-serif text-slate-900">Official Examination Hall Ticket</h1>
            <p className="text-xs text-slate-500 mt-1">Institutional examination admit card with cryptographic token.</p>
          </div>
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 px-3 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-medium transition-colors cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            <span>Print Admit Card</span>
          </button>
        </div>

        {loading && <div className="p-8 text-center text-sm text-slate-500 font-serif">Verifying hall ticket eligibility...</div>}
        {error && <div className="p-4 bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-lg">{error}</div>}

        {ticket && (
          <div className="bg-white border-2 border-slate-300 rounded-xl p-8 space-y-6 shadow-sm">
            <div className="text-center border-b pb-4">
              <h2 className="text-lg font-bold text-slate-900 tracking-tight">{ticket.institution}</h2>
              <p className="text-xs text-slate-600">{ticket.department} · {ticket.academicYear}</p>
              <div className="mt-2 inline-block px-3 py-1 bg-emerald-100 text-emerald-800 text-xs font-semibold rounded-full">
                Ticket No: {ticket.ticketNumber}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 text-xs">
              <div className="space-y-1">
                <div className="text-slate-500">Candidate Name:</div>
                <div className="font-semibold text-slate-800">{ticket.student?.fullName}</div>
              </div>
              <div className="space-y-1">
                <div className="text-slate-500">USN:</div>
                <div className="font-semibold font-mono text-slate-800">{ticket.student?.usn}</div>
              </div>
              <div className="space-y-1">
                <div className="text-slate-500">Course:</div>
                <div className="font-semibold text-slate-800">{ticket.examination?.courseCode} · {ticket.examination?.courseTitle}</div>
              </div>
              <div className="space-y-1">
                <div className="text-slate-500">Reporting Time / Room:</div>
                <div className="font-semibold text-slate-800">{ticket.examination?.roomNumber} ({ticket.examination?.seatDesignation})</div>
              </div>
            </div>

            <div className="border-t pt-4 flex items-center justify-between text-[11px] text-slate-500 font-mono">
              <div>Verification Token: {ticket.verification?.verificationToken}</div>
              <div className="text-emerald-700 font-semibold flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>OPA Verified Eligible</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </AuthGuard>
  );
}
