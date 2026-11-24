"use client";

import React from "react";
import type { UserProfile } from "../../types/exam";
import { RoleNavigationSidebar } from "./RoleNavigationSidebar";

export type ActiveTab =
  | "coe_dashboard"
  | "faculty_dashboard"
  | "faculty_planner"
  | "faculty_syllabus_rag"
  | "faculty_node_graph"
  | "faculty_reviews"
  | "faculty_grievances"
  | "faculty_questions"
  | "faculty_exams"
  | "student_study_hub"
  | "student_exams"
  | "student_testing_hall"
  | "student_scorecard"
  | "student_practice"
  | "student_grievances"
  | "verification_protocol"
  | "design_system";

interface SidebarProps {
  currentTab: ActiveTab;
  onSelectTab: (tab: ActiveTab) => void;
  currentUser: UserProfile;
  pendingReviewsCount: number;
  integrityFlagsCount: number;
  grievancesCount: number;
  isOpen?: boolean;
  onClose?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = (props) => {
  return (
    <RoleNavigationSidebar
      currentUser={props.currentUser}
      pendingReviewsCount={props.pendingReviewsCount}
      integrityFlagsCount={props.integrityFlagsCount}
      grievancesCount={props.grievancesCount}
      isOpen={props.isOpen}
      onClose={props.onClose}
    />
  );
};
