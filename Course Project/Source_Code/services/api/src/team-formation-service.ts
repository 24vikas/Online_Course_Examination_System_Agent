/**
 * Student Team Formation & Worklet Allocation Service
 * KLE Technological University — Course 26ECAC401 (Agentic AI)
 * Team 5: Team AURA
 */

import type { DatabaseClient } from "./ai-provider-service.ts";

export interface TeamFormationConstraints {
  courseOfferingId: string;
  semester: number;
  minTeamSize: number;
  maxTeamSize: number;
  targetTeamSize: number;
  strategy: "BALANCED_SECTION" | "RANDOM_REPRODUCIBLE" | "SEQUENTIAL";
  seed?: number;
  isOwnerCriteriaSupplied: boolean;
}

export interface CandidateStudent {
  id: string;
  institutionalStudentId: string;
  firstName: string;
  lastName: string;
  currentSemester: number;
}

export interface ProposedTeamMember {
  studentId: string;
  usn: string;
  name: string;
  role: "LEADER" | "MEMBER";
}

export interface ProposedTeam {
  teamName: string;
  teamNumber: number;
  members: ProposedTeamMember[];
}

export interface TeamAllocationPreview {
  status: "READY_FOR_ADMIN_REVIEW" | "BLOCKED_PENDING_OWNER_CRITERIA";
  courseOfferingId: string;
  semester: number;
  totalStudents: number;
  projectedTeamCount: number;
  constraints: TeamFormationConstraints;
  teams: ProposedTeam[];
  blockingReason?: string;
}

export class TeamFormationService {
  private db: DatabaseClient;
  constructor(db: DatabaseClient) {
    this.db = db;
  }

  /**
   * Deterministic PRNG for reproducible team allocation.
   */
  private pseudoRandom(seed: number) {
    let s = seed % 2147483647;
    if (s <= 0) s += 2147483646;
    return () => {
      s = (s * 16807) % 2147483647;
      return (s - 1) / 2147483646;
    };
  }

  /**
   * Generates a preview of team allocations based on enrolled cohort.
   * If owner has not provided specific rules or criteria, marks allocation as BLOCKED.
   */
  async previewAllocation(
    tenantId: string,
    constraints: TeamFormationConstraints
  ): Promise<TeamAllocationPreview> {
    // 1. Safety Check: If owner criteria are not explicitly supplied, fail safe
    if (!constraints.isOwnerCriteriaSupplied) {
      return {
        status: "BLOCKED_PENDING_OWNER_CRITERIA",
        courseOfferingId: constraints.courseOfferingId,
        semester: constraints.semester,
        totalStudents: 0,
        projectedTeamCount: 0,
        constraints,
        teams: [],
        blockingReason:
          "Team allocation is BLOCKED pending course coordinator / owner criteria. Do not invent team sizes or group compositions without authorized faculty rules.",
      };
    }

    // 2. Fetch enrolled students for this tenant and course offering
    const studentsRes = await this.db.query(
      `
      SELECT s.id, s.institutional_student_id, s.first_name, s.last_name
      FROM enrollments e
      JOIN students s ON s.id = e.student_id
      WHERE e.tenant_id = $1 AND e.course_offering_id = $2 AND e.enrollment_status = 'ENROLLED'
      ORDER BY s.institutional_student_id ASC
      `,
      [tenantId, constraints.courseOfferingId]
    );

    const students: CandidateStudent[] = studentsRes.rows.map((r: any) => ({
      id: r.id,
      institutionalStudentId: r.institutional_student_id,
      firstName: r.first_name,
      lastName: r.last_name || "",
      currentSemester: constraints.semester,
    }));

    if (students.length === 0) {
      return {
        status: "BLOCKED_PENDING_OWNER_CRITERIA",
        courseOfferingId: constraints.courseOfferingId,
        semester: constraints.semester,
        totalStudents: 0,
        projectedTeamCount: 0,
        constraints,
        teams: [],
        blockingReason: `No enrolled students found in database for Semester ${constraints.semester}. Please import CSV rosters first.`,
      };
    }

    // 3. Partition into teams
    const targetSize = Math.max(2, constraints.targetTeamSize || 4);
    const numTeams = Math.ceil(students.length / targetSize);

    // Shuffle if random reproducible
    const studentList = [...students];
    if (constraints.strategy === "RANDOM_REPRODUCIBLE") {
      const rng = this.pseudoRandom(constraints.seed || 42);
      for (let i = studentList.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [studentList[i], studentList[j]] = [studentList[j], studentList[i]];
      }
    }

    const teams: ProposedTeam[] = [];
    for (let t = 0; t < numTeams; t++) {
      teams.push({
        teamName: `Team ${t + 1} (AURA-SEM${constraints.semester})`,
        teamNumber: t + 1,
        members: [],
      });
    }

    // Round-robin distribution
    studentList.forEach((stud, idx) => {
      const teamIdx = idx % numTeams;
      const role = teams[teamIdx].members.length === 0 ? "LEADER" : "MEMBER";
      teams[teamIdx].members.push({
        studentId: stud.id,
        usn: stud.institutionalStudentId,
        name: `${stud.firstName} ${stud.lastName}`.trim(),
        role,
      });
    });

    return {
      status: "READY_FOR_ADMIN_REVIEW",
      courseOfferingId: constraints.courseOfferingId,
      semester: constraints.semester,
      totalStudents: students.length,
      projectedTeamCount: teams.length,
      constraints,
      teams,
    };
  }

