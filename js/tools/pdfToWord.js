import { el, setStatus, setProgress, downloadBlob, readFileAsArrayBuffer,
  loadPdfDocument, stripExt } from "../utils.js";
import { createFileDropzone } from "../dropzone.js";
import { extractPageText } from "./pdfToText.js";

export function mount(container) {
  container.innerHTML = "";
  container.appendChild(el("div", { class: "tool-header" }, [
    el("h2", {}, ["📝 PDF → Word (DOCX)"]),
    el("p", {}, "ดึงข้อความจาก PDF มาสร้างเป็นเอกสาร Word โดยแบ่งหน้าให้ตรงกับต้นฉบับ (เหมาะกับ PDF ที่เป็นข้อความ ไม่ใช่ภาพสแกน)"),
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

  const status = el("div", { class: "status-msg" });
  const progressBar = el("div", { class: "progress-bar" }, [el("div", { class: "fill" })]);
  const resultList = el("div", { class: "result-list" });
  panel.appendChild(status);
  panel.appendChild(progressBar);
  panel.appendChild(el("div", { class: "actions-row" }, [
    el("button", { class: "btn", type: "button", onclick: run }, "📝 แปลงเป็น Word"),
  ]));
  panel.appendChild(resultList);
  container.appendChild(panel);

  async function run() {
    if (!file) { setStatus(status, "error", "กรุณาเลือกไฟล์ PDF ก่อน"); return; }
    resultList.innerHTML = "";
    setStatus(status, "info", "กำลังแปลงไฟล์...");
    const fill = progressBar.querySelector(".fill");
    try {
      const { Document, Packer, Paragraph, TextRun, PageBreak } = docx;
      const buf = await readFileAsArrayBuffer(file);
      const pdf = await loadPdfDocument(buf);
      const total = pdf.numPages;
      const baseName = stripExt(file.name);

      const children = [];
      for (let i = 1; i <= total; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const text = extractPageText(textContent);
        const lines = text.split("\n").filter(Boolean);
        if (!lines.length) {
          children.push(new Paragraph({ children: [new TextRun("")] }));
        } else {
          for (const line of lines) {
            children.push(new Paragraph({ children: [new TextRun(line)] }));
          }
        }
        if (i < total) {
          children.push(new Paragraph({ children: [new PageBreak()] }));
        }
        setProgress(progressBar, fill, (i / total) * 100);
      }
      setProgress(progressBar, fill, null);

      const doc = new Document({ sections: [{ properties: {}, children }] });
      const blob = await Packer.toBlob(doc);
      const filename = `${baseName}.docx`;
      downloadBlob(blob, filename);
      resultList.appendChild(el("div", { class: "result-row" }, [el("span", {}, "✅"), el("span", { class: "name" }, filename)]));
      setStatus(status, "success", `แปลงสำเร็จทั้งหมด ${total} หน้า`);
    } catch (err) {
      console.error(err);
      setStatus(status, "error", "แปลงไฟล์ไม่สำเร็จ: " + err.message);
    }
  }
}
