/**
 * A deliberately tiny syntax highlighter for the landing page's four code
 * panes.
 *
 * VitePress highlights fenced code blocks in MARKDOWN at build time; a string
 * living inside a Vue component gets none of that. Pulling Shiki into the
 * client bundle to colour four hand-written snippets would cost more than the
 * whole page. These snippets are fixed, authored here, and never
 * user-supplied, so a token pass over an HTML-escaped string is enough.
 *
 * Input is escaped FIRST, so nothing in a snippet can inject markup.
 */
const KEYWORDS =
  /\b(import|from|export|function|const|let|return|type|interface|new|as|default|script|setup|lang)\b/g;

function escapeHtml(src: string): string {
  return src
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function highlight(src: string): string {
  const escaped = escapeHtml(src);
  const out: string[] = [];
  // One pass over comments and strings; everything else is scanned after, so a
  // keyword inside a string is never re-tokenised.
  const spans = /(\/\/[^\n]*)|(&quot;[^&\n]*&quot;|'[^'\n]*'|`[^`]*`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = spans.exec(escaped)) !== null) {
    out.push(rest(escaped.slice(last, m.index)));
    out.push(
      m[1]
        ? `<span class="cc-tok-c">${m[1]}</span>`
        : `<span class="cc-tok-s">${m[2]}</span>`,
    );
    last = m.index + m[0].length;
  }
  out.push(rest(escaped.slice(last)));
  return out.join('');
}

function rest(chunk: string): string {
  return chunk
    .replace(KEYWORDS, '<span class="cc-tok-k">$1</span>')
    .replace(/\b(\d+(?:\.\d+)?)\b/g, '<span class="cc-tok-n">$1</span>');
}
