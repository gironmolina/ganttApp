import { describe, it, expect, vi, beforeEach } from "vitest";
import { store, getTasks, _resetForTesting, type Task } from "../gantt-store";

vi.mock("../json-persist", () => ({
  getProjectData: vi.fn().mockResolvedValue(null),
  mergeProjectData: vi.fn().mockResolvedValue({ ok: true }),
}));

describe("gantt-store", () => {
  beforeEach(() => {
    localStorage.clear();
    _resetForTesting();
  });

  describe("store.add", () => {
    it("creates a top-level task with defaults", () => {
      const t = store.add({ title: "Nueva tarea" });
      expect(t.title).toBe("Nueva tarea");
      expect(t.parentId).toBeNull();
      expect(t.progress).toBe(0);
      expect(t.block).toBe("none");
      expect(t.comments).toEqual([]);
      expect(t.id).toBeTruthy();
    });

    it("creates a subtask without dates by default", () => {
      const parent = store.add({ title: "Parent", initialStartDate: "2026-03-01" });
      const child = store.add({ title: "Child", parentId: parent.id });
      expect(child.parentId).toBe(parent.id);
      expect(child.initialStartDate).toBeUndefined();
      expect(child.initialEndDate).toBeUndefined();
    });

    it("clamps subtask endDate to startDate if earlier", () => {
      const child = store.add({
        title: "Child",
        initialStartDate: "2026-03-01",
        initialEndDate: "2026-01-15",
      });
      expect(child.initialStartDate).toBe("2026-03-01");
      expect(child.initialEndDate).toBe("2026-03-01");
    });

    it("accepts custom fields", () => {
      const t = store.add({
        title: "Custom",
        assignee: "John",
        progress: 50,
        block: "partial",
        blockReason: "Waiting",
      });
      expect(t.assignee).toBe("John");
      expect(t.progress).toBe(50);
      expect(t.block).toBe("partial");
      expect(t.blockReason).toBe("Waiting");
    });
  });

  describe("store.update", () => {
    it("updates a task field", () => {
      const t = store.add({ title: "Task" });
      store.update(t.id, { progress: 80 });
      const updated = getTasks().find((x) => x.id === t.id)!;
      expect(updated.progress).toBe(80);
    });

    it("clamps subtask initialStartDate to parent initialStartDate", () => {
      const parent = store.add({ title: "Parent", initialStartDate: "2026-03-01" });
      const child = store.add({ title: "Child", parentId: parent.id });
      store.update(child.id, { initialStartDate: "2026-01-01" });
      const updated = getTasks().find((x) => x.id === child.id)!;
      expect(updated.initialStartDate).toBe("2026-03-01");
    });

    it("pushes subtasks forward when parent initialStartDate moves later", () => {
      const parent = store.add({
        title: "Parent",
        initialStartDate: "2026-01-01",
        initialEndDate: "2026-01-10",
      });
      const child = store.add({
        title: "Child",
        parentId: parent.id,
        initialStartDate: "2026-01-01",
        initialEndDate: "2026-01-05",
      });
      store.update(parent.id, { initialStartDate: "2026-02-01" });
      const updatedChild = getTasks().find((x) => x.id === child.id)!;
      expect(updatedChild.initialStartDate).toBe("2026-02-01");
    });

    it("does nothing for non-existent id", () => {
      store.update("nonexistent", { progress: 50 });
    });
  });

  describe("store.remove", () => {
    it("removes a task", () => {
      const t = store.add({ title: "To remove" });
      store.remove(t.id);
      expect(getTasks().find((x) => x.id === t.id)).toBeUndefined();
    });

    it("removes cascading subtasks", () => {
      const parent = store.add({ title: "Parent" });
      const child = store.add({ title: "Child", parentId: parent.id });
      const grandchild = store.add({ title: "Grandchild", parentId: child.id });
      store.remove(parent.id);
      expect(getTasks().find((x) => x.id === parent.id)).toBeUndefined();
      expect(getTasks().find((x) => x.id === child.id)).toBeUndefined();
      expect(getTasks().find((x) => x.id === grandchild.id)).toBeUndefined();
    });
  });

  describe("store.addComment", () => {
    it("adds a comment to a task", () => {
      const t = store.add({ title: "Task" });
      store.addComment(t.id, "Ana", "Looks good");
      const updated = getTasks().find((x) => x.id === t.id)!;
      expect(updated.comments).toHaveLength(1);
      expect(updated.comments[0].author).toBe("Ana");
      expect(updated.comments[0].text).toBe("Looks good");
      expect(updated.comments[0].id).toBeTruthy();
      expect(updated.comments[0].createdAt).toBeTruthy();
    });

    it("does not affect other tasks", () => {
      const t1 = store.add({ title: "Task 1" });
      const t2 = store.add({ title: "Task 2" });
      store.addComment(t1.id, "Ana", "Comment on t1");
      const t2Updated = getTasks().find((x) => x.id === t2.id)!;
      expect(t2Updated.comments).toHaveLength(0);
    });
  });
});
