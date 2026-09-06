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

// Most frequent value in a list of counts; ties broken toward the larger
// column count (a more informative table shape).
function mostCommonCellCount(counts) {
  const freq = new Map();
  for (const c of counts) freq.set(c, (freq.get(c) || 0) + 1);
  let best = null, bestFreq = 0;
  for (const [value, freqCount] of freq) {
    if (freqCount > bestFreq || (freqCount === bestFreq && value > best)) {
      best = value;
      bestFreq = freqCount;
    }
  }
  return best;
}

// Returns a 2D array of strings (rows of cells) for a single PDF page.
export function extractPageTable(textContent) {
  const items = textContent.items.filter(it => it.str !== undefined);
  if (!items.length) return [];

  const heights = items.map(it => it.height || Math.abs(it.transform[3]) || 10).filter(h => h > 0);
  const baseSize = median(heights) || 10;
  // A genuine column gap can be as narrow as a tightly-set number/unit pair
  // (a few points), while an ordinary inter-word space in flowing prose is
  // usually under ~3pt regardless of font size. This stays low (floored,
  // not scaled up, for normal body text sizes) so it catches tight column
  // gaps without mistaking prose word-spacing for a column break; it only
  // scales up for unusually large text where a real word-space would also
  // be wider than that floor.
  const colGapThreshold = Math.max(3, baseSize * 0.15);

  const rows = clusterRows(items);
  const rowCells = rows.map(r => groupRowIntoCells(r.items, colGapThreshold)).filter(c => c.length);
  if (!rowCells.length) return [];

  // Only rows with 2+ cells look like actual table rows — a single flowing
  // paragraph line stays as one cell rather than getting shredded across
  // whatever columns its words happen to land nearest to.
  const tabularCounts = rowCells.filter(c => c.length >= 2).map(c => c.length);
  if (!tabularCounts.length) {
    return rowCells.map(cells => [cells.map(c => c.text).join(" ")]);
  }

  // The table's column count is simply the shape most rows share. Using
  // each cell's *position within its row* (rather than clustering x
  // coordinates across rows) sidesteps two things that defeat x-proximity
  // clustering: columns set close enough together that no single distance
  // threshold can both keep them apart AND still tolerate another column's
  // own natural jitter, and center-aligned columns whose text start drifts
  // a lot from row to row depending on content length.
  const columnCount = mostCommonCellCount(tabularCounts);
  const centerSums = new Array(columnCount).fill(0);
  const centerCounts = new Array(columnCount).fill(0);
  for (const cells of rowCells) {
    if (cells.length === columnCount) {
      cells.forEach((c, i) => { centerSums[i] += c.x; centerCounts[i]++; });
    }
  }
  const columnCenters = centerSums.map((sum, i) => (centerCounts[i] ? sum / centerCounts[i] : i));

  return rowCells.map(cells => {
    if (cells.length === columnCount) {
      return cells.map(c => c.text);
    }
    if (cells.length < 2) {
      return [cells.map(c => c.text).join(" ")];
    }
    // An irregular row (e.g. a totals line missing its leading columns) —
    // place each cell in whichever confirmed column it sits nearest to.
    const line = new Array(columnCount).fill("");
    for (const cell of cells) {
      let bestIdx = 0, bestDist = Infinity;
      columnCenters.forEach((cx, idx) => {
        const d = Math.abs(cx - cell.x);
        if (d < bestDist) { bestDist = d; bestIdx = idx; }
      });
      line[bestIdx] = line[bestIdx] ? line[bestIdx] + " " + cell.text : cell.text;
    }
    while (line.length && line[line.length - 1] === "") line.pop();
    return line;
  });
}
