import type { Task, Dependency, DependencyType } from "@/lib/gantt-store";
import { countWorkdays } from "@/lib/gantt-utils";

/**
 * Duración de una tarea en días hábiles, usando la capa estimada con fallback a
 * la inicial (mismo criterio que el store). 0 si no hay fechas (milestone).
 */
export function taskDuration(task: Task): number {
  const start = task.estimatedStartDate || task.initialStartDate;
  const end = task.estimatedEndDate || task.initialEndDate;
  if (!start || !end) return 0;
  return countWorkdays(start, end);
}

export interface ValidationOk {
  ok: true;
}
export interface ValidationError {
  ok: false;
  reason: string;
}
export type ValidationResult = ValidationOk | ValidationError;

/** Devuelve los ancestros (parentId hacia arriba) de una tarea, incluyéndola. */
function ancestorChain(byId: Map<string, Task>, id: string): Set<string> {
  const chain = new Set<string>();
  let cur: string | null = id;
  while (cur) {
    if (chain.has(cur)) break; // defensivo ante datos corruptos
    chain.add(cur);
    cur = byId.get(cur)?.parentId ?? null;
  }
  return chain;
}

/** ¿`ancestorId` es ancestro (o el mismo) de `id`? */
function isAncestorOf(byId: Map<string, Task>, ancestorId: string, id: string): boolean {
  return ancestorChain(byId, id).has(ancestorId);
}

/**
 * ¿Existe un camino de dependencias `from` -> ... -> `target` siguiendo las
 * aristas predecesor→sucesor? Una tarea S con dependency {predecessorId: P}
 * significa arista P -> S (P debe ir antes que S).
 */
function reachable(
  successorsOf: Map<string, string[]>,
  from: string,
  target: string,
): boolean {
  if (from === target) return true;
  const seen = new Set<string>();
  const stack = [from];
  while (stack.length) {
    const cur = stack.pop()!;
    if (cur === target) return true;
    if (seen.has(cur)) continue;
    seen.add(cur);
    for (const next of successorsOf.get(cur) ?? []) stack.push(next);
  }
  return false;
}

/** Construye el mapa predecesor -> [sucesores] a partir de las dependencias. */
function buildSuccessorsMap(tasks: Task[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const t of tasks) {
    for (const dep of t.dependencies ?? []) {
      const arr = map.get(dep.predecessorId) ?? [];
      arr.push(t.id);
      map.set(dep.predecessorId, arr);
    }
  }
  return map;
}

/**
 * Valida si se puede crear una dependencia donde `successorId` pasa a depender
 * de `predecessorId` con el tipo dado. Rechaza: auto-referencia, duplicada,
 * padre-hijo/ancestro-descendiente, cíclica y redundante.
 */
export function validateDependency(
  tasks: Task[],
  successorId: string,
  predecessorId: string,
): ValidationResult {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const successor = byId.get(successorId);
  const predecessor = byId.get(predecessorId);
  if (!successor || !predecessor) {
    return { ok: false, reason: "La tarea indicada no existe." };
  }

  // Auto-referencia
  if (predecessorId === successorId) {
    return { ok: false, reason: "Una tarea no puede depender de sí misma." };
  }

  // Duplicada
  if ((successor.dependencies ?? []).some((d) => d.predecessorId === predecessorId)) {
    return { ok: false, reason: "Esa dependencia ya existe." };
  }

  // Padre-hijo / ancestro-descendiente (en cualquier dirección)
  if (
    isAncestorOf(byId, predecessorId, successorId) ||
    isAncestorOf(byId, successorId, predecessorId)
  ) {
    return {
      ok: false,
      reason: "No se puede crear una dependencia entre una tarea y su ascendiente o descendiente.",
    };
  }

  const successorsOf = buildSuccessorsMap(tasks);

  // Cíclica: si el sucesor ya alcanza al predecesor (successor -> ... -> predecessor),
  // añadir predecessor -> successor cerraría un ciclo.
  if (reachable(successorsOf, successorId, predecessorId)) {
    return { ok: false, reason: "Esa dependencia crearía un ciclo." };
  }

  // Redundante: si el predecesor ya alcanza al sucesor por un camino indirecto
  // (predecessor -> X -> ... -> successor), la arista directa no aporta nada.
  if (reachable(successorsOf, predecessorId, successorId)) {
    return { ok: false, reason: "Esa dependencia es redundante (ya existe una ruta indirecta)." };
  }

  return { ok: true };
}

export interface ScheduleInfo {
  /** Early start / early finish (días hábiles desde 0). */
  es: number;
  ef: number;
  /** Late start / late finish. */
  ls: number;
  lf: number;
  /** Holgura total en días hábiles. */
  totalFloat: number;
  /** true si la tarea está en la ruta crítica (holgura 0). */
  critical: boolean;
}

