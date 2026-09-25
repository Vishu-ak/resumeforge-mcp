/** Text helpers shared by JD analysis, gap analysis and scoring. */

export function normalizeWhitespace(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/ /g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Split into lines, stripping bullet glyphs. Empty lines are dropped. */
export function toLines(text: string): string[] {
  return normalizeWhitespace(text)
    .split("\n")
    .map((l) => l.replace(/^\s*([-*•●▪◦·>]|\d+[.)])\s+/, "").trim())
    .filter(Boolean);
}

export function sentences(text: string): string[] {
  return toLines(text)
    .flatMap((l) => l.split(/(?<=[.!?])\s+(?=[A-Z])/))
    .map((s) => s.trim())
    .filter((s) => s.length > 2);
}

export function unique<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}

export function wordCount(text: string): number {
  return (text.match(/\b[\w'+#.-]+\b/g) ?? []).length;
}

const STOPWORDS = new Set(
  (
    "a an and are as at be been but by for from has have in into is it its of on or our " +
    "that the their them they this to was we were will with you your who what when where which " +
    "while would should could can may must able about across after all also any both each etc " +
    "such than then there these those through under up using use used via within work working " +
    "role team teams company job position candidate candidates ideal strong experience " +
    "years year including include includes new well other more most plus preferred required " +
    "requirements responsibilities qualifications skills skill ability knowledge understanding " +
    "looking join help build building make ensure support drive own day like just based " +
    "best great good high level highly key global world class across within one two three"
  ).split(/\s+/),
);

export function isStopword(w: string): boolean {
  return STOPWORDS.has(w.toLowerCase());
}

/**
 * Extract salient n-grams (1-3 words) that are not stopwords, ranked by frequency.
 * Used to catch domain terms not present in the skill taxonomy
 * (e.g. "payments", "ad tech", "clinical trials").
 */
export function salientPhrases(text: string, max = 25): { phrase: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const line of toLines(text)) {
    const words = line
      .toLowerCase()
      .replace(/[^a-z0-9+#./\s-]/g, " ")
      .split(/\s+/)
      .map((w) => w.replace(/^[.-]+|[.-]+$/g, ""))
      .filter(Boolean);
    for (let n = 1; n <= 3; n++) {
      for (let i = 0; i + n <= words.length; i++) {
        const gram = words.slice(i, i + n);
        if (isStopword(gram[0]) || isStopword(gram[gram.length - 1])) continue;
        if (gram.some((w) => w.length < 2 || /^\d+$/.test(w))) continue;
        const key = gram.join(" ");
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
  }
  return [...counts.entries()]
    .filter(([p, c]) => c >= 2 || p.includes(" "))
    .filter(([, c]) => c >= 2)
    .sort((a, b) => b[1] - a[1] || b[0].split(" ").length - a[0].split(" ").length)
    .slice(0, max)
    .map(([phrase, count]) => ({ phrase, count }));
}
