export interface ReviewComment {
  path: string;
  line: number;
  severity: 'critical' | 'warning' | 'suggestion';
  message: string;
}

export interface ReviewResult {
  summary: string;
  comments: ReviewComment[];
}

export interface PRData {
  title: string;
  description: string;
  author: string;
  baseBranch: string;
  headBranch: string;
  
  // Enhanced context
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
