"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  FileText,
  Search,
  Sparkles,
  Edit3,
  BookOpen,
  Calendar,
  ShieldCheck,
  Code2,
  Eye,
  CheckCircle2,
  Download,
  Server,
  ArrowRight,
  ExternalLink,
  ChevronRight,
  UserCheck,
} from "lucide-react";

export default function DemoHubPage() {
  const [serviceStatus, setServiceStatus] = useState<Record<string, boolean | string>>({
    web: "checking",
    db: "checking",
    opa: "checking",
    companion: "checking",
    docling: "checking",
  });

  useEffect(() => {
    async function checkServices() {
      // Check auth/me to verify Web + DB
      try {
        const res = await fetch("/api/auth/me", { cache: "no-store" });
        setServiceStatus(prev => ({ ...prev, web: true, db: res.status !== 500 }));
      } catch {
        setServiceStatus(prev => ({ ...prev, web: false, db: false }));
      }

      // Check OPA
      try {
        const res = await fetch("/api/proctor/seb-config");
        setServiceStatus(prev => ({ ...prev, opa: res.ok }));
      } catch {
        setServiceStatus(prev => ({ ...prev, opa: false }));
      }

      // Check Companion daemon
      try {
        const res = await fetch("http://127.0.0.1:4200/", { mode: "no-cors" });
        setServiceStatus(prev => ({ ...prev, companion: true }));
      } catch {
        setServiceStatus(prev => ({ ...prev, companion: false }));
      }
    }

    checkServices();
  }, []);

  const workflowSteps = [
    {
      num: 1,
      title: "PDF Upload & Document Parsing",
      role: "COE / Faculty",
      desc: "Upload syllabus guidelines and lesson plans. Processed by Docling with table & formula extraction.",
      href: "/coe/documents",
      icon: FileText,
      badge: "Docling Ingestion",
    },
    {
      num: 2,
      title: "pgvector RAG & Semantic Retrieval",
      role: "Faculty",
      desc: "Query high-dimensional (1024-d) course chunks with cosine similarity ranking.",
      href: "/rag",
      icon: Search,
      badge: "BGE-M3 Embeddings",
    },
    {
      num: 3,
      title: "Deep Research Agent",
      role: "Faculty",
      desc: "Autonomous multi-source research agent querying authoritative academic repositories.",
      href: "/research",
      icon: Sparkles,
      badge: "Agentic AI",
    },
    {
      num: 4,
      title: "Question Bank Authoring (MCQ + Coding)",
      role: "Faculty Examiner",
      desc: "Author Bloom-mapped MCQs and isolated Linux Bubblewrap Python coding challenges.",
      href: "/lecturer/question-bank",
      icon: Edit3,
      badge: "Human-in-the-Loop",
    },
    {
      num: 5,
      title: "Practice Notebook & Student Hall",
      role: "Candidate",
      desc: "Interactive practice environment grounded in approved course material.",
      href: "/student/practice",
      icon: BookOpen,
      badge: "Candidate Prep",
    },
    {
      num: 6,
      title: "Exam Blueprint Drafting & Submission",
      role: "Faculty Examiner",
      desc: "Configure course unit distribution, mark weights, and submit for COE review.",
      href: "/lecturer/blueprints",
      icon: Calendar,
      badge: "Governance",
    },
    {
      num: 7,
      title: "COE Blueprint Approval & Scheduling",
      role: "COE Administrator",
      desc: "Audit syllabus coverage balance, approve blueprint, and publish examination timetable.",
      href: "/coe/blueprints",
      icon: CheckCircle2,
      badge: "Deterministic Authority",
    },
    {
      num: 8,
      title: "Candidate Admit Card & Companion Preflight",
      role: "Candidate",
      desc: "Verify institutional eligibility, download hall ticket, and test hardware readiness.",
      href: "/student/preflight",
      icon: ShieldCheck,
      badge: "Pre-Exam Gate",
    },
    {
      num: 9,
      title: "Live Proctor Companion Pairing",
      role: "Candidate Desktop",
      desc: "Native Linux companion pairs with active attempt, verifying camera and MediaPipe landmarks.",
      href: "/student/preflight",
      icon: Eye,
      badge: "15s Heartbeat Lease",
    },
    {
      num: 10,
      title: "Live Examination Runner (MCQ + Coding)",
      role: "Candidate",
      desc: "Answer timed MCQs and write code executed in isolated Linux Bubblewrap containers.",
      href: "/student",
      icon: Code2,
      badge: "Strictly Proctored",
    },
    {
      num: 11,
      title: "Invigilator Real-Time Monitoring & Incident Review",
      role: "Invigilator",
      desc: "Live observation timeline, automated gaze/head pose incident review, and candidate intervention.",
      href: "/invigilator/live",
      icon: Eye,
      badge: "Live Telemetry",
    },
    {
      num: 12,
      title: "Faculty Grading, COE Moderation & Result Publication",
      role: "COE / Faculty",
      desc: "Subjective score review, authoritative result moderation, and released student scorecard with PDF/CSV export.",
      href: "/coe/results",
      icon: Download,
      badge: "Final Publication",
    },
  ];

  return (
    <div className="min-h-screen bg-[#F8F8F7] text-[#161616] font-serif p-6 md:p-10">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <div className="border-b border-[#E6E4E4] pb-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#981B2B]" />
              <span className="text-xs font-bold text-[#981B2B] uppercase tracking-wider font-mono">
                AURA Phase 25 Integration
              </span>
            </div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight font-serif text-[#0B2545]">
              Live Demonstration & Workflow Hub
            </h1>
            <p className="text-sm text-[#475569] mt-1 max-w-2xl font-sans">
              Complete owner-operated walkthrough of the Online Examination System from document parsing and question authoring to proctored examination and scorecard publication.
            </p>
          </div>

          <div className="flex items-center gap-3 font-sans">
            <Link
              href="/login"
              className="px-4 py-2 bg-[#981B2B] text-white text-xs font-bold rounded-lg hover:bg-[#7D1623] transition-colors shadow-xs"
            >
              Sign In to Portal
            </Link>
          </div>
        </div>

        {/* System Topology Banner */}
        <div className="bg-white rounded-xl border border-[#E6E4E4] p-5 shadow-xs font-sans">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-[#E6E4E4]">
            <div className="flex items-center gap-2">
              <Server className="w-4 h-4 text-[#0F4C81]" />
              <span className="text-xs font-bold text-[#0B2545] font-serif uppercase tracking-wider">
                Service Topology & Status
              </span>
            </div>
            <span className="text-[11px] font-mono text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 font-bold">
              Database: aura_phase25_integration (54322)
            </span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
              <div className="text-[10px] text-slate-500 uppercase font-mono">Web Application</div>
              <div className="font-bold text-[#0B2545] mt-0.5 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-600" />
                Port 33255 (Next.js 14)
              </div>
            </div>

            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
              <div className="text-[10px] text-slate-500 uppercase font-mono">Isolated Coding Judge</div>
              <div className="font-bold text-[#0B2545] mt-0.5 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-600" />
                Linux Bubblewrap
              </div>
            </div>

            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
              <div className="text-[10px] text-slate-500 uppercase font-mono">Proctor Companion</div>
              <div className="font-bold text-[#0B2545] mt-0.5 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse" />
                Port 4200 / 4202
              </div>
            </div>

            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
              <div className="text-[10px] text-slate-500 uppercase font-mono">Heartbeat Reaper</div>
              <div className="font-bold text-[#0B2545] mt-0.5 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-600" />
                15-Second Lease Window
              </div>
            </div>
          </div>
        </div>

        {/* 12-Step Full Lifecycle Grid */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-[#0B2545] font-serif">
              Complete End-to-End Operational Lifecycle
            </h2>
            <span className="text-xs text-[#64748B] font-mono font-medium">12 Connected Stages</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 font-sans">
            {workflowSteps.map((step) => {
              const Icon = step.icon;
              return (
                <Link
                  key={step.num}
                  href={step.href}
                  className="bg-white rounded-xl border border-[#E6E4E4] p-5 hover:border-[#981B2B] hover:shadow-sm transition-all group flex flex-col justify-between"
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="w-8 h-8 rounded-lg bg-[#E8F0F8] text-[#0F4C81] flex items-center justify-center font-bold text-xs font-mono group-hover:bg-[#981B2B] group-hover:text-white transition-colors">
                        {String(step.num).padStart(2, "0")}
                      </div>
                      <span className="text-[10px] font-mono uppercase bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-semibold border border-slate-200">
                        {step.badge}
                      </span>
                    </div>

                    <div>
                      <h3 className="font-bold text-sm text-[#0B2545] group-hover:text-[#981B2B] transition-colors font-serif">
                        {step.title}
                      </h3>
                      <div className="text-[11px] text-[#64748B] font-medium mt-0.5">
                        Role: {step.role}
                      </div>
                      <p className="text-xs text-[#475569] mt-2 leading-relaxed">
                        {step.desc}
                      </p>
                    </div>
                  </div>

                  <div className="pt-4 mt-3 border-t border-slate-100 flex items-center justify-between text-xs font-semibold text-[#0F4C81] group-hover:text-[#981B2B] transition-colors">
                    <span>Open Step</span>
                    <ChevronRight className="w-4 h-4 transform group-hover:translate-x-1 transition-transform" />
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
