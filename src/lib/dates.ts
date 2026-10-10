// Weeks start on Monday — trading weeks open Sunday night/Monday, and reviews
// are written at the weekend.

export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function startOfWeek(d: Date): Date {
  const x = startOfDay(d);
  const dow = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - dow);
  return x;
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function ymd(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export interface Period {
  label: string;
  from: string;
  to: string;
}

export function parsePeriod(text: string, now: Date): Period | undefined {
  const q = text.toLowerCase();
  const today = startOfDay(now);
  const iso = (d: Date) => d.toISOString();

  if (/\btoday\b/.test(q)) return { label: 'today', from: iso(today), to: iso(addDays(today, 1)) };
  if (/\byesterday\b/.test(q))
    return { label: 'yesterday', from: iso(addDays(today, -1)), to: iso(today) };
  if (/\bthis week\b/.test(q)) {
    const s = startOfWeek(now);
    return { label: 'this week', from: iso(s), to: iso(addDays(s, 7)) };
  }
  if (/\blast week\b/.test(q)) {
    const s = addDays(startOfWeek(now), -7);
    return { label: 'last week', from: iso(s), to: iso(addDays(s, 7)) };
  }
  if (/\bthis month\b/.test(q)) {
    const s = new Date(now.getFullYear(), now.getMonth(), 1);
    return { label: 'this month', from: iso(s), to: iso(new Date(now.getFullYear(), now.getMonth() + 1, 1)) };
  }
  if (/\blast month\b/.test(q)) {
    const s = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return { label: 'last month', from: iso(s), to: iso(new Date(now.getFullYear(), now.getMonth(), 1)) };
  }
  if (/\bthis year\b/.test(q)) {
    const s = new Date(now.getFullYear(), 0, 1);
    return { label: 'this year', from: iso(s), to: iso(new Date(now.getFullYear() + 1, 0, 1)) };
  }
  const n = q.match(/\b(?:last|past)\s+(\d{1,3})\s+days?\b/);
  if (n) {
    const days = parseInt(n[1], 10);
    return { label: `the last ${days} days`, from: iso(addDays(today, -days + 1)), to: iso(addDays(today, 1)) };
  }
  return undefined;
}
