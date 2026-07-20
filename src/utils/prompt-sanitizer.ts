/**
 * Prompt injection defence.
 *
 * Every piece of user-controlled content that lands in an AI prompt goes
 * through sanitizeUserContent() before interpolation.  The goal is NOT
 * to produce perfectly "safe" text — LLM prompt injection is fundamentally
 * an unsolved problem — but to remove the cheap/obvious attack vectors:
 *
 *  1. HTML comments (<!-- ... -->) — can hide instructions that the UI hides
 *     from humans but the model still processes.
 *  2. Common injection trigger phrases ("ignore all previous instructions",
 *     "always return", system-role markers, etc.).
 *  3. Hard length caps so an attacker cannot drown out the instruction context
 *     with a wall of adversarial text.
 *
 * None of these measures make the system bullet-proof; they raise the bar
 * significantly for opportunistic injection attempts.
 */

/** Maximum character length allowed per user-supplied field. */
const MAX_DESCRIPTION_LEN = 1000;
const MAX_COMMIT_MSG_LEN  = 200;
const MAX_ISSUE_BODY_LEN  = 400;
const MAX_THREAD_BODY_LEN = 250;
const MAX_SUMMARY_LEN     = 600;

/**
 * Injection trigger phrases to strip from user content.
 * Matched case-insensitively; the entire surrounding sentence is NOT removed —
 * only the trigger phrase itself — to preserve legitimate surrounding text.
 */
const INJECTION_PATTERNS: RegExp[] = [
  /ignore\s+(all\s+)?(previous|prior|above)\s+instructions?/gi,
  /disregard\s+(all\s+)?(previous|prior|above)\s+instructions?/gi,
  /forget\s+(all\s+)?(previous|prior|above)\s+instructions?/gi,
  /you\s+are\s+now\s+[\w\s]+assistant/gi,
  /act\s+as\s+(a\s+)?(?:different|new|unrestricted)/gi,
  /always\s+return\s+verdict\s*:\s*(?:approve|request_changes)/gi,
  /set\s+verdict\s+to\s+(?:approve|request_changes)/gi,
  /\[SYSTEM\]/gi,
  /\[INST\]/gi,
  /<\|system\|>/gi,
  /<\|user\|>/gi,
  /<\|assistant\|>/gi,
];

/**
 * Strip HTML comments from a string.
 * These are invisible in rendered Markdown / GitHub UI but are processed
 * verbatim by AI models, making them a cheap injection vector.
 */
function stripHtmlComments(text: string): string {
  return text.replace(/<!--[\s\S]*?-->/g, '');
}

/**
 * Remove known injection trigger phrases from a string.
 */
function stripInjectionPhrases(text: string): string {
  let result = text;
  for (const pattern of INJECTION_PATTERNS) {
    result = result.replace(pattern, '[redacted]');
  }
  return result;
}

/**
 * Full sanitization pipeline for any user-controlled text field.
 * 1. Strip HTML comments
 * 2. Strip injection phrases
 * 3. Truncate to the specified max length
 */
function sanitize(text: string, maxLen: number): string {
  if (!text) return '';
  const stripped = stripInjectionPhrases(stripHtmlComments(text));
  return stripped.length > maxLen
    ? stripped.slice(0, maxLen) + '… [truncated]'
    : stripped;
}

// ── Public API ────────────────────────────────────────────────────────────────

export function sanitizeDescription(text: string): string {
  return sanitize(text, MAX_DESCRIPTION_LEN);
}

export function sanitizeCommitMessage(text: string): string {
  return sanitize(text, MAX_COMMIT_MSG_LEN);
}

export function sanitizeIssueBody(text: string): string {
  return sanitize(text, MAX_ISSUE_BODY_LEN);
}

/**
 * Sanitize an existing thread body before it appears in a prompt.
 * The HTML-comment stripping here is the fix for the "hidden instruction"
 * attack: comments were only stripped for display (in .slice().replace()),
 * but the raw body was still interpolated into the prompt.
 */
export function sanitizeThreadBody(text: string): string {
  return sanitize(text, MAX_THREAD_BODY_LEN);
}

export function sanitizeSummary(text: string): string {
  return sanitize(text, MAX_SUMMARY_LEN);
}

/**
 * Sanitize a PR title (short, but still user-controlled).
 */
export function sanitizeTitle(text: string): string {
  return sanitize(text, 200);
}

/**
 * Sanitize a branch or author name (very short, should not contain prose).
 */
export function sanitizeIdentifier(text: string): string {
  // For identifiers (branch names, author logins) we only allow safe chars.
  // Anything outside [a-zA-Z0-9._\-/ ] is replaced with _.
  return text.replace(/[^a-zA-Z0-9._\-/ ]/g, '_').slice(0, 100);
}
