"use client";

import React from "react";
import { usePathname } from "next/navigation";
import { AppProvider, useAppContext } from "../../context/AppContext";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { StudentHeader } from "./StudentHeader";
import { FallbackDataBanner } from "./FallbackDataBanner";
import { OperationsSidePanel } from "./OperationsSidePanel";
import { SystemOperationsModal } from "./SystemOperationsModal";
import { AuthModal } from "./AuthModal";
import { AcademicAIChatModal } from "../chat/AcademicAIChatModal";
import { CandidateOnboardingModal } from "../student/CandidateOnboardingModal";
import { ExamRunner } from "../student/ExamRunner";
import { ToastContainer } from "../ui/Toast";
import { SidebarProvider } from "../ui/sidebar";

function GlobalAppShellInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [isSidebarOpen, setIsSidebarOpen] = React.useState(true);
  const {
    currentUser,
    currentTab,
    exams,
    submissions,
    integrityLogs,
    grievances,
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

    setHeaderSearch,
    setIsAIChatOpen,
    setIsSystemOpsOpen,
    setIsSidePanelOpen,
    setIsAuthOpen,
    setOnboardingExam,
    setActiveExamSession,

    handleSwitchUser,
    handleSelectTab,
    handleProceedFromOnboarding,
    handleFinishExam,
    handleOpenAIChat,
    handleDismissToast,
  } = useAppContext();

  // Badges calculation
  const pendingSubjectiveCount = submissions.filter((s) => !s.facultyApproved).length;
  const unreviewedIntegrityCount = integrityLogs.filter((l) => !l.facultyReviewed).length;
  const pendingGrievancesCount = grievances.filter(
    (g) => g.status === "pending" || g.status === "under_review"
  ).length;

  // Dedicated official proctored exam runner route
  const isDedicatedExamRoute = pathname?.startsWith("/student/exam/");
  if (isDedicatedExamRoute) {
    return <>{children}</>;
  }

  // Dedicated clean login & root gateway page
  if (pathname === "/login" || pathname === "/") {
    return <>{children}</>;
  }

  // Active distraction-free exam taking mode
  if (activeExamSession) {
    return (
      <ExamRunner
        exam={activeExamSession.exam}
        currentUser={currentUser}
        initialStream={activeExamSession.initialStream}
        candidatePhotoUrl={activeExamSession.candidatePhotoUrl}
        verificationToken={activeExamSession.verificationToken}
        isVirtualCamera={activeExamSession.isVirtualCamera}
        attemptId={activeExamSession.attemptId}
        serverDeadline={activeExamSession.serverDeadline}
        onFinishExam={handleFinishExam}
        onExit={() => setActiveExamSession(null)}
      />
    );
  }

  // DEDICATED STUDENT LAYOUT
  const isStudentRoute = pathname?.startsWith("/student");
  if (isStudentRoute) {
    return (
      <SidebarProvider>
        <div
          id="student-portal-root"
          className="min-h-screen bg-[#F8F8F7] flex font-serif text-[#161616] antialiased select-none"
        >
          <FallbackDataBanner isSimulated={isSimulatedData} />

          <Sidebar
            currentTab={currentTab}
            onSelectTab={handleSelectTab}
            currentUser={currentUser}
            pendingReviewsCount={pendingSubjectiveCount}
            integrityFlagsCount={unreviewedIntegrityCount}
            grievancesCount={pendingGrievancesCount}
            isOpen={isSidebarOpen}
            onClose={() => setIsSidebarOpen(false)}
          />

          <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
            <StudentHeader
              currentTab={currentTab}
              onSelectTab={handleSelectTab}
              currentUser={currentUser}
              onOpenAIChat={() => handleOpenAIChat("student_advisor")}
              onOpenAuthModal={() => setIsAuthOpen(true)}
              grievancesCount={pendingGrievancesCount}
              onToggleSidebar={() => setIsSidebarOpen((prev) => !prev)}
            />

            <main className="flex-1 overflow-y-auto max-w-7xl w-full mx-auto p-6">{children}</main>
          </div>

          {/* Candidate Onboarding & Proctored Verification Gate Modal */}
          {onboardingExam && (
            <CandidateOnboardingModal
              isOpen={!!onboardingExam}
              onClose={() => setOnboardingExam(null)}
              exam={onboardingExam}
              currentUser={currentUser}
              onProceedToExam={handleProceedFromOnboarding}
            />
          )}

          {/* Global Modals */}
          <AcademicAIChatModal
            isOpen={isAIChatOpen}
            onClose={() => setIsAIChatOpen(false)}
            currentUser={currentUser}
            defaultRole={chatRole}
          />

          <AuthModal
            isOpen={isAuthOpen}
            onClose={() => setIsAuthOpen(false)}
            currentUser={currentUser}
            onUserAuthenticated={handleSwitchUser}
          />

          <ToastContainer toasts={toasts} onDismiss={handleDismissToast} />

        </div>
      </SidebarProvider>
    );
  }

  // DEDICATED COE & FACULTY LAYOUT
  return (
    <SidebarProvider>
      <div
        id="examination-system-root"
        className="flex flex-col h-screen bg-[#F8F8F7] font-serif text-[#161616] antialiased overflow-hidden select-none"
      >
        <FallbackDataBanner isSimulated={isSimulatedData} />

        <div className="flex-1 flex min-w-0 overflow-hidden">
          {/* Authentic Left Sidebar */}
          <Sidebar
            currentTab={currentTab}
            onSelectTab={handleSelectTab}
            currentUser={currentUser}
            pendingReviewsCount={pendingSubjectiveCount}
            integrityFlagsCount={unreviewedIntegrityCount}
            grievancesCount={pendingGrievancesCount}
            isOpen={isSidebarOpen}
            onClose={() => setIsSidebarOpen(false)}
          />

          {/* Main Administrative Workspace */}
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
            <Header
              currentTab={currentTab}
              currentUser={currentUser}
              onNewExam={() => handleSelectTab("faculty_planner")}
              searchQuery={headerSearch}
              onSearchChange={setHeaderSearch}
              onOpenSidePanel={() => setIsSidePanelOpen(true)}
              onOpenAuthModal={() => setIsAuthOpen(true)}
              onSwitchUser={handleSwitchUser}
              notificationCount={pendingSubjectiveCount + unreviewedIntegrityCount}
              onToggleSidebar={() => setIsSidebarOpen((prev) => !prev)}
            />

            <main className="flex-1 overflow-y-auto">{children}</main>
          </div>
        </div>

        {/* Global Modals */}
        <AcademicAIChatModal
          isOpen={isAIChatOpen}
          onClose={() => setIsAIChatOpen(false)}
          currentUser={currentUser}
          defaultRole={chatRole}
        />

        <SystemOperationsModal
          isOpen={isSystemOpsOpen}
          onClose={() => setIsSystemOpsOpen(false)}
          currentUser={currentUser}
        />

        <OperationsSidePanel
          isOpen={isSidePanelOpen}
          onClose={() => setIsSidePanelOpen(false)}
          currentUser={currentUser}
          onOpenAIChat={handleOpenAIChat}
          onOpenSystemOps={() => setIsSystemOpsOpen(true)}
        />

        <AuthModal
          isOpen={isAuthOpen}
          onClose={() => setIsAuthOpen(false)}
          currentUser={currentUser}
          onUserAuthenticated={handleSwitchUser}
        />

        <ToastContainer toasts={toasts} onDismiss={handleDismissToast} />

      </div>
    </SidebarProvider>
  );
}

export function GlobalAppShell({ children }: { children: React.ReactNode }) {
  return (
    <AppProvider>
      <GlobalAppShellInner>{children}</GlobalAppShellInner>
    </AppProvider>
  );
}
