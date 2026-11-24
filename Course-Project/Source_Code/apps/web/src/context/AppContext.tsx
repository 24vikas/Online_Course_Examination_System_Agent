"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import type {
  Exam,
  ExamSubmission,
  IntegrityLog,
  Grievance,
  UserProfile,
  Registration,
} from "../types/exam";
import type { ActiveTab } from "../components/layout/Sidebar";
import {
  INITIAL_USERS,
  INITIAL_EXAMS,
  INITIAL_SUBMISSIONS,
  INITIAL_INTEGRITY_LOGS,
  INITIAL_GRIEVANCES,
} from "../firebase/seedData";
import {
  getExams,
  getSubmissions,
  getIntegrityLogs,
  getGrievances,
  getRegistrations,
  ensureFirebaseAuth,
} from "../firebase/services";
import { setActiveRole, setActiveUserId, setActiveUserEmail } from "../utils/apiClient";
import type { ToastPayload } from "../utils/toast";

export interface ActiveExamSession {
  exam: Exam;
  initialStream: MediaStream | null;
  candidatePhotoUrl: string;
  verificationToken: string;
  isVirtualCamera?: boolean;
  attemptId?: string;
  serverDeadline?: string;
}

interface AppContextType {
  currentUser: UserProfile;
  currentTab: ActiveTab;
  exams: Exam[];
  submissions: ExamSubmission[];
  integrityLogs: IntegrityLog[];
  grievances: Grievance[];
  registrations: Registration[];
  toasts: ToastPayload[];
  isSimulatedData: boolean;
  onboardingExam: Exam | null;
  activeExamSession: ActiveExamSession | null;
  isAIChatOpen: boolean;
  isSystemOpsOpen: boolean;
  isSidePanelOpen: boolean;
  isAuthOpen: boolean;
  chatRole: "student_advisor" | "faculty_invigilator" | "grievance_mediator";
  headerSearch: string;
  focusedGrievanceId: string | null;

  // Actions
  setHeaderSearch: (q: string) => void;
  setCurrentTab: (tab: ActiveTab) => void;
  setExams: React.Dispatch<React.SetStateAction<Exam[]>>;
  setSubmissions: React.Dispatch<React.SetStateAction<ExamSubmission[]>>;
  setIntegrityLogs: React.Dispatch<React.SetStateAction<IntegrityLog[]>>;
  setGrievances: React.Dispatch<React.SetStateAction<Grievance[]>>;
  setRegistrations: React.Dispatch<React.SetStateAction<Registration[]>>;
  setIsAIChatOpen: (open: boolean) => void;
  setIsSystemOpsOpen: (open: boolean) => void;
  setIsSidePanelOpen: (open: boolean) => void;
  setIsAuthOpen: (open: boolean) => void;
  setChatRole: (role: "student_advisor" | "faculty_invigilator" | "grievance_mediator") => void;
  setOnboardingExam: (exam: Exam | null) => void;
  setActiveExamSession: (session: ActiveExamSession | null) => void;
  setFocusedGrievanceId: (id: string | null) => void;

  handleSwitchUser: (user: UserProfile, shouldRedirect?: boolean) => void;
  handleSelectTab: (tab: ActiveTab) => void;
  handleStartExamOnboarding: (exam: Exam) => void;
  handleProceedFromOnboarding: (data: {
    candidatePhotoUrl: string;
    verificationToken: string;
    stream: MediaStream | null;
    isVirtualCamera?: boolean;
  }) => void;
  handleFinishExam: (submission: ExamSubmission) => void;
  handleOpenAIChat: (role?: "student_advisor" | "faculty_invigilator" | "grievance_mediator") => void;
  handleDismissToast: (id: string) => void;
  handleRefreshExams: () => Promise<void>;
}

const AppContext = createContext<AppContextType | null>(null);

export const TAB_ROUTE_MAP: Record<ActiveTab, string> = {
  coe_dashboard: "/coe",
  faculty_dashboard: "/lecturer",
  faculty_planner: "/lecturer?tab=faculty_planner",
  faculty_syllabus_rag: "/assessments/draft",
  faculty_node_graph: "/worklet",
  faculty_reviews: "/lecturer?tab=faculty_reviews",
  faculty_grievances: "/lecturer/grievances",
  faculty_questions: "/assessments/draft",
  faculty_exams: "/lecturer?tab=faculty_planner",
  student_study_hub: "/student/study",
  student_exams: "/student",
  student_testing_hall: "/student/practice",
  student_scorecard: "/student/scorecard",
  student_practice: "/student/practice",
  student_grievances: "/student/grievances",
  verification_protocol: "/admin/verify",
  design_system: "/design-system",
};

