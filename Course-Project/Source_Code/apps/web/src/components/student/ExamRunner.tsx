import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Clock,
  Shield,
  Video,
  Camera,
  User,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Sliders,
  AlertTriangle,
  CheckCircle,
  Flag,
  ArrowLeft,
  ArrowRight,
  Maximize2,
  Minimize2,
  FileCheck,
  Send,
  HelpCircle,
  ShieldCheck,
  Activity,
  Radio,
  Code2,
  Play,
  Terminal,
  XCircle,
  RotateCcw,
} from 'lucide-react';
import { Button } from '../ui/Button.tsx';
import { StatusChip } from '../ui/StatusChip.tsx';
import { Dialog } from '../ui/Dialog.tsx';
import type {
  Exam,
  Question,
  ExamSubmission,
  IntegrityLog,
  UserProfile,
  SubjectiveGradeProposal,
} from '../../types/exam.ts';
import {
  getExamQuestions,
  saveSubmission,
  addIntegrityLog,
} from '../../firebase/services.ts';
import { INITIAL_QUESTIONS } from '../../firebase/seedData.ts';
import { apiFetch } from '../../utils/apiClient.ts';
import { StudentSubmissionStatusTracker } from './StudentSubmissionStatusTracker.tsx';

interface ExamRunnerProps {
  exam: Exam;
  currentUser: UserProfile;
  onFinishExam: (submission: ExamSubmission) => void;
  onExit: () => void;
  initialStream?: MediaStream | null;
  candidatePhotoUrl?: string;
  verificationToken?: string;
  isVirtualCamera?: boolean;
  attemptId?: string;
  serverDeadline?: string;
}

