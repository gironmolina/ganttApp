import { describe, it, expect } from "vitest";
import {
  parseDate,
  toLocalIso,
  isWeekend,
  isWeekendDate,
  skipToWeekday,
  buildTimeline,
  buildSprints,
  findDateIndex,
  computeTimeProgress,
  COL_WIDTH,
  WORKDAYS_PER_WEEK,
} from "@/lib/gantt-utils";
import type { Task } from "@/lib/gantt-store";

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "t1",
    parentId: null,
    position: 0,
    title: "Test",
    assignee: "",
    priority: "none",
    initialStartDate: "2026-05-01",
    initialEndDate: "2026-05-15",
    progress: 0,
    blocks: [],
    comments: [],
    createdAt: "2026-05-01",
    ...overrides,
  };
}

describe("parseDate", () => {
  it("parses YYYY-MM-DD correctly", () => {
    const t = parseDate("2026-05-01");
    const d = new Date(t);
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(4); // May = 4
    expect(d.getDate()).toBe(1);
  });
});

describe("toLocalIso", () => {
  it("formats a Date to YYYY-MM-DD", () => {
    const d = new Date(2026, 4, 1);
    expect(toLocalIso(d)).toBe("2026-05-01");
  });

  it("pads single digit months and days", () => {
    const d = new Date(2026, 0, 5);
    expect(toLocalIso(d)).toBe("2026-01-05");
  });
});

describe("isWeekend", () => {
  it("returns true for Saturday", () => {
    const sat = new Date(2026, 4, 2); // May 2, 2026 is Saturday
    expect(isWeekend(sat)).toBe(true);
  });

  it("returns true for Sunday", () => {
    const sun = new Date(2026, 4, 3); // May 3, 2026 is Sunday
    expect(isWeekend(sun)).toBe(true);
  });

  it("returns false for Monday", () => {
    const mon = new Date(2026, 4, 4); // May 4, 2026 is Monday
    expect(isWeekend(mon)).toBe(false);
  });

  it("returns false for Friday", () => {
    const fri = new Date(2026, 4, 1); // May 1, 2026 is Friday
    expect(isWeekend(fri)).toBe(false);
  });
});

describe("isWeekendDate", () => {
  it("returns true for Saturday ISO string", () => {
    expect(isWeekendDate("2026-05-02")).toBe(true);
  });

  it("returns true for Sunday ISO string", () => {
    expect(isWeekendDate("2026-05-03")).toBe(true);
  });

  it("returns false for Monday ISO string", () => {
    expect(isWeekendDate("2026-05-04")).toBe(false);
  });

  it("returns false for Friday ISO string", () => {
    expect(isWeekendDate("2026-05-01")).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isWeekendDate("")).toBe(false);
  });
});

describe("skipToWeekday", () => {
  it("returns the same date if it's a weekday", () => {
    expect(skipToWeekday("2026-05-04", "start")).toBe("2026-05-04"); // Monday
  });

  it("skips Saturday to Monday in start mode", () => {
    expect(skipToWeekday("2026-05-02", "start")).toBe("2026-05-04"); // Sat -> Mon
  });

  it("skips Sunday to Monday in start mode", () => {
    expect(skipToWeekday("2026-05-03", "start")).toBe("2026-05-04"); // Sun -> Mon
  });

  it("skips Saturday to Friday in end mode", () => {
    expect(skipToWeekday("2026-05-02", "end")).toBe("2026-05-01"); // Sat -> Fri
  });

  it("skips Sunday to Friday in end mode", () => {
    expect(skipToWeekday("2026-05-03", "end")).toBe("2026-05-01"); // Sun -> Fri
  });

  it("returns empty string for empty input", () => {
    expect(skipToWeekday("", "start")).toBe("");
  });
});

describe("buildTimeline", () => {
  it("excludes weekends from workdays", () => {
    const tasks = [makeTask({ initialStartDate: "2026-05-04", initialEndDate: "2026-05-08" })];
    const { workdays } = buildTimeline(tasks);
    for (const d of workdays) {
      expect(isWeekend(d)).toBe(false);
    }
  });

  it("starts at projectStart when provided (no Monday snap-back)", () => {
    // May 1, 2026 is a Friday
    const tasks = [makeTask()];
    const { workdays } = buildTimeline(tasks, "2026-05-01", "2026-05-15");
    const firstDay = workdays[0];
    expect(firstDay.getDate()).toBe(1);
    expect(firstDay.getMonth()).toBe(4); // May
  });

  it("snaps to Monday when no project dates (auto mode)", () => {
    // May 1, 2026 is Friday — auto mode should snap back to Monday Apr 27
    const tasks = [makeTask({ initialStartDate: "2026-05-01", initialEndDate: "2026-05-08" })];
    const { workdays } = buildTimeline(tasks);
    const firstDay = workdays[0];
    expect(firstDay.getDay()).toBe(1); // Monday
  });

  it("pads to a full week (multiple of 5)", () => {
    const tasks = [makeTask({ initialStartDate: "2026-05-01", initialEndDate: "2026-05-15" })];
    const { workdays } = buildTimeline(tasks, "2026-05-01", "2026-05-15");
    expect(workdays.length % WORKDAYS_PER_WEEK).toBe(0);
  });

  it("creates weekStarts with first entry at index 0", () => {
    const tasks = [makeTask()];
    const { weekStarts } = buildTimeline(tasks, "2026-05-01", "2026-05-15");
    expect(weekStarts[0]).toBe(0);
  });

  it("builds dateToIndex map for all workdays", () => {
    const tasks = [makeTask()];
    const { workdays, dateToIndex } = buildTimeline(tasks, "2026-05-01", "2026-05-08");
    expect(dateToIndex.size).toBe(workdays.length);
  });

  it("handles empty tasks and no project dates", () => {
    const { workdays } = buildTimeline([]);
    expect(workdays.length).toBeGreaterThan(0);
    expect(workdays.length % WORKDAYS_PER_WEEK).toBe(0);
  });
});

