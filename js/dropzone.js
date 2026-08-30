import { el, formatBytes, iconBtn, enableDragReorder } from "./utils.js";

// Reusable file drop/upload widget with an optional reorderable file list.
// options: { accept, multiple, hint, showList, allowReorder, onChange(files) }
export function createFileDropzone(options = {}) {
  const {
    accept = "*",
    multiple = true,
    hint = "รองรับการลากไฟล์มาวาง หรือคลิกเพื่อเลือกไฟล์",
    showList = true,
    allowReorder = true,
    onChange = () => {},
  } = options;

  let files = [];

  const input = el("input", {
    type: "file",
    accept,
    ...(multiple ? { multiple: "multiple" } : {}),
    onchange: (e) => addFiles(Array.from(e.target.files || [])),
  });

  const zone = el("div", { class: "dropzone", tabindex: "0" }, [
    el("div", { class: "dz-icon" }, "📁"),
    el("div", {}, [el("strong", {}, "คลิกเพื่อเลือกไฟล์"), " หรือลากไฟล์มาวางที่นี่"]),
    el("div", { style: "font-size:12px;margin-top:6px;" }, hint),
    input,
  ]);

  const list = el("div", { class: "file-list" });

  zone.addEventListener("click", () => input.click());
  zone.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") input.click(); });
  ["dragenter", "dragover"].forEach((evt) =>
    zone.addEventListener(evt, (e) => { e.preventDefault(); zone.classList.add("drag"); })
  );
  ["dragleave", "drop"].forEach((evt) =>
    zone.addEventListener(evt, (e) => { e.preventDefault(); zone.classList.remove("drag"); })
  );
  zone.addEventListener("drop", (e) => {
    const dropped = Array.from(e.dataTransfer.files || []);
    addFiles(dropped);
  });

  function addFiles(newFiles) {
    if (!newFiles.length) return;
    files = multiple ? files.concat(newFiles) : newFiles.slice(0, 1);
    input.value = "";
    renderList();
    onChange(files);
  }

  function removeAt(idx) {
    files.splice(idx, 1);
    renderList();
    onChange(files);
  }

  function reorder(from, to) {
    const [moved] = files.splice(from, 1);
    files.splice(to, 0, moved);
    renderList();
    onChange(files);
  }

  function renderList() {
    if (!showList) return;
    list.innerHTML = "";
    files.forEach((f, idx) => {
      const row = el("div", { class: "file-row", draggable: allowReorder ? "true" : "false", "data-idx": idx }, [
        allowReorder ? el("span", { class: "drag-handle" }, "⠿") : null,
        el("span", { class: "name" }, f.name),
        el("span", { class: "size" }, formatBytes(f.size)),
        iconBtn({ title: "ลบไฟล์นี้ออก", text: "✕", danger: true, onclick: () => removeAt(idx) }),
      ]);
      list.appendChild(row);
    });
    if (allowReorder) {
      enableDragReorder(list, ".file-row", (from, to) => reorder(from, to));
    }
  }

  function clear() {
    files = [];
    renderList();
    onChange(files);
  }

  function setFiles(newFiles) {
    files = newFiles;
    renderList();
    onChange(files);
  }

  const wrap = el("div", {}, [zone, list]);

  return { container: wrap, getFiles: () => files, clear, setFiles };
}
