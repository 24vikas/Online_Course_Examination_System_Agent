export type UserRole = 'faculty' | 'author' | 'student' | 'coe';

export interface UserProfile {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  roleTitle?: string;
  studentId?: string;
  department: string;
  attendanceRate: number; // e.g. 85 for 85%
  feeCleared: boolean;
  avatarUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export type ExamDeliveryFormat = 'objective' | 'subjective' | 'mixed';
export type ExamStatus = 'draft' | 'published' | 'ongoing' | 'grading' | 'published_results';

export interface ProctoringRules {
  requireWebcam: boolean;
  maxTabSwitches: number;
  blockCopyPaste: boolean;
  fullscreenRequired: boolean;
  ambientAudioCheck: boolean;
}

export interface GroundingSource {
  title: string;
  url: string;
  snippet?: string;
}

export interface RagDocument {
  id: string;
  courseCode: string;
  title: string;
  content: string;
  chunkCount: number;
  uploadedAt: string;
  chunks: string[];
}

export interface Exam {
  id: string;
  title: string;
  courseCode: string;
  facultyId: string;
  facultyName: string;
  description: string;
  durationMinutes: number;
  totalMarks: number;
  passingScore: number;
  type: ExamDeliveryFormat;
  isMockOrPractice: boolean;
  registrationStart: string;
  registrationEnd: string;
  examStart: string;
  examEnd: string;
  status: ExamStatus;
  proctoringRules: ProctoringRules;
  scheduledDate?: string;
  syllabusTopic?: string;
  questionsCount?: number;
  coeApproved?: boolean;
  coeApprovedBy?: string;
  coeApprovedAt?: string;
  deepSearchGrounded?: boolean;
  groundingSources?: GroundingSource[];
  ragChunksCount?: number;
  createdAt: string;
  updatedAt: string;
}

export type QuestionType = 'mcq' | 'subjective' | 'coding' | 'multiple_choice';

export interface Question {
  id: string;
  examId: string;
  type: QuestionType;
  prompt: string;
  text?: string;
  options?: string[]; // for MCQ
  correctAnswer?: string; // for objective auto-grading
  rubric?: string; // for subjective grading
  suggestedMarks: number;
  maxMarks: number;
  orderIndex: number;
  difficulty?: string;
  explanation?: string;
  marks?: number;
  bloomLevel?: string;
  bloomsLevel?: string;
  unitNumber?: number;
  publicProblem?: {
    title?: string;
    statement?: string;
    inputDescription?: string;
    outputDescription?: string;
    constraints?: string;
    languages?: string[];
    timeLimitMs?: number;
    memoryLimitKiB?: number;
    examples?: { input: string; output: string }[];
    scoring?: string;
  } | null;
}

export type RegistrationStatus = 'registered' | 'started' | 'submitted' | 'graded';

export interface Registration {
  id: string;
  examId: string;
  studentId: string;
  studentName: string;
  studentEmail: string;
  registeredAt: string;
  eligibilityVerified: boolean;
  attendanceRate: number;
  feeCleared: boolean;
  status: RegistrationStatus;
}

export interface SubjectiveGradeProposal {
  questionId: string;
  studentAnswer: string;
  suggestedScore: number;
  facultyApprovedScore?: number;
  maxMarks: number;
  reasoning: string;
  rubricBreakdown: Array<{
    criterion: string;
    awarded: number;
    max: number;
    comment: string;
  }>;
  strengths: string[];
  weaknesses: string[];
  facultyNote: string;
  facultyFeedback?: string;
  status: 'pending_approval' | 'approved' | 'modified';
}

export interface ExamSubmission {
  id: string;
  examId: string;
  examTitle: string;
  studentId: string;
  studentName: string;
  studentEmail: string;
  startedAt: string;
  submittedAt: string;
  timestamp?: string;
  status: 'in_progress' | 'submitted' | 'graded' | 'published';
  answers: Record<string, string>; // questionId -> answer
  objectiveScore: number;
  subjectiveScore: number;
  totalScore: number;
  maxScore: number;
  isPassed: boolean;
  subjectiveEvaluations: Record<string, SubjectiveGradeProposal>;
  facultyApproved: boolean;
  facultyFeedback?: string;
  integrityScore: number; // 0 - 100
  integrityFlagCount: number;
  proctoringRecordingUrl?: string;
  proctoringVideoDurationSeconds?: number;
  candidatePhotoUrl?: string;
  verificationToken?: string;
  incidentClips?: Array<{
    timestamp: string;
    flagType: string;
    videoTimestampOffset?: number;
    note?: string;
  }>;
  createdAt: string;
  updatedAt: string;
}

export type IntegrityFlagType =
  | 'tab_switch'
  | 'fullscreen_exit'
  | 'copy_paste_attempt'
  | 'face_not_detected'
  | 'multiple_faces'
  | 'suspicious_audio'
  | 'gaze_deviation';

export type FlagSeverity = 'low' | 'medium' | 'high';
export type FacultyDecision = 'pending' | 'cleared' | 'warning' | 'penalty_recommended' | 'no_action' | 'verified_cleared';

export interface IntegrityLog {
  id: string;
  submissionId: string;
  examId: string;
  examTitle?: string;
  studentId: string;
  studentUid?: string;
  studentName: string;
  timestamp: string;
  flagType: IntegrityFlagType;
  severity: FlagSeverity;
  details: string;
  autoPenaltyApplied?: boolean;
  facultyReviewed: boolean;
  facultyDecision: FacultyDecision;
  facultyNotes?: string;
  videoTimestampSeconds?: number;
  videoClipUrl?: string;
  candidatePhotoUrl?: string;
  createdAt: string;
}


export type GrievanceStatus = 'pending' | 'under_review' | 'resolved' | 'rejected';

export interface Grievance {
  id: string;
  examId: string;
  examTitle: string;
  submissionId: string;
  studentId: string;
  studentUid?: string;
  studentName: string;
  studentEmail: string;
  questionId: string;
  subject: string;
  reason: string;
  description?: string;
  syllabusReference?: string;
  currentMarks: number;
  requestedMarks: number;
  status: GrievanceStatus;
  facultyDecision?: 'PENDING' | 'UPHELD' | 'REVISED' | 'REFERRED_TO_2ND_EVALUATOR';
  facultyResponse?: string;
  newAwardedMarks?: number;
  requestedSecondEvaluator?: boolean;
  secondEvaluatorAssigned?: string;
  createdAt: string;
  updatedAt: string;
}

// ==========================================
// AGENTIC ARCHITECTURE TYPES (Labs 1–8)
// ==========================================

export type BloomsLevel =
  | 'Remembering'
  | 'Understanding'
  | 'Applying'
  | 'Analyzing'
  | 'Evaluating'
  | 'Creating';

export interface QuestionBankItem extends Question {
  bloomsLevel?: BloomsLevel;
  vectorEmbedding?: number[];
  topicTag?: string;
  verifiedByFaculty?: boolean;
}

export interface ExamPlannerPlan {
  id: string;
  courseCode: string;
  title: string;
  durationMinutes: number;
  examType: ExamDeliveryFormat;
  registrationWindow: { start: string; end: string };
  examWindow: { start: string; end: string };
  proctoringLevel: 'strict' | 'standard' | 'minimal';
  proctoringRules: ProctoringRules;
  scheduledDate?: string;
  questionDistribution: {
    mcqCount: number;
    subjectiveCount: number;
    totalMarks: number;
  };
  clarificationsNeeded: string[];
  status: 'needs_clarification' | 'proposed' | 'locked';
  version: number;
  lockedAt?: string;
  lockedBy?: string;
}

export interface AgentAuditLog {
  id: string;
  timestamp: string;
  agentName: string;
  stepName: string;
  action: string;
  tokensUsed: number;
  status: 'success' | 'paused' | 'retry' | 'failed';
  payloadSummary: string;
  checkpointId?: string;
}

export interface RuntimeCheckpoint {
  id: string;
  timestamp: string;
  stage: string;
  stepIndex: number;
  totalSteps: number;
  snapshotData: Record<string, any>;
  auditLogsCount: number;
}

export interface NodeGraphNode {
  id: string;
  name: string;
  role: string;
  status: 'idle' | 'running' | 'completed' | 'failed' | 'retry_backedge' | 'paused_human_gate';
  retries: number;
  maxRetries?: number;
  durationMs?: number;
  lastOutput?: string;
}

export interface GateCheckResult {
  labNumber: number;
  labTitle: string;
  commandOrTrigger: string;
  status: 'pending' | 'running' | 'passed' | 'failed';
  evidence: string;
  timestamp?: string;
  durationMs: number;
  details?: Record<string, any>;
}

export interface SwarmWorkerResult {
  studentId: string;
  studentName: string;
  workerThreadId: string;
  attendance: number;
  feeCleared: boolean;
  status: 'completed' | 'flagged';
  mcqScore: number;
  subjectiveScore: number;
  totalScore: number;
  maxScore: number;
  proctoringFlags: number;
  durationMs: number;
}

export interface Flashcard {
  id: string;
  courseCode: string;
  topic: string;
  subtopic?: string;
  conceptTitle: string;
  questionOrScenario: string;
  answerExplanation: string;
  bloomsTaxonomy: 'Remembering' | 'Understanding' | 'Applying' | 'Analyzing' | 'Evaluating';
  keyRuleOrFormula?: string;
  architecturalTradeoffs?: string;
  commonPitfalls?: string;
  deepSearchCitation?: string;
  status?: 'unread' | 'review' | 'mastered';
}

export interface StudyNote {
  id: string;
  courseCode: string;
  topic: string;
  title: string;
  summary: string;
  coreConcepts: Array<{
    term: string;
    definition: string;
    academicContext: string;
  }>;
  architecturalTradeoffs: Array<{
    scenario: string;
    pros: string;
    cons: string;
    industryBenchmark: string;
  }>;
  commonPitfalls: string[];
  groundingSources: GroundingSource[];
  generatedAt: string;
}