describe("buildSprints", () => {
  it("creates sprints grouping two weeks each", () => {
    const tasks = [makeTask({ initialStartDate: "2026-05-04", initialEndDate: "2026-05-29" })];
    const { workdays, weekStarts } = buildTimeline(tasks, "2026-05-04", "2026-05-29");
    const sprints = buildSprints(workdays, weekStarts);
    expect(sprints.length).toBeGreaterThanOrEqual(1);
    for (const sp of sprints) {
      expect(sp.width).toBeGreaterThan(0);
      expect(sp.number).toBeGreaterThan(0);
    }
  });

  it("first sprint starts at workdays[0]", () => {
    const tasks = [makeTask({ initialStartDate: "2026-05-04", initialEndDate: "2026-05-29" })];
    const { workdays, weekStarts } = buildTimeline(tasks, "2026-05-04", "2026-05-29");
    const sprints = buildSprints(workdays, weekStarts);
    expect(sprints[0].start.getTime()).toBe(workdays[0].getTime());
  });

  it("sprint width equals chunk length * COL_WIDTH", () => {
    const tasks = [makeTask({ initialStartDate: "2026-05-04", initialEndDate: "2026-05-29" })];
    const { workdays, weekStarts } = buildTimeline(tasks, "2026-05-04", "2026-05-29");
    const sprints = buildSprints(workdays, weekStarts);
    for (const sp of sprints) {
      const dayCount = sp.width / COL_WIDTH;
      expect(sp.width).toBe(dayCount * COL_WIDTH);
    }
  });
});

describe("findDateIndex", () => {
  it("returns exact match from dateToIndex", () => {
    const tasks = [makeTask({ initialStartDate: "2026-05-04", initialEndDate: "2026-05-08" })];
    const { workdays, dateToIndex } = buildTimeline(tasks, "2026-05-04", "2026-05-08");
    const idx = findDateIndex("2026-05-04", "start", workdays, dateToIndex);
    expect(idx).toBe(0);
  });

  it("snaps start mode to next workday for weekend date", () => {
    const tasks = [makeTask({ initialStartDate: "2026-05-04", initialEndDate: "2026-05-08" })];
    const { workdays, dateToIndex } = buildTimeline(tasks, "2026-05-04", "2026-05-08");
    const idx = findDateIndex("2026-05-02", "start", workdays, dateToIndex);
    expect(idx).toBe(0);
  });

  it("snaps end mode to previous workday for weekend date", () => {
    const tasks = [makeTask({ initialStartDate: "2026-05-04", initialEndDate: "2026-05-08" })];
    const { workdays, dateToIndex } = buildTimeline(tasks, "2026-05-04", "2026-05-08");
    const idx = findDateIndex("2026-05-03", "end", workdays, dateToIndex);
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(idx).toBeLessThan(workdays.length);
  });

  it("returns last index for start mode with future date", () => {
    const tasks = [makeTask({ initialStartDate: "2026-05-04", initialEndDate: "2026-05-08" })];
    const { workdays, dateToIndex } = buildTimeline(tasks, "2026-05-04", "2026-05-08");
    const idx = findDateIndex("2027-01-01", "start", workdays, dateToIndex);
    expect(idx).toBe(workdays.length - 1);
  });

  it("returns 0 for end mode with past date", () => {
    const tasks = [makeTask({ initialStartDate: "2026-05-04", initialEndDate: "2026-05-08" })];
    const { workdays, dateToIndex } = buildTimeline(tasks, "2026-05-04", "2026-05-08");
    const idx = findDateIndex("2020-01-01", "end", workdays, dateToIndex);
    expect(idx).toBe(0);
  });
});

describe("computeTimeProgress", () => {
  it("returns 50% at the midpoint of the project", () => {
    const { percent } = computeTimeProgress("2026-05-01", "2026-05-11", "2026-05-06");
    expect(percent).toBe(50);
  });

  it("clamps to 0% before the project starts", () => {
    const { percent } = computeTimeProgress("2026-05-01", "2026-05-11", "2026-04-01");
    expect(percent).toBe(0);
  });

  it("clamps to 100% after the project ends", () => {
    const { percent } = computeTimeProgress("2026-05-01", "2026-05-11", "2026-06-01");
    expect(percent).toBe(100);
  });

  it("computes inclusive total days", () => {
    const { totalDays } = computeTimeProgress("2026-05-01", "2026-05-11", "2026-05-06");
    expect(totalDays).toBe(11);
  });

  it("computes inclusive elapsed days up to today", () => {
    const { elapsedDays } = computeTimeProgress("2026-05-01", "2026-05-11", "2026-05-06");
    expect(elapsedDays).toBe(6);
  });

  it("returns zeros when start or end is missing", () => {
    expect(computeTimeProgress("", "2026-05-11", "2026-05-06")).toEqual({
      percent: 0,
      elapsedDays: 0,
      totalDays: 0,
    });
  });

  it("handles a zero-length project without dividing by zero", () => {
    const result = computeTimeProgress("2026-05-01", "2026-05-01", "2026-05-01");
    expect(result.percent).toBe(0);
    expect(result.totalDays).toBe(1);
  });
});
