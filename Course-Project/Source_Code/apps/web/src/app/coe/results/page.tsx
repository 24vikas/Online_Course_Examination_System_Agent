"use client";

import React, { useState } from "react";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { Download, FileSpreadsheet, CheckCircle2 } from "lucide-react";

export default function CoeResultsExportPage() {
  const [downloading, setDownloading] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const handleExport = async (type: "marks" | "roster", format: "normalized" | "summary") => {
    setDownloading(`${type}-${format}`);
    setMessage(null);
    try {
      const scheduleParam = typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get("scheduleId")
        : null;
      const url = scheduleParam
        ? `/api/coe/results/export-csv?scheduleId=${encodeURIComponent(scheduleParam)}&type=${type}&format=${format}`
        : `/api/coe/results/export-csv?type=${type}&format=${format}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Export failed with HTTP ${res.status}`);
      const blob = await res.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = `coe_${type}_${format}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(downloadUrl);
      setMessage(`Successfully exported ${type.toUpperCase()} (${format}) CSV`);
    } catch (err: any) {
      setMessage(`Export Error: ${err.message}`);
    } finally {
      setDownloading(null);
    }
  };

  return (
    <AuthGuard allowedRoles={["COE_ADMIN", "SYSTEM_ADMIN"]}>
      <div className="max-w-5xl mx-auto p-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold font-serif text-slate-900">Scorecards & Statutory Result Publication</h1>
          <p className="text-sm text-slate-600 mt-1">Export official reconciled exam rosters, normalized marks, and incident reports.</p>
        </div>

        {message && (
          <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 text-sm flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{message}</span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="p-6 bg-white border border-slate-200 rounded-xl space-y-4 shadow-sm">
            <div className="flex items-center gap-3">
              <FileSpreadsheet className="w-6 h-6 text-emerald-600" />
              <h2 className="font-semibold text-slate-800">Normalized Marks Ledger</h2>
            </div>
            <p className="text-xs text-slate-500">Includes question-by-question candidate scores, Bloom taxonomy scores, and validated totals.</p>
            <button
              onClick={() => handleExport("marks", "normalized")}
              disabled={!!downloading}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-semibold disabled:opacity-50 transition-colors cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>{downloading === "marks-normalized" ? "Exporting..." : "Download Marks CSV"}</span>
            </button>
          </div>

          <div className="p-6 bg-white border border-slate-200 rounded-xl space-y-4 shadow-sm">
            <div className="flex items-center gap-3">
              <FileSpreadsheet className="w-6 h-6 text-blue-600" />
              <h2 className="font-semibold text-slate-800">Cohort Roster & Attendance</h2>
            </div>
            <p className="text-xs text-slate-500">Official candidate verification roster with USN, attendance rate, fees status, and OPA eligibility snapshot.</p>
            <button
              onClick={() => handleExport("roster", "summary")}
              disabled={!!downloading}
              className="flex items-center gap-2 px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white rounded-lg text-xs font-semibold disabled:opacity-50 transition-colors cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>{downloading === "roster-summary" ? "Exporting..." : "Download Roster CSV"}</span>
            </button>
          </div>
        </div>
      </div>
    </AuthGuard>
  );
}