  /**
   * Commits admin-approved team allocations to the database.
   */
  async commitApprovedTeams(
    tenantId: string,
    adminUserId: string,
    courseOfferingId: string,
    teams: ProposedTeam[]
  ): Promise<{ committedTeamsCount: number; committedMembersCount: number }> {
    let membersCount = 0;

    for (const team of teams) {
      // Upsert team
      const teamRes = await this.db.query(
        `
        INSERT INTO student_teams (
          tenant_id, course_offering_id, team_name, team_number, status, allocation_metadata
        ) VALUES (
          $1, $2, $3, $4, 'APPROVED', $5
        )
        ON CONFLICT (tenant_id, course_offering_id, team_name)
        DO UPDATE SET
          status = 'APPROVED',
          updated_at = CURRENT_TIMESTAMP
        RETURNING id
        `,
        [tenantId, courseOfferingId, team.teamName, team.teamNumber, JSON.stringify({ approvedBy: adminUserId })]
      );

      const teamId = teamRes.rows[0].id;

      // Insert members
      for (const m of team.members) {
        await this.db.query(
          `
          INSERT INTO team_memberships (tenant_id, team_id, student_id, role)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (team_id, student_id)
          DO UPDATE SET role = EXCLUDED.role
          `,
          [tenantId, teamId, m.studentId, m.role]
        );
        membersCount++;
      }
    }

    return {
      committedTeamsCount: teams.length,
      committedMembersCount: membersCount,
    };
  }

  /**
   * Retrieves team info for a student.
   */
  async getStudentTeam(tenantId: string, studentId: string, courseOfferingId: string) {
    const res = await this.db.query(
      `
      SELECT t.id as team_id, t.team_name, t.team_number, t.status, tm.role,
             s.institutional_student_id, s.first_name, s.last_name
      FROM team_memberships tm
      JOIN student_teams t ON t.id = tm.team_id
      JOIN students s ON s.id = tm.student_id
      WHERE t.tenant_id = $1 AND t.course_offering_id = $2
        AND t.id IN (
          SELECT team_id FROM team_memberships WHERE student_id = $3
        )
      ORDER BY tm.role DESC, s.institutional_student_id ASC
      `,
      [tenantId, courseOfferingId, studentId]
    );

    if (res.rows.length === 0) return null;

    const first = res.rows[0];
    return {
      teamId: first.team_id,
      teamName: first.team_name,
      teamNumber: first.team_number,
      status: first.status,
      workspaceUrl: `/worklet?team=${encodeURIComponent(first.team_name)}`,
      members: res.rows.map((r: any) => ({
        studentId: r.student_id,
        usn: r.institutional_student_id,
        name: `${r.first_name} ${r.last_name || ""}`.trim(),
        role: r.role,
      })),
    };
  }
}
