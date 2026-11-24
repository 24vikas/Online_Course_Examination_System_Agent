import React, { useState, useRef, useEffect } from 'react';
import {
  Menu,
  Search,
  Plus,
  Bell,
  Cpu,
  User,
  ChevronDown,
  X,
  ChevronRight,
  Shield,
  Palette,
} from 'lucide-react';
import type { UserProfile } from '../../types/exam.ts';
import type { ActiveTab } from './Sidebar.tsx';
import { INITIAL_USERS } from '../../firebase/seedData.ts';
import { BrandLogo } from '../ui/BrandLogo';
import { useSidebar } from '../ui/sidebar';

interface HeaderProps {
  currentTab: ActiveTab;
  currentUser: UserProfile;
  onNewExam?: () => void;
  searchQuery?: string;
  onSearchChange?: (q: string) => void;
  onOpenSidePanel: () => void;
  onOpenAuthModal?: () => void;
  onSwitchUser?: (user: UserProfile) => void;
  notificationCount?: number;
  onToggleSidebar?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentTab,
  currentUser,
  onNewExam,
  searchQuery = '',
  onSearchChange,
  onOpenSidePanel,
  onOpenAuthModal,
  onSwitchUser,
  notificationCount = 0,
  onToggleSidebar,
}) => {
  const { toggleSidebar } = useSidebar();
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showDemoTools, setShowDemoTools] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const handleToggle = () => {
    toggleSidebar();
    if (onToggleSidebar) onToggleSidebar();
  };

  const isDebugMode =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('debug_demo_switcher') === 'true';

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowProfileMenu(false);
        setShowNotifications(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getSingleLineTitle = () => {
    switch (currentTab) {
      case 'coe_dashboard':
        return 'Controller of Examinations Control Room';
      case 'faculty_dashboard':
        return 'Faculty Examination Dashboard';
      case 'faculty_planner':
        return 'Exam Blueprint & Delivery Specification';
      case 'faculty_syllabus_rag':
      case 'faculty_questions':
        return 'Syllabus RAG & Question Studio';
      case 'faculty_node_graph':
        return 'Agentic DAG Execution Pipeline';
      case 'faculty_reviews':
        return 'Integrity Audits & Subjective Evaluation Gate';
      case 'faculty_grievances':
        return 'Grievance Adjudication & Revaluation Board';
      case 'verification_protocol':
        return 'Pre-Deployment Verification Suite';
      case 'design_system':
        return 'Design System & Shared Components';
      default:
        return 'Online Examination Management';
    }
  };

  return (
    <header
      id="institutional-header"
      className="bg-white h-[52px] border-b border-[#E6E4E4] px-4 flex items-center justify-between gap-4 shrink-0 select-none font-serif z-20"
    >
      {/* 1. Page Title on ONE Line (with Brand Logo & Mobile Toggle) */}
      <div className="flex items-center gap-2.5 min-w-0">
        <button
          id="header-toggle-sidebar-btn"
          onClick={handleToggle}
          aria-label="Toggle navigation menu"
          className="p-1.5 -ml-1 rounded-md text-[#686868] hover:text-[#161616] hover:bg-[#F8F8F7] transition-colors cursor-pointer"
        >
          <Menu className="w-5 h-5" />
        </button>
        <BrandLogo size="xs" height={22} className="hidden sm:inline-flex mr-1 shrink-0" />
        <h1 className="text-sm font-bold text-[#161616] whitespace-nowrap font-serif">
          {getSingleLineTitle()}
        </h1>
        <span className="hidden md:inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-[#F8F8F7] text-[#981B2B] border border-[#E6E4E4] whitespace-nowrap font-serif">
          {currentUser.role === 'author' ? 'COE Author' : 'Faculty'}
        </span>
      </div>

      {/* 2. Actions: Search, ONE Primary "New Exam" Button (Institutional Crimson), Bell, Profile Menu */}
      <div className="flex items-center gap-2.5 shrink-0" ref={menuRef}>
        {/* Search */}
        <div className="relative hidden md:block w-48 lg:w-56">
          <Search className="w-3.5 h-3.5 text-[#686868] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange?.(e.target.value)}
            placeholder="Search exams, courses..."
            aria-label="Search exams, courses"
            className="w-full bg-[#F8F8F7] focus:bg-white text-xs pl-8 pr-7 py-1.5 rounded-md border border-[#E6E4E4] focus:border-[#981B2B] focus:ring-1 focus:ring-[#981B2B] text-[#161616] placeholder:text-[#8E8E8E] focus:outline-none font-serif min-h-[34px]"
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange?.('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#686868] hover:text-[#161616]"
              aria-label="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* ONE Primary Button: "New Exam" (Crimson with white text) */}
        {onNewExam && (
          <button
            id="header-btn-new-exam"
            onClick={onNewExam}
            className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md bg-[#8B1D24] hover:bg-[#73171D] text-white text-xs font-bold transition-colors cursor-pointer whitespace-nowrap font-serif min-h-[34px]"
          >
            <Plus className="w-3.5 h-3.5 text-white" />
            <span>New Exam</span>
          </button>
        )}

        {/* Bell Notifications */}
        <div className="relative">
          <button
            id="header-notifications-btn"
            onClick={() => {
              setShowNotifications(!showNotifications);
              setShowProfileMenu(false);
            }}
            aria-label="View notifications"
            className="relative p-1.5 min-h-[34px] min-w-[34px] flex items-center justify-center rounded-md text-[#161616] hover:bg-[#F8F8F7] border border-transparent hover:border-[#E6E4E4] transition-colors cursor-pointer"
          >
            <Bell className="w-4 h-4 text-[#161616]" />
            {notificationCount > 0 && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[#981B2B] ring-2 ring-white" />
            )}
          </button>

          {showNotifications && (
            <div className="absolute right-0 mt-2 w-72 bg-white rounded-lg shadow-lg border border-[#E6E4E4] py-2 z-50 animate-in fade-in duration-100 font-serif">
              <div className="px-4 py-2 border-b border-[#E6E4E4] flex items-center justify-between">
                <span className="text-xs font-bold text-[#161616]">Notifications</span>
                <span className="text-[11px] text-[#686868] font-mono tabular-nums">
                  {notificationCount} action items
                </span>
              </div>
              <div className="px-4 py-3 text-xs text-[#686868]">
                {notificationCount > 0 ? (
                  <p>Faculty review gate: submissions and proctor variances await evaluation.</p>
                ) : (
                  <p>All evaluation queues are currently clear.</p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Profile Menu with Overflow Tools */}
        <div className="relative">
          <button
            id="header-profile-menu-btn"
            onClick={() => {
              setShowProfileMenu(!showProfileMenu);
              setShowNotifications(false);
            }}
            aria-expanded={showProfileMenu}
            aria-haspopup="true"
            className="flex items-center gap-2 min-h-[44px] pl-2 pr-1 border-l border-[#E3EAE6] hover:bg-[#F6F9F6] rounded-[10px] transition-colors cursor-pointer text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1F4D3F]"
          >
            <div className="w-7 h-7 rounded-full bg-[#D6EBDD] text-[#1F4D3F] flex items-center justify-center text-xs font-semibold">
              {currentUser.displayName.charAt(0)}
            </div>
            <div className="hidden lg:block text-left">
              <p className="text-xs font-semibold text-[#10251F] leading-tight">
                {currentUser.displayName}
              </p>
              <div className="flex items-center gap-1 mt-0.5">
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-[#F6F9F6] text-[#5B6B66] border border-[#E3EAE6] font-medium whitespace-nowrap">
                  {currentUser.role}
                </span>
              </div>
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-[#5B6B66]" />
          </button>

          {showProfileMenu && (
            <div className="absolute right-0 mt-2 w-72 bg-white rounded-[16px] shadow-xl border border-[#E3EAE6] py-2 z-50 animate-in fade-in duration-100 divide-y divide-[#E3EAE6]">
              {/* Profile summary */}
              <div className="px-4 py-3">
                <p className="text-xs font-semibold text-[#10251F]">{currentUser.displayName}</p>
                <p className="text-[11px] text-[#5B6B66] truncate font-mono">{currentUser.email}</p>
                <span className="inline-block mt-1 text-[10px] px-2 py-0.5 rounded-full bg-[#F6F9F6] text-[#5B6B66] border border-[#E3EAE6] font-medium">
                  {currentUser.roleTitle || currentUser.department || 'Academic Board'}
                </span>
              </div>

              {/* Operations & AI (moved inside menu as requested) */}
              <div className="py-1">
                <button
                  onClick={() => {
                    setShowProfileMenu(false);
                    onOpenSidePanel();
                  }}
                  className="w-full px-4 py-2.5 text-xs text-left text-[#10251F] hover:bg-[#F6F9F6] flex items-center justify-between cursor-pointer"
                >
                  <div className="flex items-center gap-2.5">
                    <Cpu className="w-4 h-4 text-[#1F4D3F]" />
                    <span className="font-medium">Operations & AI Assistant</span>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 text-[#5B6B66]" />
                </button>
              </div>

              {/* Demo Tools Accordion (strictly hidden in normal views, requiring explicit debug param) */}
              {isDebugMode && onSwitchUser && (
                <div className="py-1">
                  <button
                    onClick={() => setShowDemoTools(!showDemoTools)}
                    className="w-full px-4 py-2 text-xs text-left text-[#10251F] hover:bg-[#F6F9F6] flex items-center justify-between cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <Shield className="w-3.5 h-3.5 text-[#B45309]" />
                      <span className="font-medium">Demo tools</span>
                    </div>
                    <ChevronDown
                      className={`w-3.5 h-3.5 text-[#5B6B66] transition-transform ${
                        showDemoTools ? 'rotate-180' : ''
                      }`}
                    />
                  </button>

                  {showDemoTools && (
                    <div className="px-4 py-2 bg-[#F6F9F6] space-y-1.5 border-t border-[#E3EAE6]">
                      <label className="text-[11px] font-medium text-[#5B6B66] block">
                        Switch demo profile:
                      </label>
                      <select
                        aria-label="Switch demo profile"
                        className="w-full text-xs bg-white border border-[#E3EAE6] rounded-[8px] p-1.5 text-[#10251F] focus:outline-none focus:border-[#1F4D3F]"
                        value={currentUser.id}
                        onChange={(e) => {
                          const user = INITIAL_USERS.find((u) => u.id === e.target.value);
                          if (user) {
                            onSwitchUser(user);
                            setShowProfileMenu(false);
                          }
                        }}
                      >
                        {INITIAL_USERS.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.displayName} ({u.role})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              )}

              {/* Account / Auth trigger */}
              <div className="py-1">
                {onOpenAuthModal && (
                  <button
                    onClick={() => {
                      setShowProfileMenu(false);
                      onOpenAuthModal();
                    }}
                    className="w-full px-4 py-2 text-xs text-left text-[#5B6B66] hover:text-[#10251F] hover:bg-[#F6F9F6] flex items-center gap-2 cursor-pointer"
                  >
                    <User className="w-3.5 h-3.5" />
                    <span>Manage account</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