export const ANONYMOUS_USER: UserProfile = {
  id: "",
  email: "",
  displayName: "Guest",
  role: "student",
  roleTitle: "Guest",
  department: "KLE Technological University",
  attendanceRate: 0,
  feeCleared: false,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

export function AppProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  const [currentUser, setCurrentUser] = useState<UserProfile>(ANONYMOUS_USER);
  const [currentTab, setCurrentTab] = useState<ActiveTab>("student_exams");
  const [exams, setExams] = useState<Exam[]>(INITIAL_EXAMS.filter((e) => e.isMockOrPractice));
  const [submissions, setSubmissions] = useState<ExamSubmission[]>(INITIAL_SUBMISSIONS);
  const [integrityLogs, setIntegrityLogs] = useState<IntegrityLog[]>(INITIAL_INTEGRITY_LOGS);
  const [grievances, setGrievances] = useState<Grievance[]>(INITIAL_GRIEVANCES);
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [toasts, setToasts] = useState<ToastPayload[]>([]);
  const [isSimulatedData, setIsSimulatedData] = useState<boolean>(false);

  const [headerSearch, setHeaderSearch] = useState<string>("");
  const [focusedGrievanceId, setFocusedGrievanceId] = useState<string | null>(null);

  const [onboardingExam, setOnboardingExam] = useState<Exam | null>(null);
  const [activeExamSession, setActiveExamSession] = useState<ActiveExamSession | null>(null);

  const [isAIChatOpen, setIsAIChatOpen] = useState<boolean>(false);
  const [isSystemOpsOpen, setIsSystemOpsOpen] = useState<boolean>(false);
  const [isSidePanelOpen, setIsSidePanelOpen] = useState<boolean>(false);
  const [isAuthOpen, setIsAuthOpen] = useState<boolean>(false);
  const [chatRole, setChatRole] = useState<"student_advisor" | "faculty_invigilator" | "grievance_mediator">("faculty_invigilator");

  // Single unified session & data initialization on mount
  useEffect(() => {
    let active = true;

    async function initializeSessionAndData() {
      let resolvedUser = ANONYMOUS_USER;
      try {
        const meRes = await fetch("/api/auth/me", { cache: "no-store" });
        if (meRes.ok) {
          const meData = await meRes.json();
          if (meData?.user) {
            const roleUpper = (meData.user.role || "").toUpperCase();
            const mappedRole =
              roleUpper === "COE_ADMIN" || roleUpper === "SYSTEM_ADMIN"
                ? "author"
                : roleUpper === "STUDENT"
                ? "student"
                : "faculty";

            resolvedUser = {
              id: meData.user.id,
              email: meData.user.email,
              displayName: meData.user.displayName || meData.user.email.split("@")[0],
              studentId: meData.user.usn,
              role: mappedRole as any,
              roleTitle: meData.user.role,
              department: "KLE Technological University",
              attendanceRate: 100,
              feeCleared: true,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            };

            if (active) {
              setCurrentUser(resolvedUser);
              setActiveRole(mappedRole);
              setActiveUserId(resolvedUser.id);
              setActiveUserEmail(resolvedUser.email);
              if (typeof window !== "undefined") {
                localStorage.setItem("exam_sys_active_role", mappedRole);
                localStorage.setItem("exam_sys_active_user_id", resolvedUser.id);
                localStorage.setItem("exam_sys_active_user_email", resolvedUser.email);
              }
            }
          }
        }
      } catch (authErr) {
        console.warn("Session check notice:", authErr);
      }

      // Load initial application data
      try {
        await ensureFirebaseAuth(resolvedUser);
        const [dbExams, loadedSubs, loadedLogs, loadedGrievances, loadedRegs] = await Promise.all([
          fetchAuthoritativeExams(),
          getSubmissions(),
          getIntegrityLogs(),
          getGrievances(),
          getRegistrations(),
        ]);

        if (!active) return;
        const practiceOnly = INITIAL_EXAMS.filter((e) => e.isMockOrPractice);
        if (dbExams.length > 0) {
          setExams([...dbExams, ...practiceOnly]);
        } else {
          setExams(practiceOnly);
        }
        if (loadedSubs.length > 0) setSubmissions(loadedSubs);
        if (loadedLogs.length > 0) setIntegrityLogs(loadedLogs);
        if (loadedGrievances.length > 0) setGrievances(loadedGrievances);
        setRegistrations(loadedRegs.filter((r) => practiceOnly.some((exam) => exam.id === r.examId)));
        setIsSimulatedData(false);
      } catch (dataErr) {
        console.warn("Initial data load notice:", dataErr);
        if (active) setIsSimulatedData(false);
      }
    }

    initializeSessionAndData();

    return () => {
      active = false;
    };
  }, []);

  // Sync role header on mount and user switch
  useEffect(() => {
    setActiveRole(currentUser.role);
    setActiveUserId(currentUser.id);
    setActiveUserEmail(currentUser.email);
  }, [currentUser]);

  // Sync active tab with current pathname
  useEffect(() => {
    if (pathname === "/coe") setCurrentTab("coe_dashboard");
    else if (pathname === "/lecturer") setCurrentTab("faculty_dashboard");
    else if (pathname === "/lecturer/grievances") setCurrentTab("faculty_grievances");
    else if (pathname === "/student") setCurrentTab("student_exams");
    else if (pathname === "/student/practice") setCurrentTab("student_practice");
    else if (pathname === "/student/scorecard") setCurrentTab("student_scorecard");
    else if (pathname === "/student/study") setCurrentTab("student_study_hub");
    else if (pathname === "/student/grievances") setCurrentTab("student_grievances");
    else if (pathname === "/worklet") setCurrentTab("faculty_node_graph");
    else if (pathname === "/assessments/draft") setCurrentTab("faculty_syllabus_rag");
    else if (pathname === "/admin/verify") setCurrentTab("verification_protocol");
    else if (pathname === "/design-system") setCurrentTab("design_system");
  }, [pathname]);

  // Global toast listener
  useEffect(() => {
    const handleToastEvent = (e: Event) => {
      const custom = e as CustomEvent<ToastPayload>;
      if (custom.detail) {
        const t = custom.detail;
        setToasts((prev) => [...prev, t]);
        setTimeout(() => {
          setToasts((prev) => prev.filter((item) => item.id !== t.id));
        }, t.durationMs || 5000);
      }
    };
    window.addEventListener("academic-app-toast", handleToastEvent);
    return () => window.removeEventListener("academic-app-toast", handleToastEvent);
  }, []);

  const fetchAuthoritativeExams = async (): Promise<Exam[]> => {
    try {
      let res = await fetch("/api/student/exams/scheduled?courseCode=26ECAC401");
      if (!res.ok) {
        res = await fetch("/api/coe/schedules");
      }
      if (res.ok) {
        const data = await res.json();
        const rawList = data.schedules || [];
        if (rawList.length > 0) {
          return rawList.map((s: any) => ({
            id: s.id,
            title: s.title || `Internal Assessment 1: Agentic AI Foundations (${s.courseCode || "26ECAC401"})`,
            courseCode: s.courseCode || "26ECAC401",
            facultyId: "fac_authoritative",
            facultyName: "Department Faculty",
            description: `KLE Technological University Authoritative Examination for ${s.courseTitle || "Agentic AI"} (${s.courseCode || "26ECAC401"})`,
            durationMinutes: s.durationMinutes || 60,
            totalMarks: s.totalMarks || 50,
            passingScore: Math.round((s.totalMarks || 50) * 0.4),
            type: "objective" as const,
            isMockOrPractice: false,
            registrationStart: new Date(Date.now() - 7 * 86400000).toISOString(),
            registrationEnd: s.endTime || new Date(Date.now() + 86400000).toISOString(),
            examStart: s.startTime || new Date().toISOString(),
            examEnd: s.endTime || new Date(Date.now() + 86400000).toISOString(),
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
            coeApprovedAt: s.publishedAt || new Date().toISOString(),
            createdAt: s.publishedAt || new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }));
        }
      }
    } catch (err) {
      console.warn("Failed to fetch authoritative scheduled exams:", err);
    }
    return [];
  };

  const handleSwitchUser = useCallback(
    (user: UserProfile, shouldRedirect = false) => {
      setCurrentUser(user);
      setActiveRole(user.role);
      setActiveUserId(user.id);
      setActiveUserEmail(user.email);
      ensureFirebaseAuth(user).catch(() => {});
      if (user.role === "author") {
        setCurrentTab("coe_dashboard");
        setChatRole("faculty_invigilator");
        if (shouldRedirect && pathname.startsWith("/student")) router.push("/coe");
      } else if (user.role === "faculty") {
        setCurrentTab("faculty_dashboard");
        setChatRole("faculty_invigilator");
        if (shouldRedirect && pathname.startsWith("/student")) router.push("/lecturer");
      } else {
        setCurrentTab("student_exams");
        setChatRole("student_advisor");
        if (shouldRedirect && !pathname.startsWith("/student")) router.push("/student");
      }
    },
    [pathname, router]
  );

  const handleSelectTab = useCallback(
    (tab: ActiveTab) => {
      setCurrentTab(tab);
      const targetRoute = TAB_ROUTE_MAP[tab];
      if (targetRoute && pathname !== targetRoute) {
        router.push(targetRoute);
      }
    },
    [pathname, router]
  );

  const handleStartExamOnboarding = useCallback((exam: Exam) => {
    setOnboardingExam(exam);
  }, []);

  const handleProceedFromOnboarding = useCallback(
    (data: {
      candidatePhotoUrl: string;
      verificationToken: string;
      stream: MediaStream | null;
      isVirtualCamera?: boolean;
      attemptId?: string;
      serverDeadline?: string;
    }) => {
      setOnboardingExam((currentOnboarding) => {
        if (currentOnboarding) {
          setActiveExamSession({
            exam: currentOnboarding,
            initialStream: data.stream,
            candidatePhotoUrl: data.candidatePhotoUrl,
            verificationToken: data.verificationToken,
            isVirtualCamera: data.isVirtualCamera,
            attemptId: data.attemptId,
            serverDeadline: data.serverDeadline,
          });
        }
        return null;
      });
    },
    []
  );

  const handleFinishExam = useCallback(
    (submission: ExamSubmission) => {
      setSubmissions((prev) => [submission, ...prev.filter((s) => s.id !== submission.id)]);
      setActiveExamSession(null);
      setOnboardingExam(null);
      setCurrentTab("student_scorecard");
      router.push("/student/scorecard");
    },
    [router]
  );

  const handleOpenAIChat = useCallback(
    (role?: "student_advisor" | "faculty_invigilator" | "grievance_mediator") => {
      if (role) setChatRole(role);
      setIsAIChatOpen(true);
    },
    []
  );

  const handleDismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const handleRefreshExams = useCallback(async () => {
    try {
      const dbExams = await fetchAuthoritativeExams();
      const practiceOnly = INITIAL_EXAMS.filter((e) => e.isMockOrPractice);
      if (dbExams.length > 0) {
        setExams([...dbExams, ...practiceOnly]);
      } else {
        setExams(practiceOnly);
      }
    } catch (err) {
      console.warn("Failed to refresh exams:", err);
    }
  }, []);

  return (
    <AppContext.Provider
      value={{
        currentUser,
        currentTab,
        exams,
        submissions,
        integrityLogs,
        grievances,
        registrations,
        toasts,
        isSimulatedData,
        onboardingExam,
        activeExamSession,
        isAIChatOpen,
        isSystemOpsOpen,
        isSidePanelOpen,
        isAuthOpen,
        chatRole,
        headerSearch,
        focusedGrievanceId,

        setHeaderSearch,
        setCurrentTab,
        setExams,
        setSubmissions,
        setIntegrityLogs,
        setGrievances,
        setRegistrations,
        setIsAIChatOpen,
        setIsSystemOpsOpen,
        setIsSidePanelOpen,
        setIsAuthOpen,
        setChatRole,
        setOnboardingExam,
        setActiveExamSession,
        setFocusedGrievanceId,

        handleSwitchUser,
        handleSelectTab,
        handleStartExamOnboarding,
        handleProceedFromOnboarding,
        handleFinishExam,
        handleOpenAIChat,
        handleDismissToast,
        handleRefreshExams,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useAppContext() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error("useAppContext must be used within an AppProvider");
  }
  return context;
}
