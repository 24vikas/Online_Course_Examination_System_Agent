"use client";

import React from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import {
  LayoutDashboard,
  FileSpreadsheet,
  Shield,
  ShieldAlert,
  GraduationCap,
  FileText,
  Clock,
  HelpCircle,
  FileCheck2,
  Users,
  LogOut,
  FolderOpen,
  Award,
  ScrollText,
  BookOpen,
  Compass,
  X,
  ChevronLeft,
  ChevronRight,
  User,
} from "lucide-react";
import { BrandLogo } from "../ui/BrandLogo";
import type { UserProfile } from "../../types/exam";
import {
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarFooter,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from "../ui/sidebar";

interface RoleNavigationSidebarProps {
  currentUser: UserProfile;
  pendingReviewsCount?: number;
  integrityFlagsCount?: number;
  grievancesCount?: number;
  isOpen?: boolean;
  onClose?: () => void;
}

export const RoleNavigationSidebar: React.FC<RoleNavigationSidebarProps> = ({
  currentUser,
  pendingReviewsCount = 0,
  integrityFlagsCount = 0,
  grievancesCount = 0,
}) => {
  const pathname = usePathname();
  const router = useRouter();
  const { state, isMobile, setOpenMobile, toggleSidebar } = useSidebar();

  // If inside an active locked official exam session, hide the sidebar completely
  if (pathname?.startsWith("/student/exam/")) {
    return null;
  }

  const isCollapsed = !isMobile && state === "collapsed";

  const role = (currentUser?.roleTitle || currentUser?.role || "").toUpperCase();
  const isStudent = role === "STUDENT" || currentUser?.role === "student";
  const isInvigilator = role === "INVIGILATOR" || currentUser?.email?.includes("invigilator");
  const isCoe =
    role === "COE_ADMIN" ||
    role === "AUTHOR" ||
    currentUser?.role === "author" ||
    currentUser?.email?.includes("coe");
  const isFaculty = !isStudent && !isInvigilator && !isCoe;

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // ignore
    }
    router.push("/login");
  };

  const handleLinkClick = () => {
    if (isMobile) {
      setOpenMobile(false);
    }
  };

  const roleBadgeLabel = isCoe
    ? "COE Administrator"
    : isInvigilator
    ? "Exam Invigilator"
    : isFaculty
    ? "Faculty Examiner"
    : "Candidate";

  return (
    <Sidebar id="institutional-role-sidebar" aria-label="Institutional Role Navigation">
      {/* 1. Header: Brand Logo & Collapse Trigger */}
      <SidebarHeader>
        {isCollapsed ? (
          <div className="flex flex-col items-center justify-center w-full py-1">
            <button
              onClick={toggleSidebar}
              title="Expand Sidebar (Cmd+B)"
              className="p-1.5 rounded-md hover:bg-[#F8F8F7] text-[#981B2B] font-bold text-sm"
            >
              KLE
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between w-full">
            <BrandLogo size="sm" height={26} showSubtitle subtitle="Examination" />
            <div className="flex items-center gap-1">
              {isMobile ? (
                <button
                  onClick={() => setOpenMobile(false)}
                  aria-label="Close sidebar"
                  className="p-1 rounded-md text-[#686868] hover:text-[#161616] hover:bg-[#F8F8F7]"
                >
                  <X className="w-5 h-5" />
                </button>
              ) : (
                <SidebarTrigger title="Collapse sidebar (Cmd+B)" />
              )}
            </div>
          </div>
        )}
      </SidebarHeader>

      {/* 2. Active User Profile Summary */}
      {!isCollapsed ? (
        <div className="px-3.5 py-2.5 bg-[#F8F8F7] border-b border-[#E6E4E4]">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#981B2B]" />
            <span className="text-[10px] uppercase font-bold text-[#981B2B] tracking-wider font-serif">
              {roleBadgeLabel}
            </span>
          </div>
          <div className="text-xs font-bold text-[#161616] truncate mt-0.5 font-serif">
            {currentUser?.displayName || currentUser?.email || "Academic User"}
          </div>
          <div className="text-[10px] text-[#686868] font-mono truncate">
            {currentUser?.email || ""}
          </div>
        </div>
      ) : (
        <div className="py-2 flex justify-center border-b border-[#E6E4E4]" title={`${roleBadgeLabel}: ${currentUser?.displayName}`}>
          <div className="w-8 h-8 rounded-full bg-[#981B2B]/10 text-[#981B2B] flex items-center justify-center font-bold text-xs">
            {currentUser?.displayName?.charAt(0) || "U"}
          </div>
        </div>
      )}

      {/* 3. Navigation Content */}
      <SidebarContent>
        {/* STUDENT NAVIGATION */}
        {isStudent && (
          <SidebarGroup>
            <SidebarGroupLabel>Candidate Portal</SidebarGroupLabel>
            <SidebarMenu>
              <SidebarMenuItem>
                <Link href="/student" onClick={handleLinkClick}>
                  <SidebarMenuButton isActive={pathname === "/student"} tooltip="Overview & Courses">
                    <LayoutDashboard className="w-4 h-4 shrink-0 text-[#981B2B]" />
                    {!isCollapsed && <span className="truncate">Overview &amp; Courses</span>}
                  </SidebarMenuButton>
                </Link>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <Link href="/student/hall-ticket" onClick={handleLinkClick}>
                  <SidebarMenuButton isActive={pathname === "/student/hall-ticket"} tooltip="Admit Card & Hall Ticket">
                    <FileText className="w-4 h-4 shrink-0" />
                    {!isCollapsed && <span className="truncate">Admit Card &amp; Hall Ticket</span>}
                  </SidebarMenuButton>
                </Link>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <Link href="/student/preflight" onClick={handleLinkClick}>
                  <SidebarMenuButton isActive={pathname === "/student/preflight"} tooltip="Companion Preflight">
                    <Shield className="w-4 h-4 shrink-0 text-emerald-700" />
                    {!isCollapsed && <span className="truncate">Companion Preflight</span>}
                  </SidebarMenuButton>
                </Link>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <Link href="/student/practice" onClick={handleLinkClick}>
                  <SidebarMenuButton isActive={pathname === "/student/practice"} tooltip="Testing Hall & Practice">
                    <FileSpreadsheet className="w-4 h-4 shrink-0" />
                    {!isCollapsed && <span className="truncate">Testing Hall &amp; Practice</span>}
                  </SidebarMenuButton>
                </Link>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <Link href="/student/scorecard" onClick={handleLinkClick}>
                  <SidebarMenuButton isActive={pathname === "/student/scorecard"} tooltip="Scorecards & Transcripts">
                    <Award className="w-4 h-4 shrink-0" />
                    {!isCollapsed && <span className="truncate">Scorecards &amp; Transcripts</span>}
                  </SidebarMenuButton>
                </Link>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <Link href="/student/grievances" onClick={handleLinkClick}>
                  <SidebarMenuButton isActive={pathname === "/student/grievances"} tooltip="Academic Grievances">
                    <HelpCircle className="w-4 h-4 shrink-0" />
                    {!isCollapsed && (
                      <div className="flex items-center justify-between w-full">
                        <span className="truncate">Academic Grievances</span>
                        {grievancesCount > 0 && (
                          <span className="w-2 h-2 rounded-full bg-amber-500" />
                        )}
                      </div>
                    )}
                  </SidebarMenuButton>
                </Link>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroup>
        )}

        {/* FACULTY NAVIGATION */}
        {isFaculty && (
          <SidebarGroup>
            <SidebarGroupLabel>Faculty Operations</SidebarGroupLabel>
            <SidebarMenu>
              <SidebarMenuItem>
                <Link href="/lecturer" onClick={handleLinkClick}>
                  <SidebarMenuButton isActive={pathname === "/lecturer" || pathname === "/faculty"} tooltip="Course Offerings">
                    <FolderOpen className="w-4 h-4 shrink-0 text-[#981B2B]" />
                    {!isCollapsed && <span className="truncate">Course Offerings</span>}
                  </SidebarMenuButton>
                </Link>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <Link href="/coe/documents" onClick={handleLinkClick}>
                  <SidebarMenuButton isActive={pathname === "/coe/documents"} tooltip="Curriculum & Ingestion">
                    <FileText className="w-4 h-4 shrink-0" />
                    {!isCollapsed && <span className="truncate">Curriculum &amp; Ingestion</span>}
                  </SidebarMenuButton>
                </Link>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <Link href="/lecturer/question-bank" onClick={handleLinkClick}>
                  <SidebarMenuButton isActive={pathname === "/lecturer/question-bank"} tooltip="Question Drafting & Bank">
                    <ScrollText className="w-4 h-4 shrink-0" />
                    {!isCollapsed && <span className="truncate">Question Drafting &amp; Bank</span>}
                  </SidebarMenuButton>
                </Link>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <Link href="/lecturer/blueprints" onClick={handleLinkClick}>
                  <SidebarMenuButton isActive={pathname === "/lecturer/blueprints"} tooltip="Blueprints & Planning">
                    <FileSpreadsheet className="w-4 h-4 shrink-0" />
                    {!isCollapsed && <span className="truncate">Blueprints &amp; Planning</span>}
                  </SidebarMenuButton>
                </Link>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <Link href="/lecturer/marking-queue" onClick={handleLinkClick}>
                  <SidebarMenuButton isActive={pathname === "/lecturer/marking-queue"} tooltip="Subjective Marking Queue">
                    <Award className="w-4 h-4 shrink-0" />
                    {!isCollapsed && (
                      <div className="flex items-center justify-between w-full">
                        <span className="truncate">Subjective Marking Queue</span>
                        {pendingReviewsCount > 0 && (
                          <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold bg-amber-100 text-amber-800">
                            {pendingReviewsCount}
                          </span>
                        )}
                      </div>
                    )}
                  </SidebarMenuButton>
                </Link>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <Link href="/lecturer/grievances" onClick={handleLinkClick}>
                  <SidebarMenuButton isActive={pathname === "/lecturer/grievances"} tooltip="Student Grievances">
                    <HelpCircle className="w-4 h-4 shrink-0" />
                    {!isCollapsed && <span className="truncate">Student Grievances</span>}
                  </SidebarMenuButton>
                </Link>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroup>
        )}

        {/* COE NAVIGATION */}
        {isCoe && (
          <SidebarGroup>
            <SidebarGroupLabel>COE Governance</SidebarGroupLabel>
            <SidebarMenu>
              <SidebarMenuItem>
                <Link href="/coe" onClick={handleLinkClick}>
                  <SidebarMenuButton isActive={pathname === "/coe"} tooltip="COE Control Room & Inbox">
                    <LayoutDashboard className="w-4 h-4 shrink-0 text-[#981B2B]" />
                    {!isCollapsed && <span className="truncate">Control Room &amp; Inbox</span>}
                  </SidebarMenuButton>
                </Link>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <Link href="/coe/documents" onClick={handleLinkClick}>
                  <SidebarMenuButton isActive={pathname === "/coe/documents"} tooltip="Curriculum Ingestion">
                    <FileText className="w-4 h-4 shrink-0" />
                    {!isCollapsed && <span className="truncate">Curriculum Ingestion</span>}
                  </SidebarMenuButton>
                </Link>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <Link href="/lecturer/question-bank" onClick={handleLinkClick}>
                  <SidebarMenuButton isActive={pathname === "/lecturer/question-bank"} tooltip="Question Bank Approval">
                    <ScrollText className="w-4 h-4 shrink-0" />
                    {!isCollapsed && <span className="truncate">Question Bank Approval</span>}
                  </SidebarMenuButton>
                </Link>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <Link href="/coe/blueprints" onClick={handleLinkClick}>
                  <SidebarMenuButton isActive={pathname === "/coe/blueprints"} tooltip="Blueprint Validation">
                    <FileSpreadsheet className="w-4 h-4 shrink-0" />
                    {!isCollapsed && <span className="truncate">Blueprint Validation</span>}
                  </SidebarMenuButton>
                </Link>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <Link href="/coe/academic-lifecycle" onClick={handleLinkClick}>
                  <SidebarMenuButton isActive={pathname === "/coe/academic-lifecycle"} tooltip="Exam Schedules">
                    <Clock className="w-4 h-4 shrink-0" />
                    {!isCollapsed && <span className="truncate">Exam Schedules</span>}
                  </SidebarMenuButton>
                </Link>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <Link href="/invigilator/live" onClick={handleLinkClick}>
                  <SidebarMenuButton isActive={pathname === "/invigilator/live"} tooltip="Live Invigilation">
                    <Shield className="w-4 h-4 shrink-0 text-emerald-700" />
                    {!isCollapsed && (
                      <div className="flex items-center justify-between w-full">
                        <span className="truncate">Live Invigilation</span>
                        <span className="px-1 py-0.2 rounded text-[9px] font-mono font-bold bg-emerald-100 text-emerald-800">
                          LIVE
                        </span>
                      </div>
                    )}
                  </SidebarMenuButton>
                </Link>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <Link href="/coe/moderation" onClick={handleLinkClick}>
                  <SidebarMenuButton isActive={pathname === "/coe/moderation"} tooltip="Moderation & Anomaly">
                    <ShieldAlert className="w-4 h-4 shrink-0 text-amber-600" />
                    {!isCollapsed && (
                      <div className="flex items-center justify-between w-full">
                        <span className="truncate">Moderation &amp; Anomaly</span>
                        {integrityFlagsCount > 0 && (
                          <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold bg-amber-100 text-amber-800">
                            {integrityFlagsCount}
                          </span>
                        )}
                      </div>
                    )}
                  </SidebarMenuButton>
                </Link>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <Link href="/coe/results" onClick={handleLinkClick}>
                  <SidebarMenuButton isActive={pathname === "/coe/results"} tooltip="Scorecards & Export CSV">
                    <Award className="w-4 h-4 shrink-0" />
                    {!isCollapsed && <span className="truncate">Scorecards &amp; Export CSV</span>}
                  </SidebarMenuButton>
                </Link>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroup>
        )}

        {/* INVIGILATOR NAVIGATION */}
        {isInvigilator && (
          <SidebarGroup>
            <SidebarGroupLabel>Invigilation Desk</SidebarGroupLabel>
            <SidebarMenu>
              <SidebarMenuItem>
                <Link href="/invigilator/live" onClick={handleLinkClick}>
                  <SidebarMenuButton isActive={pathname === "/invigilator/live"} tooltip="Live Roster & Grid">
                    <Users className="w-4 h-4 shrink-0 text-emerald-700" />
                    {!isCollapsed && (
                      <div className="flex items-center justify-between w-full">
                        <span className="truncate">Live Roster &amp; Grid</span>
                        <span className="px-1 py-0.2 rounded text-[9px] font-mono font-bold bg-emerald-100 text-emerald-800">
                          LIVE
                        </span>
                      </div>
                    )}
                  </SidebarMenuButton>
                </Link>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <Link href="/invigilator/incidents" onClick={handleLinkClick}>
                  <SidebarMenuButton isActive={pathname === "/invigilator/incidents"} tooltip="Incident Alerts Feed">
                    <ShieldAlert className="w-4 h-4 shrink-0 text-amber-600" />
                    {!isCollapsed && <span className="truncate">Incident Alerts Feed</span>}
                  </SidebarMenuButton>
                </Link>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroup>
        )}
      </SidebarContent>

      {/* 4. Footer & Logout */}
      <SidebarFooter>
        <Link
          href="/demo"
          onClick={handleLinkClick}
          title={isCollapsed ? "Workflow Demo Hub" : undefined}
          className={`w-full flex items-center rounded-md text-xs font-bold text-[#0F4C81] hover:bg-[#E8F0F8] transition-colors cursor-pointer mb-1 ${
            isCollapsed ? "h-9 w-9 mx-auto justify-center p-0" : "gap-2 px-3 py-2"
          }`}
        >
          <Compass className="w-4 h-4 shrink-0 text-[#0F4C81]" />
          {!isCollapsed && <span>Demo &amp; Workflow Hub</span>}
        </Link>

        <button
          id="role-sidebar-logout-button"
          onClick={handleLogout}
          title={isCollapsed ? "Sign Out" : undefined}
          className={`w-full flex items-center rounded-md text-xs font-bold text-[#981B2B] hover:bg-red-50 transition-colors cursor-pointer ${
            isCollapsed ? "h-9 w-9 mx-auto justify-center p-0" : "gap-2 px-3 py-2"
          }`}
        >
          <LogOut className="w-4 h-4 shrink-0" />
          {!isCollapsed && <span>Sign Out</span>}
        </button>
      </SidebarFooter>

      {/* 5. Desktop Rail Drag/Click Strip */}
      <SidebarRail />
    </Sidebar>
  );
};
