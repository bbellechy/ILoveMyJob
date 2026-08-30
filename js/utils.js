// Shared helpers used across all conversion tools.

export function $(sel, root = document) {
  return root.querySelector(sel);
}

export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
    else if (k === "html") node.innerHTML = v;
    else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
    else if (v !== false && v !== null && v !== undefined) node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) {
    if (c === null || c === undefined) continue;
    node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return node;
}

export function formatBytes(bytes) {
  if (!bytes && bytes !== 0) return "";
  if (bytes < 1024) return bytes + " B";
  const units = ["KB", "MB", "GB"];
  let val = bytes / 1024;
  let i = 0;
  while (val >= 1024 && i < units.length - 1) { val /= 1024; i++; }
  return val.toFixed(1) + " " + units[i];
}

export function readFileAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export async function zipAndDownload(files, zipName) {
  // files: [{name, blob}]
  const zip = new JSZip();
  for (const f of files) zip.file(f.name, f.blob);
  const blob = await zip.generateAsync({ type: "blob" });
  downloadBlob(blob, zipName);
}

export function stripExt(name) {
  const i = name.lastIndexOf(".");
  return i > 0 ? name.slice(0, i) : name;
}

export function uid() {
  return Math.random().toString(36).slice(2, 10);
}

let idCounter = 0;
export function nextId() {
  return "id" + (++idCounter) + "_" + uid();
}

export function setStatus(node, kind, message) {
  node.className = "status-msg show " + kind;
  node.textContent = message;
}

export function clearStatus(node) {
  node.className = "status-msg";
  node.textContent = "";
}

export function setProgress(barNode, fillNode, pct) {
  if (pct === null) {
    barNode.classList.remove("show");
    return;
  }
  barNode.classList.add("show");
  fillNode.style.width = Math.max(0, Math.min(100, pct)) + "%";
}

// Configure pdf.js worker once, reused by every tool that needs to read PDFs.
export function getPdfjs() {
  const lib = window["pdfjsLib"];
  if (lib && !lib.__workerConfigured) {
    lib.GlobalWorkerOptions.workerSrc =
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
    lib.__workerConfigured = true;
  }
  return lib;
}

export async function loadPdfDocument(arrayBuffer) {
  const pdfjsLib = getPdfjs();
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  return loadingTask.promise;
}

export async function renderPageToCanvas(page, scale) {
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext("2d");
  await page.render({ canvasContext: ctx, viewport }).promise;
  return canvas;
}

export function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

// Generic drag-reorder for a list of DOM items inside a container.
// onReorder(fromIndex, toIndex) is called with the visual index positions.
export function enableDragReorder(container, itemSelector, onReorder) {
  let dragEl = null;
  container.addEventListener("dragstart", (e) => {
    const item = e.target.closest(itemSelector);
    if (!item) return;
    dragEl = item;
    item.classList.add("dragging");
    e.dataTransfer.effectAllowed = "move";
  });
  container.addEventListener("dragend", (e) => {
    const item = e.target.closest(itemSelector);
    if (item) item.classList.remove("dragging");
    container.querySelectorAll(itemSelector).forEach((n) => n.classList.remove("drag-over"));
    dragEl = null;
  });
  container.addEventListener("dragover", (e) => {
    e.preventDefault();
    const over = e.target.closest(itemSelector);
    if (!over || over === dragEl) return;
    container.querySelectorAll(itemSelector).forEach((n) => n.classList.remove("drag-over"));
    over.classList.add("drag-over");
  });
  container.addEventListener("drop", (e) => {
    e.preventDefault();
    const over = e.target.closest(itemSelector);
    if (!over || !dragEl || over === dragEl) return;
    const items = Array.from(container.querySelectorAll(itemSelector));
    const from = items.indexOf(dragEl);
    const to = items.indexOf(over);
    over.classList.remove("drag-over");
    onReorder(from, to);
  });
}

export function iconBtn({ title, text, danger, onclick }) {
  return el("button", {
    class: "icon-btn" + (danger ? " danger" : ""),
    title,
    type: "button",
    onclick,
  }, text);
}
