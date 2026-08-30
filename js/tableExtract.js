// Best-effort reconstruction of a tabular grid from pdf.js text items,
// using their x/y positions rather than just the raw reading order.
// Good for invoices, price lists, and other simple tables; not a
// substitute for a real PDF table-extraction engine.

function median(nums) {
  if (!nums.length) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function clusterRows(items) {
  const heights = items.map(it => it.height || Math.abs(it.transform[3]) || 10).filter(h => h > 0);
  const rowThreshold = Math.max(2, median(heights) * 0.55);
  const rows = [];
  for (const it of items) {
    const y = it.transform[5];
    let row = rows.find(r => Math.abs(r.y - y) < rowThreshold);
    if (!row) { row = { y, items: [] }; rows.push(row); }
    row.items.push(it);
  }
  rows.forEach(r => r.items.sort((a, b) => a.transform[4] - b.transform[4]));
  rows.sort((a, b) => b.y - a.y);
  return rows;
}

function groupRowIntoCells(rowItems, colGapThreshold) {
  // pdf.js often emits the gap between table columns as its own
  // whitespace-only item whose *width* spans the whole gap (from explicit
  // TJ positioning), rather than leaving a true uncovered space between
  // neighboring items' boxes. So a wide blank item is treated as a hard
  // column break, while a narrow one (an ordinary inter-word space) is
  // folded into the current cell's text.
  const cells = [];
  let current = null;
  for (const it of rowItems) {
    const x = it.transform[4];
    const text = it.str;
    const width = it.width || 0;
    const isBlank = text.trim() === "";

    if (isBlank) {
      if (width > colGapThreshold) {
        current = null;
      } else if (current) {
        if (!current.text.endsWith(" ")) current.text += " ";
        current.rightX = Math.max(current.rightX, x + width);
      }
      continue;
    }

    if (current && x - current.rightX < colGapThreshold) {
      current.text += (current.text.endsWith(" ") ? "" : " ") + text;
      current.rightX = Math.max(current.rightX, x + width);
    } else {
      current = { x, rightX: x + width, text };
      cells.push(current);
    }
  }
  return cells.filter(c => c.text.trim() !== "");
}

function clusterColumns(allCells, colTolerance) {
  const xs = allCells.map(c => c.x).sort((a, b) => a - b);
  const clusters = [];
  for (const x of xs) {
    let cluster = clusters.find(c => Math.abs(c.center - x) < colTolerance);
    if (!cluster) { cluster = { center: x, xs: [] }; clusters.push(cluster); }
    cluster.xs.push(x);
    cluster.center = cluster.xs.reduce((a, b) => a + b, 0) / cluster.xs.length;
  }
  clusters.sort((a, b) => a.center - b.center);
  return clusters.map(c => c.center);
}

// Returns a 2D array of strings (rows of cells) for a single PDF page.
export function extractPageTable(textContent) {
  const items = textContent.items.filter(it => it.str !== undefined);
  if (!items.length) return [];

  const heights = items.map(it => it.height || Math.abs(it.transform[3]) || 10).filter(h => h > 0);
  const baseSize = median(heights) || 10;
  const colGapThreshold = Math.max(6, baseSize * 1.1);
  const colTolerance = Math.max(8, baseSize * 1.5);

  const rows = clusterRows(items);
  const rowCells = rows.map(r => groupRowIntoCells(r.items, colGapThreshold)).filter(c => c.length);
  if (!rowCells.length) return [];

  // Only rows with 2+ cells look like actual table rows — a single flowing
  // paragraph line would otherwise bridge unrelated columns together and
  // collapse the whole page into one giant column via transitive chaining.
  const tabularCells = rowCells.filter(c => c.length >= 2).flat();
  const columnCenters = clusterColumns(tabularCells.length ? tabularCells : rowCells.flat(), colTolerance);

  return rowCells.map(cells => {
    const line = new Array(columnCenters.length).fill("");
    for (const cell of cells) {
      let bestIdx = 0, bestDist = Infinity;
      columnCenters.forEach((cx, idx) => {
        const d = Math.abs(cx - cell.x);
        if (d < bestDist) { bestDist = d; bestIdx = idx; }
      });
      line[bestIdx] = line[bestIdx] ? line[bestIdx] + " " + cell.text : cell.text;
    }
    // Trim fully-empty trailing columns for this row.
    while (line.length && line[line.length - 1] === "") line.pop();
    return line;
  }).filter(row => row.length > 0);
}
