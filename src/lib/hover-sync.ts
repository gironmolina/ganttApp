let current: string | null = null;

export function setHoveredTask(id: string | null) {
  if (id === current) return;
  if (current !== null) {
    document
      .querySelectorAll(`[data-row-id="${CSS.escape(current)}"]`)
      .forEach((el) => el.classList.remove("row-hovered"));
  }
  current = id;
  if (id !== null) {
    document
      .querySelectorAll(`[data-row-id="${CSS.escape(id)}"]`)
      .forEach((el) => el.classList.add("row-hovered"));
  }
}