/**
 * CPM clásico: programa la red de dependencias lo antes posible en unidades de
 * días hábiles usando la duración de cada tarea, y calcula la holgura total.
 * La ruta crítica son las tareas con holgura 0. Defensivo ante ciclos.
 */
export function computeSchedule(tasks: Task[]): Map<string, ScheduleInfo> {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const dur = new Map<string, number>();
  for (const t of tasks) dur.set(t.id, taskDuration(t));

  // Aristas predecesor -> sucesor y tipos por (sucesor, predecesor)
  const successorsOf = buildSuccessorsMap(tasks);
  const depType = new Map<string, DependencyType>(); // key `${predId}->${succId}`
  const indegree = new Map<string, number>();
  for (const t of tasks) indegree.set(t.id, 0);
  for (const t of tasks) {
    for (const dep of t.dependencies ?? []) {
      if (!byId.has(dep.predecessorId)) continue;
      depType.set(`${dep.predecessorId}->${t.id}`, dep.type);
      indegree.set(t.id, (indegree.get(t.id) ?? 0) + 1);
    }
  }

  // Orden topológico (Kahn)
  const queue: string[] = [];
  for (const [id, deg] of indegree) if (deg === 0) queue.push(id);
  const topo: string[] = [];
  const indegWork = new Map(indegree);
  while (queue.length) {
    const cur = queue.shift()!;
    topo.push(cur);
    for (const succ of successorsOf.get(cur) ?? []) {
      const d = (indegWork.get(succ) ?? 0) - 1;
      indegWork.set(succ, d);
      if (d === 0) queue.push(succ);
    }
  }
  // Nodos no cubiertos (formarían ciclo) se procesan al final sin restricciones.
  const covered = new Set(topo);
  for (const t of tasks) if (!covered.has(t.id)) topo.push(t.id);

  // Forward pass: ES/EF
  const es = new Map<string, number>();
  const ef = new Map<string, number>();
  for (const id of topo) {
    const d = dur.get(id) ?? 0;
    let start = 0;
    const succTask = byId.get(id);
    for (const dep of succTask?.dependencies ?? []) {
      const pId = dep.predecessorId;
      if (!byId.has(pId)) continue;
      const pEs = es.get(pId) ?? 0;
      const pEf = ef.get(pId) ?? 0;
      // Restricción sobre el inicio del sucesor según el tipo
      switch (dep.type) {
        case "FS":
          start = Math.max(start, pEf);
          break;
        case "SS":
          start = Math.max(start, pEs);
          break;
        case "FF":
          start = Math.max(start, pEf - d);
          break;
        case "SF":
          start = Math.max(start, pEs - d);
          break;
      }
    }
    es.set(id, start);
    ef.set(id, start + d);
  }

  const projectEnd = Math.max(0, ...topo.map((id) => ef.get(id) ?? 0));

  // Backward pass: LS/LF
  const ls = new Map<string, number>();
  const lf = new Map<string, number>();
  for (let i = topo.length - 1; i >= 0; i--) {
    const id = topo[i];
    const d = dur.get(id) ?? 0;
    let finish = projectEnd;
    for (const succId of successorsOf.get(id) ?? []) {
      const type = depType.get(`${id}->${succId}`);
      const sLs = ls.get(succId) ?? projectEnd;
      const sLf = lf.get(succId) ?? projectEnd;
      const sDur = dur.get(succId) ?? 0;
      // Restricción sobre el fin del predecesor (id) según el tipo
      switch (type) {
        case "FS":
          finish = Math.min(finish, sLs);
          break;
        case "FF":
          finish = Math.min(finish, sLf);
          break;
        case "SS":
          finish = Math.min(finish, sLs + d);
          break;
        case "SF":
          finish = Math.min(finish, sLf + d);
          break;
        default:
          finish = Math.min(finish, sLs);
      }
    }
    lf.set(id, finish);
    ls.set(id, finish - d);
  }

  const result = new Map<string, ScheduleInfo>();
  for (const t of tasks) {
    const tEs = es.get(t.id) ?? 0;
    const tEf = ef.get(t.id) ?? 0;
    const tLs = ls.get(t.id) ?? tEs;
    const tLf = lf.get(t.id) ?? tEf;
    const totalFloat = tLs - tEs;
    const hasSchedule = (dur.get(t.id) ?? 0) > 0 || (t.dependencies ?? []).length > 0;
    result.set(t.id, {
      es: tEs,
      ef: tEf,
      ls: tLs,
      lf: tLf,
      totalFloat,
      // Solo marcamos crítica una tarea con duración/dependencias reales y holgura 0.
      critical: hasSchedule && covered.has(t.id) && totalFloat === 0,
    });
  }
  return result;
}

export type { Dependency, DependencyType };
