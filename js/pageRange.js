// Parses strings like "all", "1-3,5,7-9" into a sorted, de-duplicated
// array of 1-based page numbers, clamped to [1, totalPages].
export function parsePageRange(input, totalPages) {
  const trimmed = (input || "").trim().toLowerCase();
  if (!trimmed || trimmed === "all" || trimmed === "*") {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  const set = new Set();
  const parts = trimmed.split(",").map(s => s.trim()).filter(Boolean);
  for (const part of parts) {
    const rangeMatch = part.match(/^(\d+)\s*-\s*(\d+)$/);
    if (rangeMatch) {
      let a = parseInt(rangeMatch[1], 10);
      let b = parseInt(rangeMatch[2], 10);
      if (a > b) [a, b] = [b, a];
      for (let n = a; n <= b; n++) {
        if (n >= 1 && n <= totalPages) set.add(n);
      }
      continue;
    }
    const single = part.match(/^(\d+)$/);
    if (single) {
      const n = parseInt(single[1], 10);
      if (n >= 1 && n <= totalPages) set.add(n);
    }
  }
  return Array.from(set).sort((a, b) => a - b);
}

export function splitIntoRangeGroups(input, totalPages) {
  // Returns an array of {label, pages[]} — one group per comma-separated
  // range, used by the split tool to produce one output file per group.
  const trimmed = (input || "").trim().toLowerCase();
  if (!trimmed || trimmed === "all" || trimmed === "*") {
    return Array.from({ length: totalPages }, (_, i) => ({ label: `${i + 1}`, pages: [i + 1] }));
  }
  const groups = [];
  const parts = trimmed.split(",").map(s => s.trim()).filter(Boolean);
  for (const part of parts) {
    const rangeMatch = part.match(/^(\d+)\s*-\s*(\d+)$/);
    if (rangeMatch) {
      let a = parseInt(rangeMatch[1], 10);
      let b = parseInt(rangeMatch[2], 10);
      if (a > b) [a, b] = [b, a];
      const pages = [];
      for (let n = a; n <= b; n++) if (n >= 1 && n <= totalPages) pages.push(n);
      if (pages.length) groups.push({ label: `${a}-${b}`, pages });
      continue;
    }
    const single = part.match(/^(\d+)$/);
    if (single) {
      const n = parseInt(single[1], 10);
      if (n >= 1 && n <= totalPages) groups.push({ label: `${n}`, pages: [n] });
    }
  }
  return groups;
}
