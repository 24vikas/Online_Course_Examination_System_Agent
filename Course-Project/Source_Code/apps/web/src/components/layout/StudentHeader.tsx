import React from 'react';
import {
  Menu,
  CheckCircle2,
  AlertCircle,
  Bot,
  ChevronDown,
} from 'lucide-react';
import type { UserProfile } from '../../types/exam.ts';
import type { ActiveTab } from './Sidebar.tsx';
import { BrandLogo } from '../ui/BrandLogo';
import { useSidebar } from '../ui/sidebar';

interface StudentHeaderProps {
  currentTab: ActiveTab;
  onSelectTab: (tab: ActiveTab) => void;
  currentUser: UserProfile;
  onOpenAIChat: (role: 'student_advisor') => void;
  onOpenAuthModal?: () => void;
  grievancesCount?: number;
  onToggleSidebar?: () => void;
}

export const StudentHeader: React.FC<StudentHeaderProps> = ({
  currentTab,
  onSelectTab,
  currentUser,
  onOpenAIChat,
  onOpenAuthModal,
  grievancesCount = 0,
  onToggleSidebar,
}) => {
  const { toggleSidebar } = useSidebar();
  const isAttendanceEligible = currentUser.attendanceRate >= 75;
  const isFeeEligible = currentUser.feeCleared;

  const handleToggle = () => {
    toggleSidebar();
    if (onToggleSidebar) onToggleSidebar();
  };

  return (
    <header className="bg-white h-[52px] border-b border-[#E6E4E4] px-4 shrink-0 font-serif select-none flex items-center justify-between gap-4 z-20">
      <div className="max-w-7xl w-full mx-auto flex items-center justify-between gap-4">
        {/* Brand & Wordmark: Zone 1 */}
        <div className="flex items-center gap-3">
          <button
            id="student-header-toggle-sidebar-btn"
            onClick={handleToggle}
            aria-label="Toggle navigation menu"
            className="p-1.5 -ml-1 rounded-md text-[#686868] hover:text-[#161616] hover:bg-[#F8F8F7] transition-colors cursor-pointer"
          >
            <Menu className="w-5 h-5" />
          </button>
          <BrandLogo size="xs" height={24} />
          <div className="hidden sm:block border-l border-[#E6E4E4] pl-2.5">
            <div className="text-xs font-bold text-[#161616] tracking-tight leading-none font-serif">
              Candidate Examination Portal
            </div>
            <div className="text-[10px] text-[#686868] font-mono tabular-nums mt-0.5 truncate max-w-[200px]">
              {currentUser.email || 'DEMO094@example.invalid'}
            </div>
          </div>
        </div>

        {/* Simplified Student Navigation Links: Zone 2 */}
        <nav className="hidden md:flex items-center gap-1" aria-label="Student primary navigation">
          <button
            onClick={() => onSelectTab('student_exams')}
            className={`px-2.5 py-1.5 rounded-md text-xs font-bold transition-colors cursor-pointer flex items-center font-serif ${
              currentTab === 'student_exams'
                ? 'bg-[#981B2B]/10 text-[#981B2B]'
                : 'text-[#686868] hover:text-[#161616] hover:bg-[#F8F8F7]'
            }`}
          >
            Courses &amp; Eligibility
          </button>

          <button
            onClick={() => onSelectTab('student_testing_hall')}
            className={`px-2.5 py-1.5 rounded-md text-xs font-bold transition-colors cursor-pointer flex items-center font-serif ${
              currentTab === 'student_testing_hall' || currentTab === 'student_practice'
                ? 'bg-[#981B2B]/10 text-[#981B2B]'
                : 'text-[#686868] hover:text-[#161616] hover:bg-[#F8F8F7]'
            }`}
          >
            Testing Hall &amp; Practice
          </button>

          <button
            onClick={() => onSelectTab('student_scorecard')}
            className={`px-2.5 py-1.5 rounded-md text-xs font-bold transition-colors cursor-pointer flex items-center font-serif ${
              currentTab === 'student_scorecard'
                ? 'bg-[#981B2B]/10 text-[#981B2B]'
                : 'text-[#686868] hover:text-[#161616] hover:bg-[#F8F8F7]'
            }`}
          >
            Scorecards &amp; Transcripts
          </button>

          <button
            onClick={() => onSelectTab('student_grievances')}
            className={`px-2.5 py-1.5 rounded-md text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 font-serif ${
              currentTab === 'student_grievances'
                ? 'bg-[#981B2B]/10 text-[#981B2B]'
                : 'text-[#686868] hover:text-[#161616] hover:bg-[#F8F8F7]'
            }`}
          >
            <span>Grievances</span>
            {grievancesCount > 0 && (
              <span className="w-2 h-2 rounded-full bg-amber-500" />
            )}
          </button>
        </nav>

        {/* Clearances & Actions: Zone 3 */}
        <div className="flex items-center gap-2.5 shrink-0">
          {/* Institutional Clearances */}
          <div className="hidden lg:flex items-center gap-2 px-2.5 py-1 rounded-md bg-[#F8F8F7] border border-[#E6E4E4] text-xs font-serif">
            <div className="flex items-center gap-1">
              <span className="text-[#686868]">Attendance:</span>
              <span
                className={`font-mono font-bold ${
                  isAttendanceEligible ? 'text-emerald-700' : 'text-[#981B2B]'
                }`}
              >
                {currentUser.attendanceRate}%
              </span>
              {isAttendanceEligible ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-[#15803D]" />
              ) : (
                <AlertCircle className="w-3.5 h-3.5 text-[#B91C1C]" />
              )}
            </div>
            <div className="w-px h-3.5 bg-[#E3EAE6]" />
            <div className="flex items-center gap-1.5">
              <span className="text-[#5B6B66]">Fees:</span>
              <span
                className={`font-semibold ${
                  isFeeEligible ? 'text-[#15803D]' : 'text-[#B45309]'
                }`}
              >
                {isFeeEligible ? 'Cleared' : 'Pending'}
              </span>
            </div>
          </div>

          {/* Ask Advisor AI */}
          <button
            onClick={() => onOpenAIChat('student_advisor')}
            className="flex items-center gap-1.5 px-3 py-2 min-h-[44px] rounded-[10px] border border-[#1F4D3F] text-[#1F4D3F] hover:bg-[#F6F9F6] text-xs font-medium transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1F4D3F]"
          >
            <Bot className="w-3.5 h-3.5 text-[#1F4D3F]" />
            <span className="hidden sm:inline">Ask Advisor AI</span>
          </button>

          {/* User Profile */}
          <button
            onClick={onOpenAuthModal}
            className="flex items-center gap-2 min-h-[44px] pl-2 pr-1 border-l border-[#E3EAE6] hover:bg-[#F6F9F6] rounded-[10px] transition-colors cursor-pointer text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1F4D3F]"
          >
            <div className="w-7 h-7 rounded-full bg-[#D6EBDD] text-[#1F4D3F] flex items-center justify-center text-xs font-semibold">
              {currentUser.displayName.charAt(0)}
            </div>
            <div className="hidden sm:block text-left">
              <p className="text-xs font-semibold text-[#10251F] leading-tight">
                {currentUser.displayName}
              </p>
              <p className="text-[10px] text-[#5B6B66]">Student</p>
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-[#5B6B66]" />
          </button>
        </div>
      </div>
    </header>
  );
};
