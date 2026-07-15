import type { Task } from "@/lib/gantt-store";

export const DAY_MS = 86400000;
export const COL_WIDTH = 40;
export const ROW_HEIGHT = 40;
export const WORKDAYS_PER_WEEK = 5;

export function parseDate(s: string) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d).getTime();
}

export function toLocalIso(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function isWeekend(d: Date) {
  const g = d.getDay();
  return g === 0 || g === 6;
}

export function fmtShort(d: Date) {
  return d.toLocaleDateString("es", { day: "2-digit", month: "short" });
}

export function isWeekendDate(iso: string): boolean {
  if (!iso) return false;
  const [y, m, d] = iso.split("-").map(Number);
  const day = new Date(y, m - 1, d).getDay();
  return day === 0 || day === 6;
}

export function skipToWeekday(iso: string, mode: "start" | "end"): string {
  if (!iso || !isWeekendDate(iso)) return iso;
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  if (mode === "start") {
    while (isWeekend(dt)) dt.setDate(dt.getDate() + 1);
  } else {
    while (isWeekend(dt)) dt.setDate(dt.getDate() - 1);
  }
  return toLocalIso(dt);
}

export interface TimelineResult {
  workdays: Date[];
  dateToIndex: Map<string, number>;
  weekStarts: number[];
}

export function buildTimeline(
  tasks: Task[],
  projectStart?: string,
  projectEnd?: string,
): TimelineResult {
  let mn: number;
  let mx: number;
  if (projectStart && projectEnd) {
    mn = parseDate(projectStart);
    mx = parseDate(projectEnd);
  } else if (tasks.length === 0) {
    mn = Date.now();
    mx = mn + DAY_MS * 20;
  } else {
    mn = Infinity;
    mx = -Infinity;
    for (const t of tasks) {
      if (t.initialStartDate) mn = Math.min(mn, parseDate(t.initialStartDate));
      if (t.initialEndDate) mx = Math.max(mx, parseDate(t.initialEndDate));
      if (t.estimatedStartDate) mn = Math.min(mn, parseDate(t.estimatedStartDate));
      if (t.estimatedEndDate) mx = Math.max(mx, parseDate(t.estimatedEndDate));
      if (t.actualStartDate) mn = Math.min(mn, parseDate(t.actualStartDate));
      if (t.actualEndDate) mx = Math.max(mx, parseDate(t.actualEndDate));
    }
    mn -= DAY_MS * 3;
    mx += DAY_MS * 5;
  }
  // Snap mn back to the previous Monday (only when no explicit project dates)
  if (!projectStart || !projectEnd) {
    const d = new Date(mn);
    const dow = d.getDay();
    const offset = dow === 0 ? 6 : dow - 1;
    d.setDate(d.getDate() - offset);
    mn = d.getTime();
  }
  const days: Date[] = [];
  const map = new Map<string, number>();
  const weekIdxs: number[] = [];
  const totalDays = Math.round((mx - mn) / DAY_MS) + 1;
  for (let i = 0; i < totalDays; i++) {
    const d = new Date(mn + i * DAY_MS);
    if (!isWeekend(d)) {
      if (d.getDay() === 1 || days.length === 0) weekIdxs.push(days.length);
      map.set(toLocalIso(d), days.length);
      days.push(d);
    }
  }
  // Pad to a full week
  while (days.length % WORKDAYS_PER_WEEK !== 0) {
    const last = days[days.length - 1];
    const next = new Date(last.getTime());
    do {
      next.setDate(next.getDate() + 1);
    } while (isWeekend(next));
    map.set(toLocalIso(next), days.length);
    days.push(new Date(next.getTime()));
  }
  return { workdays: days, dateToIndex: map, weekStarts: weekIdxs };
}

export interface Sprint {
  number: number;
  start: Date;
  end: Date;
  width: number;
  left: number;
}

export function buildSprints(workdays: Date[], weekStarts: number[]): Sprint[] {
  const s: Sprint[] = [];
  for (let w = 0; w < weekStarts.length; w += 2) {
    const weekIdx1 = weekStarts[w];
    const weekIdx2 =
      w + 1 < weekStarts.length ? weekStarts[w + 1] : weekStarts[w] + WORKDAYS_PER_WEEK;
    const endIdx = weekIdx2 + WORKDAYS_PER_WEEK;
    const chunk = workdays.slice(weekIdx1, Math.min(endIdx, workdays.length));
    if (chunk.length === 0) continue;
    s.push({
      number: s.length + 1,
      start: chunk[0],
      end: chunk[chunk.length - 1],
      width: chunk.length * COL_WIDTH,
      left: weekIdx1 * COL_WIDTH,
    });
  }
  return s;
}

export function countWorkdays(fromIso: string, toIso: string): number {
  const from = parseDate(fromIso);
  const to = parseDate(toIso);
  if (to < from) return 0;
  let count = 0;
  const d = new Date(from);
  while (d.getTime() <= to) {
    if (!isWeekend(d)) count++;
    d.setDate(d.getDate() + 1);
  }
  return Math.max(1, count);
}

export function computeProgress(task: Task): number {
  return task.progress;
}

export function findDateIndex(
  iso: string,
  mode: "start" | "end",
  workdays: Date[],
  dateToIndex: Map<string, number>,
): number {
  if (dateToIndex.has(iso)) return dateToIndex.get(iso)!;
  const t = parseDate(iso);
  if (mode === "start") {
    for (let i = 0; i < workdays.length; i++) {
      if (workdays[i].getTime() >= t) return i;
    }
    return workdays.length - 1;
  } else {
    for (let i = workdays.length - 1; i >= 0; i--) {
      if (workdays[i].getTime() <= t) return i;
    }
    return 0;
  }
}
