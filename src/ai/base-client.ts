export interface ReviewComment {
  path: string;
  line: number;
  severity: 'critical' | 'warning' | 'suggestion';
  message: string;
}

export interface ReviewResult {
  summary: string;
  comments: ReviewComment[];
  /** Verdict the reviewer wants to submit. Defaults to COMMENT when omitted. */
  verdict?: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT';
}

/** An existing review thread on the PR — used so the AI can skip already-addressed issues. */
export interface ExistingThread {
  /** GraphQL node ID of the thread — used to call resolveReviewThread mutation. */
  threadNodeId: string;
  path: string;
  line: number | null;
  body: string;
  /** Whether the developer already resolved/dismissed this thread. */
  resolved: boolean;
}

/** High-level record of a previous bot review round. */
export interface PreviousReviewRound {
  round: number;
  submittedAt: string;
  verdict: string;
  summary: string;
}

export interface PRData {
  title: string;
  description: string;
  author: string;
  baseBranch: string;
  headBranch: string;

  // ── Review-round context ──────────────────────────────────────────────────
  /** 1 = first review, 2 = second (re-review after developer addressed feedback), etc. */
  reviewRound: number;
  /** All open (unresolved) threads from previous bot reviews. */
  openThreads: ExistingThread[];
  /** All threads that the developer has already resolved. */
  resolvedThreads: ExistingThread[];
  /** Summaries of previous bot review rounds. */
  previousReviews: PreviousReviewRound[];

  // ── Commit / issue context ────────────────────────────────────────────────
  commits?: Array<{
    sha: string;
    message: string;
    author: string;
    date: string;
  }>;
  
  linkedIssues?: Array<{
    number: number;
    title: string;
    body: string;
    labels: string[];
    state: string;
  }>;
  
  relatedFiles?: Array<{
    path: string;
    reason: string;
    content?: string;
  }>;
  
  affectedDependencies?: string[];
  
  files: Array<{
    filename: string;
    patch?: string;
    content?: string;
    status?: string;
  }>;
  
  stats?: {
    totalFiles: number;
    totalAdditions: number;
    totalDeletions: number;
  };
}

export interface PRDescriptionResult {
  description: string;
  metadata: {
    provider: string;
    generatedAt: string;
    confidence: {
      summary: 'high' | 'medium' | 'low';
      changes: 'high' | 'medium' | 'low';
      testing: 'high' | 'medium' | 'low';
    };
  };
}

export interface GitDiffSummary {
  totalFiles: number;
  totalAdditions: number;
  totalDeletions: number;
  files: Array<{
    path: string;
    additions: number;
    deletions: number;
    status: 'added' | 'modified' | 'deleted' | 'renamed';
  }>;
  modifiedFunctions?: Array<{
    file: string;
    name: string;
    type: 'function' | 'class' | 'method' | 'interface';
  }>;
  criticalChanges?: string[]; // First 50 lines of most important changes
}

export interface CommitMessageSuggestion {
  type: 'feat' | 'fix' | 'docs' | 'style' | 'refactor' | 'test' | 'chore' | 'perf' | 'ci' | 'build' | 'revert';
  scope?: string;
  subject: string;
  body?: string;
  breaking?: boolean;
  confidence: 'high' | 'medium' | 'low';
}

export interface CommitMessageResult {
  suggestions: CommitMessageSuggestion[];
  metadata: {
    provider: string;
    generatedAt: string;
    tokensUsed?: number;
  };
}

export interface AIClient {
  reviewPR(prData: PRData): Promise<ReviewResult>;
  generatePRDescription?(prData: PRData): Promise<PRDescriptionResult>;
  generateCommitMessage?(diffSummary: GitDiffSummary): Promise<CommitMessageResult>;
  healthCheck?(): Promise<boolean>;
}

/**
 * Infer a review verdict from comment severities when the AI omits the
 * `verdict` field (or returns an unrecognised value).
 *
 * Rules (mirrors the prompt instructions given to the AI):
 *   - Any critical comment  → REQUEST_CHANGES
 *   - Any warning comment   → COMMENT  (neutral, needs attention)
 *   - Only suggestions / no comments → APPROVE
 *
 * The explicit AI-supplied verdict always wins when it is present and valid,
 * so this function is only called as a fallback.
 */
export function inferVerdict(
  aiVerdict: string | undefined,
  comments: Array<{ severity?: string }>
): ReviewResult['verdict'] {
  const valid = new Set<string>(['APPROVE', 'REQUEST_CHANGES', 'COMMENT']);
  if (aiVerdict && valid.has(aiVerdict)) {
    return aiVerdict as ReviewResult['verdict'];
  }
  // AI omitted or returned an unrecognised verdict — derive it from comments.
  const hasCritical = comments.some((c) => c.severity === 'critical');
  const hasWarning  = comments.some((c) => c.severity === 'warning');
  return hasCritical ? 'REQUEST_CHANGES'
       : hasWarning  ? 'COMMENT'
       :               'APPROVE';
}
