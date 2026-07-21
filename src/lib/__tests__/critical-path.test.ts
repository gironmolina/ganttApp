import { describe, it, expect } from "vitest";
import type { Task, Dependency } from "@/lib/gantt-store";
import {
  validateDependency,
  computeSchedule,
  taskDuration,
  isDependencyDateValid,
  findDependenciesBrokenByEdit,
} from "@/lib/critical-path";

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "t1",
    parentId: null,
    position: 0,
    title: "Test",
    assignee: "",
    priority: "none",
    initialStartDate: "2026-05-04", // lunes
    initialEndDate: "2026-05-08", // viernes (5 días hábiles)
    progress: 0,
    blocks: [],
    dependencies: [],
    comments: [],
    createdAt: "2026-05-04",
    ...overrides,
  };
}

function dep(predecessorId: string, type: Dependency["type"] = "FS"): Dependency {
  return { id: `d-${predecessorId}`, predecessorId, type };
}

describe("taskDuration", () => {
  it("cuenta días hábiles usando estimada con fallback a inicial", () => {
    expect(taskDuration(makeTask())).toBe(5);
    expect(
      taskDuration(makeTask({ estimatedStartDate: "2026-05-04", estimatedEndDate: "2026-05-05" })),
    ).toBe(2);
  });
  it("devuelve 0 sin fechas", () => {
    expect(taskDuration(makeTask({ initialStartDate: undefined, initialEndDate: undefined }))).toBe(
      0,
    );
  });
});

describe("validateDependency", () => {
  const tasks = [
    makeTask({ id: "a" }),
    // b empieza después de que 'a' termina, para que la dependencia FS a->b sea
    // válida también por fecha (no solo estructuralmente).
    makeTask({ id: "b", initialStartDate: "2026-05-11", initialEndDate: "2026-05-15" }),
    makeTask({ id: "c" }),
    makeTask({ id: "parent" }),
    makeTask({ id: "child", parentId: "parent" }),
  ];

  it("rechaza auto-referencia", () => {
    expect(validateDependency(tasks, "a", "a", "FS").ok).toBe(false);
  });

  it("acepta una dependencia válida", () => {
    expect(validateDependency(tasks, "b", "a", "FS").ok).toBe(true);
  });

  it("rechaza duplicada", () => {
    const withDep = tasks.map((t) => (t.id === "b" ? { ...t, dependencies: [dep("a")] } : t));
    expect(validateDependency(withDep, "b", "a", "FS").ok).toBe(false);
  });

  it("rechaza padre-hijo en ambas direcciones", () => {
    expect(validateDependency(tasks, "child", "parent", "FS").ok).toBe(false);
    expect(validateDependency(tasks, "parent", "child", "FS").ok).toBe(false);
  });

  it("rechaza ciclo A->B->A", () => {
    // b depende de a (a -> b). Intentar a depende de b cerraría el ciclo.
    const withDep = tasks.map((t) => (t.id === "b" ? { ...t, dependencies: [dep("a")] } : t));
    expect(validateDependency(withDep, "a", "b", "FS").ok).toBe(false);
  });

  it("rechaza redundante (a->b->c, luego a->c directo)", () => {
    const withDeps = tasks.map((t) => {
      if (t.id === "b") return { ...t, dependencies: [dep("a")] };
      if (t.id === "c") return { ...t, dependencies: [dep("b")] };
      return t;
    });
    // c ya alcanza a 'a' vía b -> añadir a->c directo es redundante
    expect(validateDependency(withDeps, "c", "a", "FS").ok).toBe(false);
  });

  it("rechaza si las fechas no cumplen la regla del tipo (FS: predecesor termina después del inicio del sucesor)", () => {
    // 'a' (05-04 a 05-08) no puede ser predecesor FS de 'c' (05-04 a 05-08, mismas fechas por defecto).
    expect(validateDependency(tasks, "c", "a", "FS").ok).toBe(false);
  });
});