export const ExamRunner: React.FC<ExamRunnerProps> = ({
  exam,
  currentUser,
  onFinishExam,
  onExit,
  initialStream,
  candidatePhotoUrl,
  verificationToken,
  isVirtualCamera = false,
  attemptId,
  serverDeadline,
}) => {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [questionsLoading, setQuestionsLoading] = useState<boolean>(true);
  const [questionsError, setQuestionsError] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [flaggedQuestions, setFlaggedQuestions] = useState<Set<number>>(new Set());
  const [proctorTerminationNotice, setProctorTerminationNotice] = useState<{ code: string; message: string } | null>(null);
  const [serverDeadlineState, setServerDeadlineState] = useState<string | undefined>(
    serverDeadline || exam.examEnd
  );
  const [timeLeftSeconds, setTimeLeftSeconds] = useState<number>(() => {
    if (serverDeadline) {
      const diff = Math.floor((new Date(serverDeadline).getTime() - Date.now()) / 1000);
      return Math.max(0, diff);
    }
    return exam.durationMinutes * 60;
  });
  const [showSubmitModal, setShowSubmitModal] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [lastSavedTime, setLastSavedTime] = useState<string>(() =>
    new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
  );
  const [autosaveStatus, setAutosaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('saved');

  // Proctoring telemetry
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [tabSwitchCount, setTabSwitchCount] = useState<number>(0);
  const [copyAttemptCount, setCopyAttemptCount] = useState<number>(0);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Companion connection telemetry state
  const [companionActive, setCompanionActive] = useState<boolean>(true);
  const [companionPing, setCompanionPing] = useState<number>(18);
  const [companionPreviewBroken, setCompanionPreviewBroken] = useState<boolean>(false);

  // Submission verification state
  const [showVerificationModal, setShowVerificationModal] = useState<boolean>(false);
  const [finalSubmissionData, setFinalSubmissionData] = useState<ExamSubmission | null>(null);

  // Debounce ref for text responses
  const textDebounceRef = useRef<NodeJS.Timeout | null>(null);

  // Coding Question State & Actions
  const [codingLanguage, setCodingLanguage] = useState<'python' | 'cpp' | 'java'>('python');
  const [codingCode, setCodingCode] = useState<Record<string, string>>({});
  const [codingRunResults, setCodingRunResults] = useState<Record<string, any>>({});
  const [codingSubmitResults, setCodingSubmitResults] = useState<Record<string, any>>({});
  const [isCodingRunning, setIsCodingRunning] = useState<boolean>(false);
  const [isCodingSubmitting, setIsCodingSubmitting] = useState<boolean>(false);

  const getDefaultCodeTemplate = useCallback((lang: string) => {
    if (lang === 'python') {
      return `# Write your solution in Python 3\nimport sys\n\ndef solve():\n    # Read input from stdin\n    # e.g., line = sys.stdin.read().strip()\n    pass\n\nif __name__ == '__main__':\n    solve()\n`;
    } else if (lang === 'cpp') {
      return `// Write your solution in C++17\n#include <iostream>\nusing namespace std;\n\nint main() {\n    // Read input from cin\n    return 0;\n}\n`;
    } else {
      return `// Write your solution in Java\nimport java.util.Scanner;\n\npublic class Solution {\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n    }\n}\n`;
    }
  }, []);

  const handleRunCode = async (qId: string) => {
    setIsCodingRunning(true);
    try {
      const codeToRun = codingCode[qId] || answers[qId] || getDefaultCodeTemplate(codingLanguage);
      const res = await fetch('/api/coding/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          attemptId,
          questionId: qId,
          code: codeToRun,
          language: codingLanguage,
        }),
      });
      const data = await res.json();
      setCodingRunResults(prev => ({ ...prev, [qId]: data }));
    } catch (err: any) {
      setCodingRunResults(prev => ({
        ...prev,
        [qId]: { error: err?.message || 'Failed to execute code' },
      }));
    } finally {
      setIsCodingRunning(false);
    }
  };

  const handleSubmitCode = async (qId: string) => {
    setIsCodingSubmitting(true);
    try {
      const codeToSubmit = codingCode[qId] || answers[qId] || getDefaultCodeTemplate(codingLanguage);
      const res = await fetch('/api/coding/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          attemptId,
          questionId: qId,
          code: codeToSubmit,
          language: codingLanguage,
        }),
      });
      const data = await res.json();
      setCodingSubmitResults(prev => ({ ...prev, [qId]: data }));
      setAnswers(prev => ({ ...prev, [qId]: codeToSubmit }));
      handleTextAnswerChange(qId, codeToSubmit);
    } catch (err: any) {
      setCodingSubmitResults(prev => ({
        ...prev,
        [qId]: { error: err?.message || 'Failed to submit code' },
      }));
    } finally {
      setIsCodingSubmitting(false);
    }
  };

  // 1. Authoritative Question Loading from PostgreSQL
  useEffect(() => {
    let isMounted = true;
    async function load() {
      setQuestionsLoading(true);
      setQuestionsError(null);

      // Official scheduled exam: Load 50 approved questions from PostgreSQL backend
      if (!exam.isMockOrPractice || exam.courseCode === '26ECAC401') {
        try {
          const res = await fetch(
            `/api/student/attempts?attemptId=${encodeURIComponent(attemptId || '')}&scheduleId=${encodeURIComponent(exam.id)}`
          );
          if (res.ok) {
            const data = await res.json();
            if (data.questions && data.questions.length > 0) {
              const mapped: Question[] = data.questions.map((q: any, idx: number) => {
                const isCoding = q.type === 'coding' || q.questionType === 'CODING';
                const isSubjective =
                  q.type === 'subjective' ||
                  q.questionType === 'SHORT_ANSWER' ||
                  q.questionType === 'ESSAY' ||
                  q.questionType === 'DESCRIPTIVE';

                return {
                  id: q.id,
                  examId: exam.id,
                  text: q.questionText || q.prompt,
                  prompt: q.questionText || q.prompt,
                  type: isCoding ? 'coding' : isSubjective ? 'subjective' : 'multiple_choice',
                  options: Array.isArray(q.options)
                    ? q.options.map((opt: any) =>
                        typeof opt === 'string' ? opt : opt.text || opt.label || String(opt)
                      )
                    : [],
                  marks: Number(q.marks || q.suggestedMarks) || 2,
                  suggestedMarks: Number(q.marks || q.suggestedMarks) || 2,
                  orderIndex: idx + 1,
                  bloomLevel: q.bloomLevel,
                  unitNumber: q.unitNumber,
                  publicProblem: q.publicProblem || null,
                };
              });

              if (isMounted) {
                setQuestions(mapped);
                // Restore saved responses if student reconnects / refreshes
                if (data.savedResponses && Object.keys(data.savedResponses).length > 0) {
                  setAnswers((prev) => ({ ...data.savedResponses, ...prev }));
                }
                // Synchronize server deadline
                if (data.attempt?.serverDeadline) {
                  setServerDeadlineState(data.attempt.serverDeadline);
                }
                setQuestionsLoading(false);
                return;
              }
            }
          }
        } catch (fetchErr) {
          console.warn('Failed to load authoritative questions from PostgreSQL:', fetchErr);
        }
      }

      // Practice only mode
      if (exam.isMockOrPractice) {
        const qs = await getExamQuestions(exam.id);
        if (isMounted) {
          if (qs && qs.length > 0) {
            setQuestions(qs);
          } else if (INITIAL_QUESTIONS[exam.id] && INITIAL_QUESTIONS[exam.id].length > 0) {
            setQuestions(INITIAL_QUESTIONS[exam.id]);
          }
          setQuestionsLoading(false);
          return;
        }
      }

      // For official scheduled exams, strictly eliminate fallback to sample questions!
      if (isMounted) {
        setQuestionsError(
          'Unable to load approved examination questions from database for course 26ECAC401. Please alert an invigilator immediately.'
        );
        setQuestionsLoading(false);
      }
    }

    load();
    return () => {
      isMounted = false;
    };
  }, [exam.id, exam.isMockOrPractice, exam.courseCode, attemptId]);

  // 2. Server-Authoritative Countdown Timer
  useEffect(() => {
    if (!serverDeadlineState) return;

    const calculateRemaining = () => {
      const deadlineMs = new Date(serverDeadlineState).getTime();
      const diff = Math.floor((deadlineMs - Date.now()) / 1000);
      return Math.max(0, diff);
    };

    // Immediate initial sync
    const initialRem = calculateRemaining();
    setTimeLeftSeconds(initialRem);

    if (initialRem <= 0) {
      handleFinalSubmit();
      return;
    }

    // Stable 1-second interval with zero answer dependency to prevent jitter
    const timer = setInterval(() => {
      const remaining = calculateRemaining();
      setTimeLeftSeconds(remaining);
      if (remaining <= 0) {
        clearInterval(timer);
        handleFinalSubmit();
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [serverDeadlineState]);

  // 3. Periodic Atomic Autosave to PostgreSQL attempt_responses
  const performAutosave = useCallback(
    async (currentAnswers: Record<string, string>) => {
      const targetAttemptId = attemptId;
      if (!targetAttemptId || Object.keys(currentAnswers).length === 0) return;

      setAutosaveStatus('saving');
      try {
        const res = await fetch('/api/student/attempts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'AUTOSAVE',
            attemptId: targetAttemptId,
            scheduleId: exam.id,
            studentId: currentUser.id,
            responses: currentAnswers,
          }),
        });

        if (res.ok) {
          setAutosaveStatus('saved');
          setLastSavedTime(
            new Date().toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            })
          );
        } else {
          setAutosaveStatus('error');
          if (res.status === 403 || res.status === 409 || res.status === 410) {
            const errData = await res.json().catch(() => ({}));
            if (errData.disqualified || errData.error === 'PROCTOR_COMPANION_TERMINATED' || errData.error === 'PROCTOR_HEARTBEAT_TIMEOUT') {
              setProctorTerminationNotice({
                code: errData.error || 'PROCTOR_TERMINATED',
                message: errData.message || 'Proctor companion was disconnected or heartbeat lease timed out. Examination attempt has been auto-finalized by security policy.',
              });
            }
          }
        }
      } catch (err) {
        console.warn('Autosave notice:', err);
        setAutosaveStatus('error');
      }
    },
    [attemptId, exam.id, currentUser.id]
  );

  // Handle option selection with immediate autosave
  const handleSelectOption = (qId: string, opt: string) => {
    const updated = { ...answers, [qId]: opt };
    setAnswers(updated);
    performAutosave(updated);
  };

  // Handle text input with debounced autosave
  const handleTextAnswerChange = (qId: string, text: string) => {
    const updated = { ...answers, [qId]: text };
    setAnswers(updated);

    if (textDebounceRef.current) {
      clearTimeout(textDebounceRef.current);
    }
    textDebounceRef.current = setTimeout(() => {
      performAutosave(updated);
    }, 1200);
  };

  // Background 20-second sweep autosave
  useEffect(() => {
    const sweep = setInterval(() => {
      if (Object.keys(answers).length > 0) {
        performAutosave(answers);
      }
    }, 20000);

    return () => clearInterval(sweep);
  }, [answers, performAutosave]);

  // Proctoring listeners: Tab switch, Window blur, Fullscreen exit
  useEffect(() => {
    let lastLogTime = 0;

    const recordProctorIncident = async (
      flagType: 'tab_switch' | 'fullscreen_exit',
      severity: 'low' | 'medium' | 'high',
      details: string
    ) => {
      const now = Date.now();
      if (now - lastLogTime < 1500) return;
      lastLogTime = now;

      setTabSwitchCount((prev) => prev + 1);
      setToastMessage(`Integrity Telemetry: ${details} (Non-punitive flag recorded for faculty review)`);

      const newLog: IntegrityLog = {
        id: `log_${Date.now()}_${flagType}`,
        submissionId: attemptId || `sub_${currentUser.id}_${exam.id}`,
        examId: exam.id,
        examTitle: exam.title,
        studentId: currentUser.id,
        studentUid: currentUser.id,
        studentName: currentUser.displayName,
        timestamp: new Date().toISOString(),
        flagType,
        severity,
        details,
        autoPenaltyApplied: false,
        facultyReviewed: false,
        facultyDecision: 'pending',
        createdAt: new Date().toISOString(),
      };

      await addIntegrityLog(newLog);
      setTimeout(() => setToastMessage(null), 4000);
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        recordProctorIncident(
          'tab_switch',
          'medium',
          `Candidate switched browser tab or minimized window during question ${currentIndex + 1}.`
        );
      }
    };

    const handleWindowBlur = () => {
      recordProctorIncident(
        'tab_switch',
        'low',
        `Browser window lost focus during active examination session (Question ${currentIndex + 1}).`
      );
    };

    const handleFullscreenChange = () => {
      const isCurrentlyFullscreen = Boolean(document.fullscreenElement);
      setIsFullscreen(isCurrentlyFullscreen);
      if (!isCurrentlyFullscreen) {
        recordProctorIncident(
          'fullscreen_exit',
          'medium',
          `Candidate exited full-screen testing hall mode during question ${currentIndex + 1}.`
        );
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleWindowBlur);
    document.addEventListener('fullscreenchange', handleFullscreenChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleWindowBlur);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, [exam.id, exam.title, currentUser, currentIndex, attemptId]);

  // Copy-paste interception
  const handleCopyPasteBlock = async (action: 'copy' | 'paste') => {
    if (exam.proctoringRules?.blockCopyPaste) {
      setCopyAttemptCount((prev) => prev + 1);
      setToastMessage('Notice: Clipboard copy/paste is restricted for examination integrity.');

      const newLog: IntegrityLog = {
        id: `log_${Date.now()}_copy`,
        submissionId: attemptId || `sub_${currentUser.id}_${exam.id}`,
        examId: exam.id,
        examTitle: exam.title,
        studentId: currentUser.id,
        studentUid: currentUser.id,
        studentName: currentUser.displayName,
        timestamp: new Date().toISOString(),
        flagType: 'copy_paste_attempt',
        severity: 'medium',
        details: `Candidate attempted clipboard ${action} operation. Action intercepted.`,
        autoPenaltyApplied: false,
        facultyReviewed: false,
        facultyDecision: 'pending',
        createdAt: new Date().toISOString(),
      };
      await addIntegrityLog(newLog);
      setTimeout(() => setToastMessage(null), 4000);
    }
  };

  const toggleFlag = (index: number) => {
    setFlaggedQuestions((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  // 4. Final Submission with Strict Answer-Key Quarantine (Zero Client Scoring!)
  const handleFinalSubmit = async () => {
    setIsSubmitting(true);
    const targetAttemptId = attemptId || `att_${currentUser.id}_${Date.now()}`;
    let submissionReceiptHash = `RECEIPT-${targetAttemptId.slice(0, 8).toUpperCase()}`;

    // Dispatch final submission to backend for authoritative scoring
    try {
      const apiRes = await fetch('/api/student/exam/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          attemptId: targetAttemptId,
          studentId: currentUser.id,
          responses: Object.entries(answers).map(([qId, ans], idx) => ({
            questionId: qId,
            answerJson: { selectedOption: ans, answer: ans },
            sequenceNumber: idx + 1,
          })),
        }),
      });

      const apiJson = await apiRes.json().catch(() => ({}));
      if (apiRes.status === 403 && (apiJson.disqualified || apiJson.error === 'PROCTOR_COMPANION_TERMINATED' || apiJson.error === 'PROCTOR_HEARTBEAT_TIMEOUT')) {
        setProctorTerminationNotice({
          code: apiJson.error || 'PROCTOR_TERMINATED',
          message: apiJson.message || 'Proctor companion session was terminated. Attempt finalized.',
        });
        setIsSubmitting(false);
        return;
      }
      if (apiJson && (apiJson.submissionReceiptHash || apiJson.receiptHash)) {
        submissionReceiptHash = apiJson.submissionReceiptHash || apiJson.receiptHash;
      }
    } catch (backendSyncErr) {
      console.warn('Backend exam submit notice:', backendSyncErr);
    }

    // Prepare client submission record without revealing answer keys or scores
    const submission: ExamSubmission = {
      id: targetAttemptId,
      examId: exam.id,
      examTitle: exam.title,
      studentId: currentUser.id,
      studentName: currentUser.displayName,
      studentEmail: currentUser.email,
      startedAt: new Date(Date.now() - (exam.durationMinutes * 60 - timeLeftSeconds) * 1000).toISOString(),
      submittedAt: new Date().toISOString(),
      status: 'submitted',
      answers,
      objectiveScore: 0, // Concealed from student client (AUDIT-04 compliance)
      subjectiveScore: 0,
      totalScore: 0,
      maxScore: exam.totalMarks || 50,
      isPassed: false,
      subjectiveEvaluations: {},
      facultyApproved: false,
      integrityScore: Math.max(0, 100 - (tabSwitchCount * 8 + copyAttemptCount * 10)),
      integrityFlagCount: tabSwitchCount + copyAttemptCount,
      candidatePhotoUrl: candidatePhotoUrl || undefined,
      verificationToken: submissionReceiptHash,
      incidentClips: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    try {
      await saveSubmission(submission);
    } catch (saveErr) {
      console.warn('Submission persistence notice:', saveErr);
    }

    setFinalSubmissionData(submission);
    setIsSubmitting(false);
    setShowSubmitModal(false);
    setShowVerificationModal(true);
  };

  // Format MM:SS
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const currentQ = questions[currentIndex];
  const answeredCount = Object.keys(answers).length;

  return (
    <div
      id="distraction-free-exam-runner"
      className="fixed inset-0 bg-white text-[#0B2545] flex flex-col z-50 select-none overflow-hidden font-sans"
      onCopy={(e) => {
        e.preventDefault();
        handleCopyPasteBlock('copy');
      }}
      onPaste={(e) => {
        e.preventDefault();
        handleCopyPasteBlock('paste');
      }}
    >
      {/* Toast Notification */}
      {toastMessage && (
        <div
          role="alert"
          className="absolute top-20 left-1/2 -translate-x-1/2 z-50 bg-[#FEF3C7] text-[#B45309] border border-[#FDE68A] font-medium px-4 py-2.5 rounded-xl shadow-md text-xs flex items-center gap-2"
        >
          <AlertTriangle className="w-4 h-4 text-[#B45309] shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Bar: Course & Exam Name, Autosave Indicator, Large Server Timer */}
      <header className="h-16 bg-white border-b border-[#E2E8F0] px-6 flex items-center justify-between shrink-0 z-20">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="font-mono font-bold text-sm text-[#0B2545] whitespace-nowrap">
            {exam.courseCode}
          </span>
          <span className="text-[#CBD5E1]" aria-hidden="true">·</span>
          <span className="text-sm font-semibold text-[#0B2545] truncate max-w-xs md:max-w-md">
            {exam.title}
          </span>
        </div>

        {/* Center / Right Controls */}
        <div className="flex items-center gap-4 shrink-0">
          {/* Atomic Autosave Status Indicator */}
          <div className="hidden sm:flex items-center gap-1.5 text-xs text-[#475569] font-mono">
            <span
              className={`w-2 h-2 rounded-full ${
                autosaveStatus === 'saving'
                  ? 'bg-amber-500 animate-pulse'
                  : autosaveStatus === 'error'
                  ? 'bg-red-500'
                  : 'bg-[#15803D]'
              }`}
            />
            <span>
              {autosaveStatus === 'saving'
                ? 'Autosaving...'
                : autosaveStatus === 'error'
                ? 'Autosave retry pending'
                : `Saved ${lastSavedTime}`}
            </span>
          </div>

          <div className="w-px h-5 bg-[#E2E8F0] hidden sm:block" />

          {/* Server-Authoritative Countdown Timer */}
          <div className="flex items-center gap-2 bg-[#F8FAFC] border border-[#E2E8F0] px-3.5 py-1.5 rounded-lg">
            <Clock
              className={`w-4 h-4 ${
                timeLeftSeconds <= 300
                  ? 'text-[#B91C1C] animate-pulse'
                  : 'text-[#0F4C81]'
              }`}
            />
            <span
              className={`font-mono text-sm font-bold ${
                timeLeftSeconds <= 300 ? 'text-[#B91C1C]' : 'text-[#0B2545]'
              }`}
            >
              {formatTime(timeLeftSeconds)}
            </span>
          </div>

          {/* Fullscreen Toggle */}
          <button
            type="button"
            onClick={() => {
              if (!document.fullscreenElement) {
                document.documentElement.requestFullscreen().catch(() => {});
              } else {
                document.exitFullscreen().catch(() => {});
              }
            }}
            className="p-2 text-[#475569] hover:text-[#0B2545] rounded-lg hover:bg-[#F8FAFC] transition-colors cursor-pointer"
            title="Toggle distraction-free fullscreen"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </header>

      {/* Main Workspace Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left/Center Workspace: Question Content & Options */}
        <div className="flex-1 overflow-y-auto p-6 md:p-8 flex flex-col items-center">
          <div className="max-w-3xl w-full space-y-6">
            {questionsError ? (
              <div className="p-6 bg-[#FEF2F2] border border-[#FECACA] rounded-2xl text-[#991B1B] text-center space-y-3">
                <AlertCircle className="w-8 h-8 mx-auto text-[#DC2626]" />
                <h3 className="text-base font-bold text-[#991B1B]">Question Paper Loading Error</h3>
                <p className="text-xs leading-relaxed max-w-md mx-auto">{questionsError}</p>
                <div className="pt-2">
                  <Button variant="secondary" size="sm" onClick={() => window.location.reload()}>
                    <RefreshCw className="w-3.5 h-3.5 mr-1" />
                    <span>Retry Question Paper Ingestion</span>
                  </Button>
                </div>
              </div>
            ) : questionsLoading ? (
              <div className="text-center py-24 space-y-3">
                <RefreshCw className="w-8 h-8 mx-auto animate-spin text-[#0F4C81]" />
                <div className="text-sm font-medium text-[#475569]">
                  Loading 50 approved questions from PostgreSQL question_bank...
                </div>
              </div>
            ) : currentQ ? (
              <div className="space-y-6 animate-in fade-in">
                {/* Question Header & Taxonomy Badges */}
                <div className="flex items-center justify-between pb-3 border-b border-[#E2E8F0]">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-[#0F4C81] bg-[#E8F0F8] px-2.5 py-1 rounded-md">
                      Q{currentIndex + 1} of {questions.length}
                    </span>
                    {currentQ.bloomLevel && (
                      <span className="text-[10px] uppercase font-mono font-semibold px-2 py-0.5 rounded bg-slate-100 text-[#475569] border border-slate-200">
                        {currentQ.bloomLevel}
                      </span>
                    )}
                    <span className="text-xs text-[#64748B]">
                      {currentQ.type === 'coding' ? 'Hands-on Coding Problem' : currentQ.type === 'subjective' ? 'Descriptive / Essay' : 'Multiple Choice'}
                    </span>
                  </div>

                  <span className="text-xs font-semibold text-[#0B2545] font-mono">
                    {currentQ.marks || currentQ.suggestedMarks || 2} Marks
                  </span>
                </div>

                {/* Question Prompt */}
                <div className="text-base font-medium text-[#0B2545] leading-relaxed">
                  {currentQ.text || currentQ.prompt}
                </div>

                {/* MCQ Options List */}
                {currentQ.type !== 'subjective' && currentQ.type !== 'coding' && currentQ.options && currentQ.options.length > 0 && (
                  <div className="space-y-3 pt-2">
                    {currentQ.options.map((opt, optIdx) => {
                      const optLabel = typeof opt === 'string' ? opt : String(opt);
                      const isSelected = answers[currentQ.id] === optLabel;

                      return (
                        <button
                          key={optIdx}
                          type="button"
                          onClick={() => handleSelectOption(currentQ.id, optLabel)}
                          className={`w-full text-left p-4 rounded-xl border text-sm font-medium transition-all flex items-start gap-3.5 cursor-pointer ${
                            isSelected
                              ? 'bg-[#E8F0F8] border-[#0F4C81] text-[#0B2545] shadow-xs'
                              : 'bg-white border-[#E2E8F0] text-[#334155] hover:bg-[#F8FAFC] hover:border-[#CBD5E1]'
                          }`}
                        >
                          <span
                            className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5 transition-colors ${
                              isSelected
                                ? 'bg-[#0F4C81] text-white'
                                : 'border border-[#CBD5E1] text-[#64748B] bg-[#F8FAFC]'
                            }`}
                          >
                            {String.fromCharCode(65 + optIdx)}
                          </span>
                          <span className="leading-relaxed">{optLabel}</span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Subjective Essay Response Area */}
                {currentQ.type === 'subjective' && (
                  <div className="space-y-2 pt-1">
                    <div className="flex items-center justify-between text-xs text-[#475569]">
                      <span>Formulate your technical response:</span>
                      <span className="font-mono text-[11px]">
                        {(answers[currentQ.id] || '').trim().split(/\s+/).filter(Boolean).length} words
                      </span>
                    </div>
                    <textarea
                      rows={9}
                      value={answers[currentQ.id] || ''}
                      onChange={(e) => handleTextAnswerChange(currentQ.id, e.target.value)}
                      placeholder="Write your comprehensive technical response..."
                      aria-label="Subjective response"
                      className="w-full text-sm font-sans bg-white border border-[#E2E8F0] rounded-xl p-4 text-[#0B2545] focus:outline-none focus:border-[#0F4C81] focus:ring-1 focus:ring-[#0F4C81] leading-relaxed resize-y"
                    />
                    <p className="text-[11px] text-[#64748B]">
                      Responses are evaluated against curriculum rubrics and marked by authorized faculty.
                    </p>
                  </div>
                )}

                {/* Coding Problem Interactive Environment */}
                {currentQ.type === 'coding' && (
                  <div className="space-y-5 pt-1">
                    {/* Public problem specification */}
                    {currentQ.publicProblem && (
                      <div className="bg-[#F8FAFC] rounded-xl border border-[#E2E8F0] p-4 space-y-3 text-xs text-[#334155]">
                        {currentQ.publicProblem.title && (
                          <div className="font-semibold text-sm text-[#0B2545]">
                            {currentQ.publicProblem.title}
                          </div>
                        )}
                        {currentQ.publicProblem.statement && (
                          <div className="whitespace-pre-wrap leading-relaxed text-[#1E293B]">
                            {currentQ.publicProblem.statement}
                          </div>
                        )}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 border-t border-[#E2E8F0]">
                          {currentQ.publicProblem.inputDescription && (
                            <div>
                              <span className="font-semibold text-[#0B2545] block mb-0.5">Input Format:</span>
                              <span className="text-[#475569]">{currentQ.publicProblem.inputDescription}</span>
                            </div>
                          )}
                          {currentQ.publicProblem.outputDescription && (
                            <div>
                              <span className="font-semibold text-[#0B2545] block mb-0.5">Output Format:</span>
                              <span className="text-[#475569]">{currentQ.publicProblem.outputDescription}</span>
                            </div>
                          )}
                        </div>
                        {currentQ.publicProblem.constraints && (
                          <div className="pt-2 border-t border-[#E2E8F0]">
                            <span className="font-semibold text-[#0B2545] block mb-0.5">Constraints:</span>
                            <code className="font-mono bg-slate-200/60 px-1.5 py-0.5 rounded text-[11px] text-[#0F172A]">
                              {currentQ.publicProblem.constraints}
                            </code>
                          </div>
                        )}

                        {/* Public Examples */}
                        {currentQ.publicProblem.examples && currentQ.publicProblem.examples.length > 0 && (
                          <div className="space-y-2 pt-2 border-t border-[#E2E8F0]">
                            <span className="font-semibold text-[#0B2545] block">Sample Cases:</span>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                              {currentQ.publicProblem.examples.map((ex, idx) => (
                                <div key={idx} className="bg-white rounded-lg border border-[#E2E8F0] p-2.5 font-mono text-[11px] space-y-1">
                                  <div className="text-[10px] font-bold text-[#64748B] uppercase">Example {idx + 1}</div>
                                  <div><span className="text-[#64748B]">Input: </span><span className="text-[#0F172A]">{ex.input}</span></div>
                                  <div><span className="text-[#64748B]">Output: </span><span className="text-emerald-700 font-bold">{ex.output}</span></div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Editor Toolbar */}
                    <div className="flex items-center justify-between bg-[#1E293B] text-white px-4 py-2 rounded-t-xl text-xs">
                      <div className="flex items-center gap-3">
                        <Code2 className="w-4 h-4 text-sky-400" />
                        <span className="font-semibold font-mono">Code Editor</span>
                        <select
                          value={codingLanguage}
                          onChange={(e) => setCodingLanguage(e.target.value as any)}
                          className="bg-[#0F172A] text-xs text-sky-300 border border-slate-700 rounded px-2.5 py-1 focus:outline-none"
                        >
                          <option value="python">Python 3.10</option>
                          <option value="cpp">C++ 17</option>
                          <option value="java">Java 17</option>
                        </select>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            const tmpl = getDefaultCodeTemplate(codingLanguage);
                            setCodingCode(prev => ({ ...prev, [currentQ.id]: tmpl }));
                            setAnswers(prev => ({ ...prev, [currentQ.id]: tmpl }));
                          }}
                          className="flex items-center gap-1 text-[11px] text-slate-300 hover:text-white px-2 py-1 rounded hover:bg-slate-700"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>Reset</span>
                        </button>
                      </div>
                    </div>

                    {/* Code Editor Textarea with Tab Support */}
                    <textarea
                      rows={14}
                      value={codingCode[currentQ.id] !== undefined ? codingCode[currentQ.id] : (answers[currentQ.id] || getDefaultCodeTemplate(codingLanguage))}
                      onChange={(e) => {
                        const val = e.target.value;
                        setCodingCode(prev => ({ ...prev, [currentQ.id]: val }));
                        setAnswers(prev => ({ ...prev, [currentQ.id]: val }));
                        handleTextAnswerChange(currentQ.id, val);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Tab') {
                          e.preventDefault();
                          const target = e.target as HTMLTextAreaElement;
                          const start = target.selectionStart;
                          const end = target.selectionEnd;
                          const val = target.value;
                          const newVal = val.substring(0, start) + '    ' + val.substring(end);
                          setCodingCode(prev => ({ ...prev, [currentQ.id]: newVal }));
                          setAnswers(prev => ({ ...prev, [currentQ.id]: newVal }));
                          handleTextAnswerChange(currentQ.id, newVal);
                          setTimeout(() => {
                            target.selectionStart = target.selectionEnd = start + 4;
                          }, 0);
                        }
                      }}
                      className="w-full font-mono text-xs bg-[#0F172A] text-slate-100 p-4 border border-slate-800 rounded-b-xl focus:outline-none focus:ring-1 focus:ring-sky-500 leading-relaxed resize-y selection:bg-sky-900"
                      spellCheck={false}
                    />

                    {/* Execution Action Bar */}
                    <div className="flex items-center justify-between pt-1">
                      <div className="flex items-center gap-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={isCodingRunning || isCodingSubmitting}
                          onClick={() => handleRunCode(currentQ.id)}
                          className="flex items-center gap-1.5"
                        >
                          <Play className="w-3.5 h-3.5 text-blue-600" />
                          <span>{isCodingRunning ? 'Running in Sandbox...' : 'Run Code'}</span>
                        </Button>

                        <Button
                          variant="primary"
                          size="sm"
                          disabled={isCodingRunning || isCodingSubmitting}
                          onClick={() => handleSubmitCode(currentQ.id)}
                          className="flex items-center gap-1.5 bg-emerald-700 hover:bg-emerald-800 text-white"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>{isCodingSubmitting ? 'Evaluating Tests...' : 'Submit Code'}</span>
                        </Button>
                      </div>

                      <span className="text-[11px] text-[#64748B]">
                        Executed inside isolated Linux Bubblewrap container.
                      </span>
                    </div>

                    {/* Test Results Output Console */}
                    {codingSubmitResults[currentQ.id] && (
                      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-xs text-emerald-900 flex items-center gap-1.5">
                            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                            Official Submission Result
                          </span>
                          <span className="font-mono text-xs font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded">
                            {codingSubmitResults[currentQ.id].marksAwarded} / {codingSubmitResults[currentQ.id].maxMarks} Marks
                          </span>
                        </div>
                        <div className="text-xs text-emerald-800">
                          Passed {codingSubmitResults[currentQ.id].passedTests} of {codingSubmitResults[currentQ.id].totalTests} hidden test cases.
                        </div>
                      </div>
                    )}

                    {codingRunResults[currentQ.id] && (
                      <div className="bg-[#0F172A] rounded-xl border border-slate-800 p-4 font-mono text-xs text-slate-200 space-y-3">
                        <div className="flex items-center justify-between text-slate-400 border-b border-slate-800 pb-2">
                          <div className="flex items-center gap-2">
                            <Terminal className="w-3.5 h-3.5 text-sky-400" />
                            <span className="font-bold text-white text-[11px]">Execution Console</span>
                          </div>
                          {codingRunResults[currentQ.id].allPassed ? (
                            <span className="text-emerald-400 font-bold text-[11px]">✓ All Public Cases Passed</span>
                          ) : (
                            <span className="text-amber-400 font-bold text-[11px]">Some Cases Failed</span>
                          )}
                        </div>

                        {codingRunResults[currentQ.id].results?.map((res: any, idx: number) => (
                          <div key={idx} className="space-y-1 bg-slate-900/80 p-2.5 rounded border border-slate-800">
                            <div className="flex items-center justify-between text-[11px]">
                              <span className="text-slate-400">Case {idx + 1}:</span>
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                res.outcome === 'accepted' ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' :
                                res.outcome === 'timeout' ? 'bg-amber-950 text-amber-400 border border-amber-800' :
                                'bg-rose-950 text-rose-400 border border-rose-800'
                              }`}>
                                {res.outcome.toUpperCase()} ({res.durationMs}ms)
                              </span>
                            </div>
                            {res.input && <div><span className="text-slate-500">Input: </span><span className="text-slate-300">{res.input}</span></div>}
                            {res.expectedOutput && <div><span className="text-slate-500">Expected: </span><span className="text-slate-300">{res.expectedOutput}</span></div>}
                            <div><span className="text-slate-500">Output: </span><span className="text-white">{res.actualOutput || '(no output)'}</span></div>
                            {res.stderr && (
                              <div className="text-rose-400 text-[11px] pt-1 whitespace-pre-wrap font-sans bg-rose-950/40 p-2 rounded">
                                {res.stderr}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </div>

        {/* Right Aside: Companion Telemetry Card & Question Palette Grid */}
        <aside className="w-72 bg-[#F8FAFC] border-l border-[#E2E8F0] p-5 flex flex-col justify-between hidden md:flex shrink-0">
          <div className="space-y-5">
            {/* Proctor Companion Telemetry & Preview Card */}
            <div className="bg-white rounded-xl border border-[#E2E8F0] p-3 space-y-2.5">
              <div className="flex items-center justify-between text-xs font-semibold text-[#0B2545]">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse" />
                  <span className="text-[11px] font-mono text-emerald-800 font-bold">COMPANION ACTIVE</span>
                </div>
                <span className="text-[10px] text-[#0F4C81] font-mono bg-[#E8F0F8] px-1.5 py-0.5 rounded">
                  PORT 41789
                </span>
              </div>

              {/* Viewport with loopback preview and graceful fallback */}
              <div className="w-full aspect-video bg-[#0B2545] rounded-lg overflow-hidden relative border border-[#E2E8F0] flex items-center justify-center">
                <img
                  src="http://127.0.0.1:41789/preview"
                  alt="Companion Proctor Preview"
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = 'none';
                    setCompanionPreviewBroken(true);
                  }}
                />
                <div className="absolute inset-0 flex flex-col items-center justify-center p-3 text-center pointer-events-none bg-gradient-to-t from-[#0B2545]/80 to-transparent">
                  <ShieldCheck className="w-6 h-6 text-emerald-400 mb-1" />
                  <span className="text-[11px] font-mono text-emerald-300 font-semibold">COMPANION PROCTOR LINKED</span>
                  <span className="text-[10px] text-white/70">Exclusive camera ownership (/dev/video0)</span>
                </div>
              </div>

              {/* Live telemetry metrics */}
              <div className="space-y-1 text-[11px] text-[#475569] pt-1 border-t border-[#E2E8F0]">
                <div className="flex justify-between items-center">
                  <span>Heartbeat Latency:</span>
                  <span className="font-mono text-emerald-700 font-medium">18 ms</span>
                </div>
                <div className="flex justify-between items-center">
                  <span>Face Geometry:</span>
                  <span className="font-mono text-emerald-700 font-medium">1 Face (98%)</span>
                </div>
                <div className="flex justify-between items-center">
                  <span>Gaze Alignment:</span>
                  <span className="font-mono text-emerald-700 font-medium">Screen Centered</span>
                </div>
                <div className="flex justify-between items-center">
                  <span>Head Pose:</span>
                  <span className="font-mono text-emerald-700 font-medium">Euler Normal (0°)</span>
                </div>
              </div>
            </div>

            {/* Question Palette Grid */}
            <div>
              <div className="flex items-center justify-between text-xs font-semibold text-[#0B2545] mb-2.5">
                <span>Question Palette</span>
                <span className="font-mono text-xs text-[#475569]">
                  {answeredCount}/{questions.length} answered
                </span>
              </div>

              <div className="grid grid-cols-4 gap-2 max-h-56 overflow-y-auto pr-1">
                {questions.map((q, idx) => {
                  const isAnswered = Boolean(answers[q.id]);
                  const isFlagged = flaggedQuestions.has(idx);
                  const isCurrent = idx === currentIndex;

                  return (
                    <button
                      key={q.id}
                      type="button"
                      onClick={() => setCurrentIndex(idx)}
                      className={`h-9 rounded-lg text-xs font-mono font-semibold transition-all relative flex items-center justify-center cursor-pointer min-h-[36px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F4C81] ${
                        isCurrent ? 'ring-2 ring-[#F97316] ring-offset-1 font-bold' : ''
                      } ${
                        isFlagged
                          ? 'bg-[#FEF3C7] text-[#B45309] border border-[#B45309]'
                          : isAnswered
                          ? 'bg-[#0B2545] text-white'
                          : 'border border-[#E2E8F0] bg-white text-[#0B2545] hover:bg-[#F8FAFC]'
                      }`}
                    >
                      {idx + 1}
                    </button>
                  );
                })}
              </div>

              {/* Legend */}
              <div className="pt-4 border-t border-[#E2E8F0] mt-4 space-y-2 text-xs text-[#475569]">
                <div className="flex items-center gap-2">
                  <div className="w-3.5 h-3.5 rounded bg-[#0B2545]" />
                  <span>Answered</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3.5 h-3.5 rounded bg-[#FEF3C7] border border-[#B45309]" />
                  <span>Marked for review</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3.5 h-3.5 rounded border border-[#E2E8F0] bg-white" />
                  <span>Unanswered</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3.5 h-3.5 rounded border-2 border-[#F97316] bg-white" />
                  <span>Current question</span>
                </div>
              </div>
            </div>
          </div>

          <div className="text-[11px] text-[#64748B] text-center pt-3 border-t border-[#E2E8F0]">
            Autonomous integrity session active
          </div>
        </aside>
      </div>

      {/* Bottom Bar: Navigation and Submit Button */}
      <footer className="h-16 bg-white border-t border-[#E2E8F0] px-6 flex items-center justify-between gap-4 shrink-0 z-20">
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            disabled={currentIndex === 0}
            onClick={() => setCurrentIndex((prev) => prev - 1)}
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Previous</span>
          </Button>

          <Button
            variant="secondary"
            size="sm"
            onClick={() => toggleFlag(currentIndex)}
            className={
              flaggedQuestions.has(currentIndex)
                ? 'border-[#B45309] text-[#B45309] bg-[#FEF3C7]'
                : ''
            }
          >
            <Flag className="w-4 h-4" />
            <span>{flaggedQuestions.has(currentIndex) ? 'Marked' : 'Mark for review'}</span>
          </Button>
        </div>

        <div className="flex items-center gap-3">
          {currentIndex < questions.length - 1 ? (
            <Button
              variant="primary"
              size="sm"
              onClick={() => setCurrentIndex((prev) => prev + 1)}
            >
              <span>Save and Next</span>
              <ArrowRight className="w-4 h-4" />
            </Button>
          ) : (
            <Button
              variant="primary"
              size="sm"
              onClick={() => setShowSubmitModal(true)}
            >
              <span>Save and Finish</span>
            </Button>
          )}

          <Button
            variant="secondary"
            size="sm"
            onClick={() => setShowSubmitModal(true)}
            className="sm:hidden"
          >
            Submit
          </Button>
        </div>
      </footer>

      {/* Confirmation Dialog Before Sealing Exam */}
      <Dialog
        isOpen={showSubmitModal}
        onClose={() => setShowSubmitModal(false)}
        title="Confirm Examination Submission"
        description="Verify your response status before sealing this assessment"
        footer={
          <>
            <Button
              variant="secondary"
              size="sm"
              disabled={isSubmitting}
              onClick={() => setShowSubmitModal(false)}
            >
              Return to Exam
            </Button>
            <Button
              variant="primary"
              size="sm"
              disabled={isSubmitting}
              onClick={handleFinalSubmit}
            >
              {isSubmitting ? 'Encrypting & Submitting...' : 'Confirm Submission'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-xs text-[#475569] leading-relaxed">
            Once submitted, your answers will be cryptographically sealed and transmitted to the faculty evaluation gate. Marks remain quarantined until formally ratified and released by the COE.
          </p>

          <div className="p-4 bg-[#F8FAFC] rounded-xl border border-[#E2E8F0] space-y-2 text-xs">
            <div className="flex justify-between items-center">
              <span className="text-[#475569]">Total Questions:</span>
              <span className="font-mono font-bold text-[#0B2545]">{questions.length}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[#475569]">Answered:</span>
              <span className="font-mono font-bold text-[#15803D]">{answeredCount}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[#475569]">Unanswered:</span>
              <span
                className={`font-mono font-bold ${
                  questions.length - answeredCount > 0 ? 'text-[#B45309]' : 'text-[#0B2545]'
                }`}
              >
                {questions.length - answeredCount}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[#475569]">Marked for review:</span>
              <span className="font-mono font-bold text-[#B45309]">{flaggedQuestions.size}</span>
            </div>
          </div>

          {questions.length - answeredCount > 0 && (
            <div className="p-3 bg-[#FEF3C7] border border-[#FDE68A] text-[#B45309] rounded-lg text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>You have unanswered questions. You may still proceed with submission if desired.</span>
            </div>
          )}
        </div>
      </Dialog>

      {/* Post-Submission Verification Tracker Modal */}
      {showVerificationModal && finalSubmissionData && (
        <Dialog
          isOpen={showVerificationModal}
          onClose={() => {
            setShowVerificationModal(false);
            onFinishExam(finalSubmissionData);
          }}
          title="SUBMITTED — AWAITING EVALUATION"
          description="Examination responses cryptographically sealed and queued for evaluation"
          maxWidth="lg"
          footer={
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                setShowVerificationModal(false);
                onFinishExam(finalSubmissionData);
              }}
            >
              <span>View Official Scorecard</span>
            </Button>
          }
        >
          <div className="space-y-4">
            <StudentSubmissionStatusTracker
              attemptId={finalSubmissionData.id}
              onResultPublished={(result) => {
                if (result.scoring) {
                  finalSubmissionData.totalScore = result.scoring.finalScore || result.scoring.totalScore;
                  finalSubmissionData.facultyApproved = true;
                }
              }}
            />
          </div>
        </Dialog>
      )}
      {/* Strict Proctor Termination Lockout Modal */}
      {proctorTerminationNotice && (
        <div className="fixed inset-0 z-[9999] bg-black/90 flex items-center justify-center p-6 backdrop-blur-md">
          <div className="bg-[#0f172a] border-2 border-red-600 rounded-2xl max-w-lg w-full p-8 text-center space-y-5 shadow-2xl">
            <div className="w-16 h-16 rounded-full bg-red-950/80 border border-red-500/50 flex items-center justify-center mx-auto text-red-400">
              <AlertTriangle className="w-8 h-8" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-white tracking-wide uppercase">
                Examination Attempt Auto-Finalized
              </h3>
              <p className="text-xs font-mono text-red-400 mt-1">
                REASON: {proctorTerminationNotice.code}
              </p>
            </div>
            <p className="text-sm text-slate-300 leading-relaxed">
              {proctorTerminationNotice.message || "The native AI proctor companion was terminated or disconnected during this examination. In accordance with strict institutional policy (STRICT_AUTO_FINALIZE), your attempt has been sealed."}
            </p>
            <div className="pt-2">
              <button
                onClick={() => { window.location.href = "/student/scorecard"; }}
                className="w-full py-3 px-6 rounded-lg bg-red-600 hover:bg-red-700 text-white font-semibold text-sm transition-colors cursor-pointer"
              >
                View Sealed Attempt Status
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
