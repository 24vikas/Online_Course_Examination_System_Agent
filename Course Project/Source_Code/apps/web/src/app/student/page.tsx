"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAppContext } from "@/context/AppContext";
import { AuthGuard } from "@/components/auth/AuthGuard";

type Course = { code:string; course:string; schedule:string|null; title:string; start:string; end:string; source:string;
  attendance:number|null; fees:boolean|null; decision:string; registered:boolean; open:boolean; attempt:string|null };
type Dashboard = {student:{usn:string;name:string;semester:number|null;branch:string|null}; courses:Course[]};

function StudentDashboardContent() {
  const {exams,handleStartExamOnboarding} = useAppContext();
  const [data,setData] = useState<Dashboard|null>(null);
  const [error,setError] = useState("");
  async function refresh() {
    const response=await fetch("/api/student/registrations",{cache:"no-store"});
    if (!response.ok) throw new Error("Sign in to view your examinations.");
    setData(await response.json());
  }
  useEffect(()=>{refresh().catch(e=>setError(e.message));},[]);
  async function register(scheduleId:string) {
    setError("");
    try {
      const result=await fetch("/api/student/registrations",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({scheduleId})});
      if (!result.ok) throw new Error("Registration unavailable. Check your eligibility and schedule.");
      await refresh();
    } catch(e) { setError((e as Error).message); }
  }
  return (
    <main id="student-academic-dashboard" className="mx-auto max-w-5xl space-y-6 p-6 font-serif">
      {error && (
        <div role="alert" className="p-3 bg-red-50 border border-red-200 text-[#981B2B] text-xs rounded-md font-serif">
          {error}
        </div>
      )}
      {data && (
        <>
          {/* Candidate Profile Header Card */}
          <header className="bg-white border border-[#E6E4E4] rounded-lg p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-600" />
                <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-800">Enrolled Candidate</span>
              </div>
              <h1 className="text-2xl font-bold text-[#161616] mt-1 font-serif">{data.student.name}</h1>
              <p className="text-xs text-[#686868] mt-0.5">
                <span className="font-mono font-bold text-[#161616]">{data.student.usn}</span> · Semester{" "}
                {data.student.semester ?? "pending verification"} · {data.student.branch || "Department pending verification"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Link
                href="/student/hall-ticket"
                className="px-3 py-1.5 text-xs font-bold text-[#981B2B] border border-[#981B2B]/30 hover:bg-red-50 rounded-md transition-colors"
              >
                Admit Card
              </Link>
              <Link
                href="/student/scorecard"
                className="px-3 py-1.5 text-xs font-bold text-[#161616] border border-[#E6E4E4] hover:bg-[#F8F8F7] rounded-md transition-colors"
              >
                Scorecards
              </Link>
            </div>
          </header>

          <div className="flex items-center justify-between pt-2">
            <h2 className="text-lg font-bold text-[#161616]">Courses &amp; Official Examinations</h2>
            <span className="text-xs text-[#686868] font-mono">{data.courses.length} courses loaded</span>
          </div>

          {!data.courses.length && (
            <div className="bg-white border border-[#E6E4E4] rounded-lg p-8 text-center text-xs text-[#686868]">
              No active course enrollments found for this term.
            </div>
          )}

          <div className="space-y-4">
            {data.courses.map((row) => {
              const exam = exams.find((e) => e.id === row.schedule) || (row.schedule ? {
                id: row.schedule,
                title: row.title,
                courseCode: row.code,
                facultyId: "fac_authoritative",
                facultyName: "Department Faculty",
                description: `KLE Technological University Authoritative Examination for ${row.course}`,
                durationMinutes: 60,
                totalMarks: 50,
                passingScore: 20,
                type: "objective" as const,
                isMockOrPractice: false,
                registrationStart: new Date(Date.now() - 7 * 86400000).toISOString(),
                registrationEnd: row.end,
                examStart: row.start,
                examEnd: row.end,
                status: "published" as const,
                proctoringRules: {
                  requireWebcam: true,
                  maxTabSwitches: 0,
                  blockCopyPaste: true,
                  fullscreenRequired: true,
                  ambientAudioCheck: true,
                },
                questionsCount: 50,
                coeApproved: true,
                coeApprovedBy: "COE Administration",
                coeApprovedAt: new Date().toISOString(),
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              } : undefined);

              const isEligible = row.decision === "ELIGIBLE";

              return (
                <section
                  key={row.code + (row.schedule || row.course)}
                  className="bg-white border border-[#E6E4E4] rounded-lg p-6 shadow-xs space-y-4"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#E6E4E4] pb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-[#F8F8F7] border border-[#E6E4E4] text-[#161616]">
                          {row.code}
                        </span>
                        <h3 className="font-bold text-[#161616] text-base">{row.course}</h3>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-2.5 py-1 rounded text-xs font-bold ${
                          isEligible
                            ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                            : "bg-amber-50 text-amber-800 border border-amber-200"
                        }`}
                      >
                        Eligibility {row.decision.replaceAll("_", " ").toLowerCase()}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                    <div className="p-2.5 bg-[#F8F8F7] rounded border border-[#E6E4E4]">
                      <span className="text-[#686868] block text-[11px]">Attendance Record</span>
                      <span className="font-mono font-bold text-[#161616]">
                        {row.attendance == null ? "Pending verification" : `${row.attendance}%`}
                      </span>
                    </div>
                    <div className="p-2.5 bg-[#F8F8F7] rounded border border-[#E6E4E4]">
                      <span className="text-[#686868] block text-[11px]">Tuition &amp; Fees</span>
                      <span className="font-mono font-bold text-[#161616]">
                        {row.fees == null ? "Pending verification" : row.fees ? "Cleared" : "Pending"}
                      </span>
                    </div>
                    <div className="p-2.5 bg-[#F8F8F7] rounded border border-[#E6E4E4]">
                      <span className="text-[#686868] block text-[11px]">Eligibility Evidence</span>
                      <span className="font-mono text-[11px] text-[#686868] truncate block">
                        {row.source}
                      </span>
                    </div>
                  </div>

                  {row.schedule ? (
                    <div className="p-4 bg-slate-50/70 rounded-md border border-[#E6E4E4] flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div>
                        <div className="text-xs font-bold text-[#161616]">{row.title}</div>
                        <div className="text-xs text-[#686868] mt-0.5">
                          {new Date(row.start).toLocaleString()} – {new Date(row.end).toLocaleString()}
                        </div>
                        <div className="text-xs font-medium mt-1">
                          Status:{" "}
                          <span className={row.registered ? "text-emerald-700 font-bold" : "text-[#686868]"}>
                            {row.registered ? "Registered" : "Not registered"}
                          </span>
                          {row.attempt && <span className="font-mono text-xs text-[#686868]"> · Attempt: {row.attempt}</span>}
                        </div>
                      </div>

                      <div className="shrink-0">
                        {row.registered ? (
                          <button
                            id="btn-open-exam-onboarding"
                            data-schedule-id={row.schedule}
                            className="rounded-md bg-emerald-700 hover:bg-emerald-800 px-4 py-2 text-white font-bold text-xs disabled:opacity-50 transition-colors cursor-pointer"
                            disabled={!exam || !row.open}
                            onClick={() => exam && handleStartExamOnboarding(exam)}
                          >
                            Open Exam Onboarding
                          </button>
                        ) : (
                          <button
                            id="btn-register-for-exam"
                            data-schedule-id={row.schedule}
                            className="rounded-md bg-[#8B1D24] hover:bg-[#73171D] px-4 py-2 text-white font-bold text-xs disabled:opacity-50 transition-colors cursor-pointer"
                            disabled={!row.open || row.decision !== "ELIGIBLE"}
                            onClick={() => register(row.schedule!)}
                          >
                            Register for Examination
                          </button>
                        )}
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-[#686868] italic">No published examination timetable for this course.</p>
                  )}
                </section>
              );
            })}
          </div>

          <nav className="flex items-center gap-4 pt-4 border-t border-[#E6E4E4] text-xs">
            <Link href="/student/scorecard" className="text-[#981B2B] font-bold hover:underline">
              Official Scorecard &amp; Grade Report &rarr;
            </Link>
            <Link href="/student/grievances" className="text-[#686868] hover:text-[#161616]">
              Academic Grievances
            </Link>
          </nav>
        </>
      )}
    </main>
  );
}

export default function StudentPage() {
  return (
    <AuthGuard allowedRoles={["STUDENT", "SYSTEM_ADMIN"]}>
      <StudentDashboardContent />
    </AuthGuard>
  );
}