describe("isDependencyDateValid", () => {
  it("FS: válida si el predecesor termina antes o al mismo tiempo que empieza el sucesor", () => {
    const pred = makeTask({ id: "p", initialStartDate: "2026-05-04", initialEndDate: "2026-05-08" });
    const succOk = makeTask({
      id: "s",
      initialStartDate: "2026-05-08",
      initialEndDate: "2026-05-12",
    });
    const succBad = makeTask({
      id: "s2",
      initialStartDate: "2026-05-06",
      initialEndDate: "2026-05-12",
    });
    expect(isDependencyDateValid(pred, succOk, "FS")).toBe(true);
    expect(isDependencyDateValid(pred, succBad, "FS")).toBe(false);
  });

  it("prioriza la fecha real sobre la estimada y la inicial", () => {
    const pred = makeTask({
      id: "p",
      initialStartDate: "2026-05-04",
      initialEndDate: "2026-05-08",
      estimatedStartDate: "2026-05-04",
      estimatedEndDate: "2026-05-06",
      actualEndDate: "2026-05-12", // real, posterior a estimada e inicial
    });
    const succ = makeTask({ id: "s", initialStartDate: "2026-05-08", initialEndDate: "2026-05-12" });
    // Con la estimada (05-06) sería válida; con la real (05-12) deja de serlo.
    expect(isDependencyDateValid(pred, succ, "FS")).toBe(false);
  });

  it("es permisiva si falta alguna fecha relevante", () => {
    const pred = makeTask({ id: "p", initialStartDate: undefined, initialEndDate: undefined });
    const succ = makeTask({ id: "s" });
    expect(isDependencyDateValid(pred, succ, "FS")).toBe(true);
  });

  it("FF/SS/SF siguen la misma restricción que usa el CPM", () => {
    const pred = makeTask({ id: "p", initialStartDate: "2026-05-04", initialEndDate: "2026-05-08" });
    const succ = makeTask({ id: "s", initialStartDate: "2026-05-04", initialEndDate: "2026-05-08" });
    expect(isDependencyDateValid(pred, succ, "FF")).toBe(true); // fin == fin
    expect(isDependencyDateValid(pred, succ, "SS")).toBe(true); // inicio == inicio
    expect(isDependencyDateValid(pred, succ, "SF")).toBe(true); // inicio pred <= fin succ
    const succAntes = makeTask({
      id: "s2",
      initialStartDate: "2026-05-01",
      initialEndDate: "2026-05-01",
    });
    expect(isDependencyDateValid(pred, succAntes, "SF")).toBe(false);
  });
});

describe("findDependenciesBrokenByEdit", () => {
  const base = [
    makeTask({ id: "a", initialStartDate: "2026-05-04", initialEndDate: "2026-05-08" }),
    makeTask({
      id: "b",
      initialStartDate: "2026-05-11",
      initialEndDate: "2026-05-15",
      dependencies: [dep("a", "FS")],
    }),
  ];

  it("detecta una dependencia FS que se rompe al adelantar el inicio del sucesor", () => {
    const broken = findDependenciesBrokenByEdit(base, "b", { initialStartDate: "2026-05-05" });
    expect(broken).toHaveLength(1);
    expect(broken[0].predecessorId).toBe("a");
    expect(broken[0].successorId).toBe("b");
    expect(broken[0].type).toBe("FS");
  });

  it("detecta la ruptura cuando se edita el predecesor en vez del sucesor", () => {
    const broken = findDependenciesBrokenByEdit(base, "a", { initialEndDate: "2026-05-13" });
    expect(broken).toHaveLength(1);
    expect(broken[0].predecessorId).toBe("a");
    expect(broken[0].successorId).toBe("b");
  });

  it("no reporta nada si el cambio no rompe la regla", () => {
    const broken = findDependenciesBrokenByEdit(base, "b", { initialStartDate: "2026-05-12" });
    expect(broken).toHaveLength(0);
  });

  it("no reporta nada si el cambio es en una tarea sin relación con la dependencia", () => {
    const tasks = [...base, makeTask({ id: "c" })];
    const broken = findDependenciesBrokenByEdit(tasks, "c", { initialStartDate: "2026-05-01" });
    expect(broken).toHaveLength(0);
  });
});

describe("computeSchedule", () => {
  it("cadena FS simple marca toda la cadena como crítica", () => {
    // a (5d) -> b (5d) -> c (5d), todas en cadena => todas críticas
    const tasks = [
      makeTask({ id: "a" }),
      makeTask({ id: "b", dependencies: [dep("a")] }),
      makeTask({ id: "c", dependencies: [dep("b")] }),
    ];
    const sched = computeSchedule(tasks);
    expect(sched.get("a")!.es).toBe(0);
    expect(sched.get("b")!.es).toBe(5);
    expect(sched.get("c")!.es).toBe(10);
    expect(sched.get("a")!.critical).toBe(true);
    expect(sched.get("b")!.critical).toBe(true);
    expect(sched.get("c")!.critical).toBe(true);
  });

  it("una tarea paralela más corta tiene holgura > 0 y no es crítica", () => {
    // a -> c (a=5, c=5). b -> c (b=2). El camino largo es a->c (10).
    // b tiene holgura porque puede empezar más tarde.
    const tasks = [
      makeTask({ id: "a" }),
      makeTask({ id: "b", initialStartDate: "2026-05-04", initialEndDate: "2026-05-05" }), // 2d
      makeTask({ id: "c", dependencies: [dep("a"), dep("b")] }),
    ];
    const sched = computeSchedule(tasks);
    expect(sched.get("a")!.critical).toBe(true);
    expect(sched.get("c")!.critical).toBe(true);
    expect(sched.get("b")!.totalFloat).toBeGreaterThan(0);
    expect(sched.get("b")!.critical).toBe(false);
  });

  it("no cuelga ante un ciclo", () => {
    // datos corruptos con ciclo a<->b
    const tasks = [
      makeTask({ id: "a", dependencies: [dep("b")] }),
      makeTask({ id: "b", dependencies: [dep("a")] }),
    ];
    const sched = computeSchedule(tasks);
    expect(sched.size).toBe(2);
    // los nodos en ciclo no se marcan como críticos (no cubiertos por topo)
    expect(sched.get("a")!.critical).toBe(false);
    expect(sched.get("b")!.critical).toBe(false);
  });
});
