export interface Anchor { prefix: string; suffix: string }
export interface ReviewComment {
  id: string; line: number; endLine: number; highlightedText: string;
  comment: string; createdAt: string; resolved?: boolean; anchor?: Anchor;
  [key: string]: unknown;
}
export interface ReviewFile { version: 1; source: string; comments: ReviewComment[]; [key: string]: unknown }
export function storagePath(source: string): string {
  if (!source || source.startsWith('/') || source.includes('\\') || source.split('/').some(p => !p || p === '..' || p === '.')) throw new Error('Source must be a vault-relative path.');
  return `.comments/${source}.comments.json`;
}
function record(v: unknown): v is Record<string, unknown> { return !!v && typeof v === 'object' && !Array.isArray(v); }
export function parseReview(raw: string, source: string): ReviewFile {
  const f: unknown = JSON.parse(raw);
  if (!record(f) || f.version !== 1 || f.source !== source || !Array.isArray(f.comments)) throw new Error('Invalid review file or source mismatch. Original file was preserved.');
  const ids = new Set<string>();
  for (const c of f.comments) {
    if (!record(c) || typeof c.id !== 'string' || !c.id || ids.has(c.id)
      || !Number.isSafeInteger(c.line) || Number(c.line) < 1 || !Number.isSafeInteger(c.endLine) || Number(c.endLine) < Number(c.line)
      || typeof c.highlightedText !== 'string' || typeof c.comment !== 'string' || typeof c.createdAt !== 'string'
      || (c.resolved !== undefined && typeof c.resolved !== 'boolean')
      || (c.anchor !== undefined && (!record(c.anchor) || typeof c.anchor.prefix !== 'string' || typeof c.anchor.suffix !== 'string'))) throw new Error('Invalid or duplicate comment. Original file was preserved.');
    ids.add(c.id);
  }
  return f as unknown as ReviewFile;
}
export function setResolved(file: ReviewFile, id: string, resolved: boolean): ReviewFile {
  return changeComment(file,id,c => ({...c,resolved}));
}
export function changeComment(file: ReviewFile, id: string, fn: (c: ReviewComment) => ReviewComment): ReviewFile {
  if (!file.comments.some(c=>c.id===id)) throw new Error('Comment no longer exists. Refresh and try again.');
  return {...file, comments:file.comments.map(c=>c.id===id ? fn(c):c)};
}
export function createComment(quote: string, text: string, line: number, endLine: number, anchor: Anchor): ReviewComment {
  if (!quote.trim() || !text.trim()) throw new Error('A passage and comment are required.');
  return {id:crypto.randomUUID(),line,endLine,highlightedText:quote.trim(),comment:text.trim(),createdAt:new Date().toISOString(),resolved:false,anchor};
}
export type Match = {kind:'found';start:number;end:number} | {kind:'missing'|'ambiguous'};
export function normalize(text: string): string { return text.replace(/\s+/g,' '); }
export function findQuote(text: string, quote: string, anchor?: Anchor): Match {
  quote = normalize(quote).trim();
  if (!quote) return {kind:'missing'};
  const hits:number[]=[];
  for (let p=text.indexOf(quote);p!==-1;p=text.indexOf(quote,p+1)) hits.push(p);
  if (!hits.length) return {kind:'missing'};
  if (hits.length===1) return {kind:'found',start:hits[0],end:hits[0]+quote.length};
  if (anchor && (anchor.prefix || anchor.suffix)) {
    const contextHits=hits.filter(p=>(!anchor.prefix || text.slice(0,p).endsWith(normalize(anchor.prefix))) && (!anchor.suffix || text.slice(p+quote.length).startsWith(normalize(anchor.suffix))));
    if (contextHits.length===1) return {kind:'found',start:contextHits[0],end:contextHits[0]+quote.length};
  }
  return {kind:'ambiguous'};
}
export function reviewPrompt(sourcePath: string, commentsPath: string): string {
  return `Review and update the Markdown note at:\n${sourcePath}\n\nUse review comments from:\n${commentsPath}\n\nRead the latest JSON. Process only comments whose resolved field is not true, in stored order. Identify every comment by its stable id. Locate passages by highlightedText and context; line numbers are hints. Preserve unrelated Markdown.\n\nAfter each attempted comment, re-read the latest JSON, find that same id, and set resolved to true. Do this even when the attempt was unsuccessful, incomplete, incorrect, or could not be applied. Resolved means processed, not verified correct. Preserve all other comments, fields, and concurrent changes. Save status immediately after each attempt; leave unprocessed comments open if interrupted. Never delete comments.\n\nSummarize the outcome for each processed comment, including failures. Do not process already resolved comments. The user can reopen a comment for another attempt.\n`;
}
