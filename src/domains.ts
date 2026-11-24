import rules from './legacy-domains.json' with { type: 'json' };

// This is intentionally the OLD rule set and matching order, including its quirks.
// Updating a public suffix list can change the input to the password hash.
interface Rule { first: string; second: string; wildcard: boolean; exception: boolean }
const normal = (r: Rule) => (r.second ? '.' + r.second : '') + '.' + r.first;
const pattern = (r: Rule) => (r.second ? '\\.' + r.second : '') + '\\.' + r.first;
export function legacyDomain(host: string): string | null {
  if (!host.includes('.') || host.startsWith('.')) return null;
  host = host.trim().toLowerCase();
  const first = host.split('.').pop()!;
  const source = (rules as Record<string, string>)[first];
  const base: Rule = { first, second: '', wildcard: false, exception: false };
  let candidates: Rule[] = [base];
  if (source) {
    let append = true;
    candidates = source.split('|').map(second => {
      const exception = second[0] === '!';
      const wildcard = second[0] === '*';
      if (exception || wildcard) { second = second.slice(1); if (!second) append = false; }
      return { first, second, exception, wildcard };
    });
    if (append) candidates.unshift(base);
    candidates.reverse();
  }
  let selected: Rule | null = null;
  let exception: Rule | null = null;
  for (const r of candidates) {
    if ('.' + host === normal(r)) { if (r.exception) selected = r; break; }
    if (new RegExp('.+' + pattern(r) + '$').test(host)) {
      if (r.exception) exception = r;
      else { selected = r; break; }
    }
  }
  if (!selected) return null;
  if (exception) selected = { ...selected, wildcard: exception.wildcard };
  const suffix = selected.exception ? (selected.second || '') + '\\.' + selected.first :
    '[^\\.]+' + (selected.wildcard ? '\\.[^\\.]+' + normal(selected).replace(/\./g, '\\.') : pattern(selected));
  return host.match(new RegExp('(' + suffix + ')$'))?.[1] ?? null;
}

export function domainInfo(url: string): { hostname: string; domain: string } {
  const parsed = new URL(url);
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Open an HTTP or HTTPS website to fill a password.');
  const hostname = parsed.hostname.toLowerCase();
  // Original threw on localhost / bare suffixes. Make those usable with an explicit hostname.
  return { hostname, domain: legacyDomain(hostname) ?? hostname };
}
