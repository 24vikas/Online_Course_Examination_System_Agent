import React, { useState, useEffect } from 'react';
import {
  LifeBuoy,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
  User,
  BookOpen,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  FileText,
  Save,
  MessageSquare,
  Lock,
  UserCheck,
  Scale,
  Award,
} from 'lucide-react';
import type { Grievance, ExamSubmission, Exam, UserProfile } from '../../types/exam.ts';
import { saveGrievance, saveSubmission } from '../../firebase/services.ts';
import { showToast } from '../../utils/toast.ts';
import { apiFetch } from '../../utils/apiClient.ts';

interface FacultyGrievanceQueueProps {
  grievances: Grievance[];
  submissions: ExamSubmission[];
  exams: Exam[];
  currentUser?: UserProfile;
  initialGrievanceId?: string | null;
  onGrievancesUpdated: (updatedList: Grievance[]) => void;
  onSubmissionsUpdated: (updatedSubs: ExamSubmission[]) => void;
}

export const FacultyGrievanceQueue: React.FC<FacultyGrievanceQueueProps> = ({
  grievances,
  submissions,
  exams,
  currentUser,
  initialGrievanceId,
  onGrievancesUpdated,
  onSubmissionsUpdated,
}) => {
  const [selectedGrievanceId, setSelectedGrievanceId] = useState<string | null>(
    initialGrievanceId || grievances[0]?.id || null
  );
  const [filter, setFilter] = useState<'all' | 'pending' | 'under_review' | 'resolved' | 'rejected'>('all');
  const [facultyResponse, setFacultyResponse] = useState<string>('');
  const [revisedMarks, setRevisedMarks] = useState<number>(0);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [aiMediating, setAiMediating] = useState<boolean>(false);
  const [aiAnalysis, setAiAnalysis] = useState<{
    summary?: string;
    recommendation?: string;
    suggestedMarks?: number;
  } | null>(null);

  // Sync selected grievance if prop changes
  useEffect(() => {
    if (initialGrievanceId && grievances.some((g) => g.id === initialGrievanceId)) {
      setSelectedGrievanceId(initialGrievanceId);
    }
  }, [initialGrievanceId]);

  const filteredGrievances = grievances.filter((g) => {
    if (filter === 'all') return true;
    return g.status === filter;
  });

  const selectedGrievance = grievances.find((g) => g.id === selectedGrievanceId) || filteredGrievances[0];
  const relatedSubmission = selectedGrievance
    ? submissions.find((s) => s.id === selectedGrievance.submissionId)
    : null;
  const relatedExam = selectedGrievance
    ? exams.find((e) => e.id === selectedGrievance.examId)
    : null;

  // Question details and rubric evaluation
  const subjectiveEvaluation = selectedGrievance && relatedSubmission
    ? relatedSubmission.subjectiveEvaluations?.[selectedGrievance.questionId]
    : null;

  const maxMarks = subjectiveEvaluation?.maxMarks || 15;

  // Initialize revised marks and response when selected grievance changes
  useEffect(() => {
    if (selectedGrievance) {
      const initialScore =
        selectedGrievance.newAwardedMarks !== undefined
          ? selectedGrievance.newAwardedMarks
          : selectedGrievance.requestedMarks || selectedGrievance.currentMarks;
      setRevisedMarks(Math.min(initialScore, maxMarks));
      setFacultyResponse(selectedGrievance.facultyResponse || '');
      setAiAnalysis(null);
    }
  }, [selectedGrievance?.id, maxMarks]);

  // AI Mediation Helper
  const handleAiMediation = async () => {
    if (!selectedGrievance) return;
    setAiMediating(true);
    try {
      const res = await apiFetch('/api/gemini/academic-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roleType: 'grievance_mediator',
          messages: [
            {
              role: 'user',
              content: `Please analyze this student examination grievance ticket:
Course: ${selectedGrievance.examTitle}
Student: ${selectedGrievance.studentName}
Question ID: ${selectedGrievance.questionId}
Current Awarded Marks: ${selectedGrievance.currentMarks}
Student Requested Marks: ${selectedGrievance.requestedMarks}
Student Grounds for Appeal: "${selectedGrievance.reason}"
Syllabus Benchmark: "${selectedGrievance.syllabusReference || 'Distributed Systems & SMR'}"

Please evaluate:
1. Is the student appeal grounded in technical merit or rubric criteria?
2. What is your neutral pedagogical recommendation for the faculty member?
3. What is an equitable marks adjustment if any? Note: Faculty makes final determination.`,
            },
          ],
        }),
      });
      const data = await res.json();
      if (data.data?.text) {
        setAiAnalysis({
          summary: data.data.text,
          recommendation: 'Pedagogical Review Complete. Faculty determination required.',
        });
        setFacultyResponse(
          `Revaluation reviewed: ${data.data.text.slice(0, 220)}... Marks calibrated per rubric benchmarks.`
        );
      }
    } catch (e) {
      console.error('AI Mediation error:', e);
    } finally {
      setAiMediating(false);
    }
  };

  // Human Faculty Determination (strictly enforced guardrail!)
  const handleResolveGrievance = async (decision: 'resolved' | 'rejected' | 'request_second_evaluator') => {
    if (!selectedGrievance) return;
    setIsProcessing(true);

    try {
      const now = new Date().toISOString();
      const safeRevisedMarks = Math.min(revisedMarks, maxMarks);

      if (decision === 'request_second_evaluator') {
        const updatedGrievance: Grievance = {
          ...selectedGrievance,
          status: 'under_review',
          facultyDecision: 'REFERRED_TO_2ND_EVALUATOR',
          requestedSecondEvaluator: true,
          secondEvaluatorAssigned: 'Prof. S. R. Patil (COE Appointee)',
          facultyResponse: facultyResponse || 'Primary evaluator flagged question for COE secondary revaluation.',
          updatedAt: now,
        };

        await saveGrievance(updatedGrievance);
        onGrievancesUpdated(
          grievances.map((g) => (g.id === updatedGrievance.id ? updatedGrievance : g))
        );

        showToast({
          type: 'info',
          title: '2nd Evaluator Requested',
          message: `Petition #${selectedGrievance.id} referred to Controller of Examinations for blind secondary evaluation.`,
        });
      } else {
        const isResolved = decision === 'resolved';
        const finalStatus = isResolved ? 'resolved' : 'rejected';
        const facultyDecisionCode = isResolved ? 'REVISED' : 'UPHELD';

        const updatedGrievance: Grievance = {
          ...selectedGrievance,
          status: finalStatus,
          facultyDecision: facultyDecisionCode,
          facultyResponse:
            facultyResponse ||
            (isResolved
              ? `Marks revised to ${safeRevisedMarks}/${maxMarks} upon verification of rubric standard.`
              : 'Original evaluation upheld after syllabus and answer transcript review.'),
          newAwardedMarks: isResolved ? safeRevisedMarks : selectedGrievance.currentMarks,
          updatedAt: now,
        };

        await saveGrievance(updatedGrievance);
        onGrievancesUpdated(
          grievances.map((g) => (g.id === updatedGrievance.id ? updatedGrievance : g))
        );

        // If marks revised, update student submission scores & rubric entry
        if (isResolved && relatedSubmission) {
          const delta = safeRevisedMarks - selectedGrievance.currentMarks;
          const newSubjectiveScore = Math.max(0, (relatedSubmission.subjectiveScore || 0) + delta);
          const newTotal = Math.min(relatedSubmission.maxScore || 100, (relatedSubmission.totalScore || 0) + delta);

          const updatedEvaluations = { ...(relatedSubmission.subjectiveEvaluations || {}) };
          if (updatedEvaluations[selectedGrievance.questionId]) {
            updatedEvaluations[selectedGrievance.questionId] = {
              ...updatedEvaluations[selectedGrievance.questionId],
              facultyApprovedScore: safeRevisedMarks,
              status: 'approved',
              facultyNote: `Revised via Grievance Adjudication: +${delta} marks. ${facultyResponse || ''}`.trim(),
            };
          }

          const updatedSubmission: ExamSubmission = {
            ...relatedSubmission,
            subjectiveScore: newSubjectiveScore,
            totalScore: newTotal,
            subjectiveEvaluations: updatedEvaluations,
            facultyFeedback: `${relatedSubmission.facultyFeedback || ''} [Grievance #${selectedGrievance.id}: +${delta} marks on ${selectedGrievance.questionId}]`.trim(),
            updatedAt: now,
          };

          await saveSubmission(updatedSubmission);
          onSubmissionsUpdated(
            submissions.map((s) => (s.id === updatedSubmission.id ? updatedSubmission : s))
          );
        }

        // Log to AURA telemetry bridge
        try {
          await apiFetch('/api/agent/aura-dispatch', {
            method: 'POST',
            body: JSON.stringify({
              functionName: 'manage_grievance',
              args: {
                grievanceId: updatedGrievance.id,
                action: isResolved ? 'resolve' : 'uphold',
                decision: facultyDecisionCode,
                facultyFeedback: updatedGrievance.facultyResponse,
                revisedMarks: safeRevisedMarks,
                resolvedBy: currentUser?.displayName || 'Faculty Examiner',
              },
              telemetry: {
                activeStage: 'STAGE_7_PUBLISH_AND_GRIEVANCE',
                statusEvent: `Faculty adjudicated grievance #${updatedGrievance.id}: ${facultyDecisionCode}`,
              },
            }),
          });
        } catch (dispatchErr) {
          console.warn('Aura dispatch notice for grievance adjudication:', dispatchErr);
        }

        showToast({
          type: isResolved ? 'success' : 'neutral',
          title: isResolved ? 'Petition Resolved' : 'Petition Score Upheld',
          message: isResolved
            ? `Awarded revised ${safeRevisedMarks}/${maxMarks} marks to ${selectedGrievance.studentName}. Total score updated.`
            : `Original score upheld for ${selectedGrievance.studentName}. Feedback saved.`,
        });
      }

      setAiAnalysis(null);
    } catch (e) {
      console.error('Error resolving grievance:', e);
      showToast({
        type: 'error',
        title: 'Adjudication Error',
        message: 'Failed to save revaluation decision. Please try again.',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-6 text-white shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="px-2.5 py-0.5 rounded text-[11px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 uppercase tracking-wider">
              Faculty Workspace View 5
            </span>
            <span className="text-xs text-slate-400 font-mono">Academic Petitions Desk</span>
          </div>
          <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
            <LifeBuoy className="w-5 h-5 text-emerald-400" />
            Grievance & Post-Exam Revaluation Management
          </h2>
          <p className="text-xs text-slate-400 max-w-2xl mt-1">
            Systematic queue for student revaluation requests. Enables side-by-side verification of student grounds, answer transcripts, and rubric standards.
          </p>
        </div>

        {/* Strict Guardrail Badge */}
        <div className="px-3.5 py-2.5 bg-slate-800/80 border border-slate-700 rounded-lg text-xs text-slate-300 flex items-center gap-2">
          <Lock className="w-4 h-4 text-amber-400 shrink-0" />
          <div>
            <div className="font-semibold text-white">Negative Guardrail Active</div>
            <div className="text-[11px] text-slate-400">Never resolve grievances automatically</div>
          </div>
        </div>
      </div>

      {/* Main Grid: Ticket Queue & Detail Inspector */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Tickets Queue (4 cols) */}
        <div className="lg:col-span-4 bg-white rounded-lg border border-slate-200 shadow-xs flex flex-col">
          <div className="p-4 border-b border-slate-200 flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase text-slate-700 tracking-wider">
              Petition Tickets ({filteredGrievances.length})
            </h3>
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as any)}
              className="text-xs border border-slate-200 rounded px-2 py-1 bg-slate-50 text-slate-700 focus:outline-none"
            >
              <option value="all">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="resolved">Resolved</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>

          <div className="divide-y divide-slate-100 overflow-y-auto max-h-[600px]">
            {filteredGrievances.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400">No grievances found matching filter.</div>
            ) : (
              filteredGrievances.map((g) => {
                const isSelected = g.id === selectedGrievanceId;
                return (
                  <button
                    key={g.id}
                    onClick={() => {
                      setSelectedGrievanceId(g.id);
                      setRevisedMarks(g.requestedMarks);
                      setFacultyResponse(g.facultyResponse || '');
                      setAiAnalysis(null);
                    }}
                    className={`w-full text-left p-3.5 transition-colors ${
                      isSelected ? 'bg-indigo-50/70 border-l-4 border-indigo-600' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-xs font-bold text-slate-900 truncate">
                        {g.studentName}
                      </span>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                          g.status === 'pending'
                            ? 'bg-amber-100 text-amber-800'
                            : g.status === 'resolved'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}
                      >
                        {g.status}
                      </span>
                    </div>

                    <p className="text-xs text-slate-700 font-medium truncate mb-1">{g.subject}</p>
                    <div className="flex items-center justify-between text-[11px] text-slate-500">
                      <span>{g.examTitle}</span>
                      <span className="font-semibold text-slate-700">
                        {g.currentMarks} → {g.requestedMarks} marks
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Right Area: Ticket Inspector & Split-Screen Adjudication Workspace (8 cols) */}
        <div className="lg:col-span-8 bg-white rounded-lg border border-slate-200 shadow-xs p-6 space-y-6">
          {selectedGrievance ? (
            <>
              {/* Top Meta Bar */}
              <div className="border-b border-slate-200 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-mono text-slate-500 font-semibold">
                      Ticket #{selectedGrievance.id}
                    </span>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                        selectedGrievance.status === 'pending'
                          ? 'bg-amber-100 text-amber-800 border border-amber-200'
                          : selectedGrievance.status === 'under_review'
                          ? 'bg-blue-100 text-blue-800 border border-blue-200'
                          : selectedGrievance.status === 'resolved'
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                          : 'bg-rose-100 text-rose-800 border border-rose-200'
                      }`}
                    >
                      {selectedGrievance.status.replace(/_/g, ' ')}
                    </span>
                    {selectedGrievance.requestedSecondEvaluator && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase bg-purple-100 text-purple-800 border border-purple-200 flex items-center gap-1">
                        <UserCheck className="w-3 h-3" />
                        2nd Evaluator Assigned
                      </span>
                    )}
                  </div>
                  <h3 className="text-base font-bold text-slate-900 leading-snug">{selectedGrievance.subject}</h3>
                  <div className="text-xs text-slate-500 flex flex-wrap items-center gap-3 mt-1 font-sans">
                    <span>Candidate: <strong className="text-slate-800">{selectedGrievance.studentName}</strong> ({selectedGrievance.studentEmail})</span>
                    <span>Exam: <strong className="text-slate-800">{selectedGrievance.examTitle}</strong></span>
                    <span>Question Ref: <strong className="font-mono text-indigo-700">{selectedGrievance.questionId}</strong></span>
                  </div>
                </div>

                <button
                  onClick={handleAiMediation}
                  disabled={aiMediating}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded text-xs font-semibold transition-colors shrink-0 cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                  <span>{aiMediating ? 'Analyzing...' : 'Gemini Mediation Advice'}</span>
                </button>
              </div>

              {/* AI Mediation Callout */}
              {aiAnalysis?.summary && (
                <div className="p-4 rounded-lg bg-indigo-50/80 border border-indigo-200 text-xs text-indigo-950 space-y-2 animate-in fade-in">
                  <div className="flex items-center gap-1.5 font-bold text-indigo-900">
                    <Sparkles className="w-4 h-4 text-indigo-600" />
                    <span>Gemini Mediation Analysis (Assistive Advice for Faculty)</span>
                  </div>
                  <p className="whitespace-pre-line leading-relaxed text-indigo-900 font-sans">
                    {aiAnalysis.summary}
                  </p>
                  <p className="text-[11px] text-indigo-700 italic border-t border-indigo-200 pt-1.5">
                    Notice: Final grade adjustment is strictly reserved for human course faculty.
                  </p>
                </div>
              )}

              {/* Split-Screen Adjudication Comparison Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                {/* ======================================================== */}
                {/* LEFT COLUMN: Question, Candidate Answer, Rubric Breakdown */}
                {/* ======================================================== */}
                <div className="space-y-4 bg-slate-50/70 p-4 rounded-xl border border-slate-200">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                      <BookOpen className="w-4 h-4 text-slate-600" />
                      Question Statement & Valuation
                    </span>
                    <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-white border border-slate-200 text-slate-700">
                      Max: {maxMarks} marks
                    </span>
                  </div>

                  {/* 1. Question Statement */}
                  <div className="p-3 bg-white rounded-lg border border-slate-200 text-xs space-y-1">
                    <span className="font-semibold text-slate-500 block text-[11px] uppercase tracking-wider">
                      Question Prompt ({selectedGrievance.questionId})
                    </span>
                    <p className="text-slate-800 leading-relaxed font-sans">
                      {selectedGrievance.questionId === 'q_cs301_4'
                        ? 'Contrast the design philosophies of Raft and Paxos regarding state machine replication, leader election, and understandability. Explain how Raft decomposes consensus into independent subproblems and cite production implementations (e.g., etcd, Consul).'
                        : selectedGrievance.questionId === 'q_cs301_5'
                        ? 'Formally analyze why scalar Lamport timestamps cannot detect concurrent events or prove causal ordering in the converse direction (V(a) < V(b) does not imply a -> b). Detail how vector clocks resolve this limitation and describe their state vector propagation rules in distributed stores like Amazon Dynamo.'
                        : selectedGrievance.questionId === 'q_cs301_2'
                        ? 'In a distributed key-value store, evaluate the operational trade-offs dictated by the CAP Theorem during a temporary network partition between datacenter regions.'
                        : 'Review question statement and syllabus evaluation benchmarks.'}
                    </p>
                  </div>

                  {/* 2. Candidate Submitted Answer */}
                  <div className="p-3 bg-white rounded-lg border border-slate-200 text-xs space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-500 text-[11px] uppercase tracking-wider">
                        Candidate Submitted Response
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">Timestamped Submission Record</span>
                    </div>
                    <div className="p-2.5 bg-slate-50 rounded border border-slate-100 text-slate-800 leading-relaxed font-sans text-xs">
                      {relatedSubmission?.answers?.[selectedGrievance.questionId] ||
                        subjectiveEvaluation?.studentAnswer ||
                        'Raft divides consensus into 3 independent sub-problems: Leader Election, Log Replication, and Safety. It ensures Leader Completeness and uses randomized election timeouts (150ms-300ms) to prevent split-vote states in production systems like etcd and Consul.'}
                    </div>
                  </div>

                  {/* 3. Official Valuation Scheme */}
                  <div className="p-3 bg-white rounded-lg border border-slate-200 text-xs space-y-1">
                    <span className="font-semibold text-slate-500 block text-[11px] uppercase tracking-wider">
                      Official Valuation Scheme
                    </span>
                    <p className="text-slate-700 text-xs leading-relaxed font-sans">
                      {subjectiveEvaluation?.reasoning ||
                        '1. State Machine Replication Comparison (4m). 2. Leader Election Invariants & Randomized Timeouts (4m). 3. Understandability & Subproblem Decomposition (3m). 4. Real-world Production Trade-offs (4m).'}
                    </p>
                  </div>

                  {/* 4. Gemini 4-Part Rubric Breakdown */}
                  <div className="p-3 bg-white rounded-lg border border-slate-200 text-xs space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-700 text-[11px] uppercase tracking-wider flex items-center gap-1">
                        <Scale className="w-3.5 h-3.5 text-indigo-600" />
                        Gemini 4-Part Rubric Breakdown
                      </span>
                      <span className="text-[10px] text-slate-500 font-mono">40% / 30% / 20% / 10%</span>
                    </div>

                    <div className="space-y-1.5">
                      {subjectiveEvaluation?.rubricBreakdown && subjectiveEvaluation.rubricBreakdown.length > 0 ? (
                        subjectiveEvaluation.rubricBreakdown.map((r, i) => (
                          <div key={i} className="p-2 bg-slate-50 rounded border border-slate-100 flex items-center justify-between text-xs">
                            <div className="min-w-0 pr-2">
                              <span className="font-medium text-slate-800 block truncate">{r.criterion}</span>
                              <span className="text-[11px] text-slate-500 block truncate">{r.comment}</span>
                            </div>
                            <span className="font-mono font-bold text-indigo-700 shrink-0">
                              {r.awarded}/{r.max}
                            </span>
                          </div>
                        ))
                      ) : (
                        <>
                          <div className="p-2 bg-slate-50 rounded border border-slate-100 flex items-center justify-between text-xs">
                            <span className="font-medium text-slate-800">1. Technical Accuracy (40%)</span>
                            <span className="font-mono font-bold text-indigo-700">5.2 / 6.0</span>
                          </div>
                          <div className="p-2 bg-slate-50 rounded border border-slate-100 flex items-center justify-between text-xs">
                            <span className="font-medium text-slate-800">2. Theoretical Depth (30%)</span>
                            <span className="font-mono font-bold text-indigo-700">3.8 / 4.5</span>
                          </div>
                          <div className="p-2 bg-slate-50 rounded border border-slate-100 flex items-center justify-between text-xs">
                            <span className="font-medium text-slate-800">3. Practical Application (20%)</span>
                            <span className="font-mono font-bold text-indigo-700">2.7 / 3.0</span>
                          </div>
                          <div className="p-2 bg-slate-50 rounded border border-slate-100 flex items-center justify-between text-xs">
                            <span className="font-medium text-slate-800">4. Structure & Clarity (10%)</span>
                            <span className="font-mono font-bold text-indigo-700">1.3 / 1.5</span>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* ======================================================== */}
                {/* RIGHT COLUMN: Student Grounds, Revaluation Input & Action */}
                {/* ======================================================== */}
                <div className="space-y-4 bg-slate-50/70 p-4 rounded-xl border border-slate-200 flex flex-col justify-between">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                      <span className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                        <FileText className="w-4 h-4 text-indigo-600" />
                        Candidate Grounds & Revaluation
                      </span>
                      <span className="text-xs text-slate-500 font-mono">Faculty Gate</span>
                    </div>

                    {/* 1. Student Stated Grounds & Appeal */}
                    <div className="p-3 bg-white rounded-lg border border-slate-200 text-xs space-y-1.5">
                      <span className="font-semibold text-slate-500 block text-[11px] uppercase tracking-wider">
                        Student Challenge Justification
                      </span>
                      <p className="text-slate-800 leading-relaxed font-sans bg-amber-50/50 p-2.5 rounded border border-amber-200/50">
                        {selectedGrievance.reason}
                      </p>
                    </div>

                    {/* 2. Syllabus Benchmark Reference */}
                    <div className="p-3 bg-white rounded-lg border border-slate-200 text-xs space-y-1">
                      <span className="font-semibold text-slate-500 block text-[11px] uppercase tracking-wider">
                        Syllabus References & Citations
                      </span>
                      <p className="text-slate-700 font-sans font-medium text-xs">
                        {selectedGrievance.syllabusReference || 'Unit 3: Consensus Protocols & SMR Invariants (KLE Tech CS-301)'}
                      </p>
                    </div>

                    {/* 3. Score Comparison Badges */}
                    <div className="grid grid-cols-2 gap-3 p-3 rounded-lg bg-white border border-slate-200 text-xs">
                      <div className="p-2.5 bg-slate-50 rounded border border-slate-100">
                        <span className="text-slate-500 text-[11px] block mb-0.5">Current Score</span>
                        <div className="text-lg font-bold font-mono text-slate-900">{selectedGrievance.currentMarks} marks</div>
                      </div>
                      <div className="p-2.5 bg-indigo-50/60 rounded border border-indigo-100">
                        <span className="text-indigo-800 text-[11px] block mb-0.5">Student Requested</span>
                        <div className="text-lg font-bold font-mono text-indigo-700">{selectedGrievance.requestedMarks} marks</div>
                      </div>
                    </div>

                    {/* 4. Revision Inputs */}
                    <div className="p-3.5 bg-white rounded-lg border border-slate-200 text-xs space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 mb-1">
                            Revised Awarded Marks
                          </label>
                          <div className="relative">
                            <input
                              type="number"
                              min={0}
                              max={maxMarks}
                              value={revisedMarks}
                              onChange={(e) => setRevisedMarks(Math.min(maxMarks, Math.max(0, Number(e.target.value))))}
                              className="w-full text-sm border border-slate-300 rounded px-3 py-1.5 bg-white text-slate-900 font-mono font-bold focus:outline-none focus:border-indigo-500"
                            />
                            <span className="absolute right-3 top-2 text-[11px] font-mono text-slate-400">
                              / {maxMarks}
                            </span>
                          </div>
                          <span className="text-[10px] text-slate-500 mt-0.5 block">
                            Strictly capped at question maximum ({maxMarks}m).
                          </span>
                        </div>

                        <div>
                          <span className="block text-xs font-semibold text-slate-700 mb-1">
                            Adjustment Delta
                          </span>
                          <div className="pt-2 text-xs font-bold font-mono">
                            {revisedMarks > selectedGrievance.currentMarks ? (
                              <span className="text-emerald-700 bg-emerald-50 px-2 py-1 rounded border border-emerald-200">
                                +{revisedMarks - selectedGrievance.currentMarks} Marks Awarded
                              </span>
                            ) : revisedMarks === selectedGrievance.currentMarks ? (
                              <span className="text-slate-600 bg-slate-100 px-2 py-1 rounded border border-slate-200">
                                Maintain Current ({selectedGrievance.currentMarks}m)
                              </span>
                            ) : (
                              <span className="text-rose-700 bg-rose-50 px-2 py-1 rounded border border-rose-200">
                                {revisedMarks - selectedGrievance.currentMarks} Marks Adjusted
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Faculty Adjudication Remarks & Student Feedback
                        </label>
                        <textarea
                          rows={3}
                          value={facultyResponse}
                          onChange={(e) => setFacultyResponse(e.target.value)}
                          placeholder="Provide the academic justification and specific rubric points for accepting, modifying, or upholding this petition score..."
                          className="w-full text-xs border border-slate-300 rounded p-2.5 bg-white text-slate-900 focus:outline-none focus:border-indigo-500 font-sans"
                        />
                      </div>
                    </div>
                  </div>

                  {/* 5. Action Buttons */}
                  <div className="space-y-2 pt-2 border-t border-slate-200">
                    <div className="flex flex-wrap items-center justify-end gap-2.5">
                      <button
                        onClick={() => handleResolveGrievance('request_second_evaluator')}
                        disabled={isProcessing}
                        className="flex items-center gap-1.5 px-3 py-2 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 rounded text-xs font-semibold transition-colors cursor-pointer"
                        title="Flag for secondary independent evaluation by COE"
                      >
                        <UserCheck className="w-3.5 h-3.5" />
                        <span>Request 2nd Evaluator</span>
                      </button>

                      <button
                        onClick={() => handleResolveGrievance('rejected')}
                        disabled={isProcessing}
                        className="flex items-center gap-1.5 px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded text-xs font-semibold transition-colors cursor-pointer"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        <span>Uphold Score</span>
                      </button>

                      <button
                        onClick={() => handleResolveGrievance('resolved')}
                        disabled={isProcessing}
                        className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Award Revised Marks</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="p-12 text-center text-xs text-slate-400">
              Select a grievance petition from the left panel to inspect details and provide faculty determination.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
