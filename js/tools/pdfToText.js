import { el, setStatus, setProgress, downloadBlob, readFileAsArrayBuffer,
  loadPdfDocument, stripExt, zipAndDownload } from "../utils.js";
import { createFileDropzone } from "../dropzone.js";

// Groups pdf.js text items into readable lines using their y-position,
// which is a good-enough heuristic for reconstructing paragraph flow.
export function extractPageText(textContent) {
  const items = textContent.items.filter(it => it.str !== undefined);
  if (!items.length) return "";
  const rows = [];
  const threshold = 2.5;
  for (const it of items) {
    const y = it.transform[5];
    let row = rows.find(r => Math.abs(r.y - y) < threshold);
    if (!row) { row = { y, items: [] }; rows.push(row); }
    row.items.push(it);
  }
  rows.sort((a, b) => b.y - a.y);
  return rows.map(r => r.items.sort((a, b) => a.transform[4] - b.transform[4]).map(i => i.str).join(" ").replace(/\s+/g, " ").trim())
    .filter(Boolean).join("\n");
}

export function mount(container) {
  container.innerHTML = "";
  container.appendChild(el("div", { class: "tool-header" }, [
    el("h2", {}, ["📄 PDF → ข้อความ (TXT)"]),
    el("p", {}, "ดึงข้อความทั้งหมดจาก PDF ออกมาเป็นไฟล์ .txt"),
  ]));

  const panel = el("div", { class: "panel" });
  let file = null;
  const dz = createFileDropzone({
    accept: "application/pdf",
    multiple: false,
    hint: "รองรับไฟล์ PDF 1 ไฟล์ต่อครั้ง",
    onChange: (files) => { file = files[0] || null; },
  });
  panel.appendChild(dz.container);

  const perPageField = el("input", { type: "checkbox", id: "perpage-toggle" });
  panel.appendChild(el("div", { class: "options-row" }, [
    el("label", { class: "checkbox-field", for: "perpage-toggle" }, [perPageField, "แยกไฟล์ .txt ต่อหน้า (ดาวน์โหลดเป็น .zip)"]),
  ]));

  const status = el("div", { class: "status-msg" });
  const progressBar = el("div", { class: "progress-bar" }, [el("div", { class: "fill" })]);
  const resultList = el("div", { class: "result-list" });
  panel.appendChild(status);
  panel.appendChild(progressBar);
  panel.appendChild(el("div", { class: "actions-row" }, [
    el("button", { class: "btn", type: "button", onclick: run }, "📄 แปลงเป็นข้อความ"),
  ]));
  panel.appendChild(resultList);
  container.appendChild(panel);

  async function run() {
    if (!file) { setStatus(status, "error", "กรุณาเลือกไฟล์ PDF ก่อน"); return; }
    resultList.innerHTML = "";
    setStatus(status, "info", "กำลังดึงข้อความ...");
    const fill = progressBar.querySelector(".fill");
    try {
      const buf = await readFileAsArrayBuffer(file);
      const pdf = await loadPdfDocument(buf);
      const total = pdf.numPages;
      const baseName = stripExt(file.name);
      const perPage = perPageField.checked;
      const pageTexts = [];

      for (let i = 1; i <= total; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        pageTexts.push(extractPageText(textContent));
        setProgress(progressBar, fill, (i / total) * 100);
      }
      setProgress(progressBar, fill, null);

      if (perPage) {
        const outputs = pageTexts.map((t, i) => ({ name: `${baseName}-page${i + 1}.txt`, blob: new Blob([t], { type: "text/plain" }) }));
        await zipAndDownload(outputs, `${baseName}-text.zip`);
        outputs.forEach(o => resultList.appendChild(el("div", { class: "result-row" }, [el("span", {}, "✅"), el("span", { class: "name" }, o.name)])));
      } else {
        const combined = pageTexts.map((t, i) => `----- หน้า ${i + 1} -----\n${t}`).join("\n\n");
        const blob = new Blob([combined], { type: "text/plain" });
        const filename = `${baseName}.txt`;
        downloadBlob(blob, filename);
        resultList.appendChild(el("div", { class: "result-row" }, [el("span", {}, "✅"), el("span", { class: "name" }, filename)]));
      }
      setStatus(status, "success", `ดึงข้อความสำเร็จจากทั้งหมด ${total} หน้า`);
    } catch (err) {
      console.error(err);
      setStatus(status, "error", "แปลงไฟล์ไม่สำเร็จ: " + err.message);
    }
  }
}
