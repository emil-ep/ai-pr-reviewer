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
  files: Array<{
    filename: string;
    patch?: string;
    content?: string;
  }>;
}

export interface AIClient {
  reviewPR(prData: PRData): Promise<ReviewResult>;
  healthCheck?(): Promise<boolean>;
}
