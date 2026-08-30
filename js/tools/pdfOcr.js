import { el, setStatus, setProgress, downloadBlob, readFileAsArrayBuffer, stripExt,
  loadPdfDocument, renderPageToCanvas, zipAndDownload } from "../utils.js";
import { createFileDropzone } from "../dropzone.js";
import { registerThaiFont } from "../thaiFont.js";

const LANGS = {
  "tha+eng": "ไทย + อังกฤษ (แนะนำ)",
  tha: "ไทยเท่านั้น",
  eng: "อังกฤษเท่านั้น",
};

export function mount(container) {
  container.innerHTML = "";
  container.appendChild(el("div", { class: "tool-header" }, [
    el("h2", {}, ["🔍 OCR อ่านข้อความจาก PDF ที่เป็นภาพสแกน"]),
    el("p", {}, "ใช้กับ PDF ที่เป็นภาพสแกน (ข้อความคัดลอกไม่ได้) — ระบบจะอ่านตัวอักษรในภาพให้ แล้วเลือกได้ว่าจะส่งออกเป็นข้อความ หรือสร้างเป็น PDF ที่ค้นหา/เลือกข้อความได้ (ภาพเดิมไม่เปลี่ยน มีชั้นข้อความที่มองไม่เห็นซ้อนอยู่)"),
  ]));

  const panel = el("div", { class: "panel" });
  let file = null;
  const dz = createFileDropzone({
    accept: "application/pdf",
    multiple: false,
    hint: "รองรับไฟล์ PDF 1 ไฟล์ต่อครั้ง — ประมวลผลช้ากว่าเครื่องมืออื่นเพราะต้องอ่านตัวอักษรทีละหน้า",
    onChange: (files) => { file = files[0] || null; },
  });
  panel.appendChild(dz.container);

  const langField = el("select", {}, Object.entries(LANGS).map(([code, label]) =>
    el("option", { value: code }, label)
  ));
  const modeField = el("select", {}, [
    el("option", { value: "searchable-pdf" }, "PDF ที่ค้นหา/เลือกข้อความได้"),
    el("option", { value: "text" }, "ข้อความอย่างเดียว (.txt)"),
  ]);
  const perPageField = el("input", { type: "checkbox", id: "ocr-perpage" });

  const modeRow = el("div", { class: "options-row" }, [
    el("div", { class: "field" }, [el("label", {}, "ภาษาในเอกสาร"), langField]),
    el("div", { class: "field" }, [el("label", {}, "รูปแบบผลลัพธ์"), modeField]),
  ]);
  const perPageRow = el("div", { class: "options-row", style: "display:none" }, [
    el("label", { class: "checkbox-field", for: "ocr-perpage" }, [perPageField, "แยกไฟล์ .txt ต่อหน้า (ดาวน์โหลดเป็น .zip)"]),
  ]);
  modeField.addEventListener("change", () => {
    perPageRow.style.display = modeField.value === "text" ? "flex" : "none";
  });
  panel.appendChild(modeRow);
  panel.appendChild(perPageRow);

  const status = el("div", { class: "status-msg" });
  const progressBar = el("div", { class: "progress-bar" }, [el("div", { class: "fill" })]);
  const resultList = el("div", { class: "result-list" });
  panel.appendChild(status);
  panel.appendChild(progressBar);
  panel.appendChild(el("div", { class: "actions-row" }, [
    el("button", { class: "btn", type: "button", onclick: run }, "🔍 เริ่ม OCR"),
  ]));
  panel.appendChild(resultList);
  container.appendChild(panel);

  const OCR_SCALE = 2.2;

  async function run() {
    if (!file) { setStatus(status, "error", "กรุณาเลือกไฟล์ PDF ก่อน"); return; }
    resultList.innerHTML = "";
    const fill = progressBar.querySelector(".fill");
    setProgress(progressBar, fill, 2);
    setStatus(status, "info", "กำลังเตรียมเครื่องมือ OCR (ครั้งแรกอาจโหลดข้อมูลภาษาเพิ่มเติม)...");

    let worker = null;
    try {
      const buf = await readFileAsArrayBuffer(file);
      const pdf = await loadPdfDocument(buf);
      const total = pdf.numPages;
      const baseName = stripExt(file.name);
      const mode = modeField.value;

      worker = await Tesseract.createWorker(langField.value, 1, {
        logger: (m) => {
          if (m.status === "recognizing text" && typeof m.progress === "number") {
            const pageShare = 1 / total;
            const donePages = worker.__pageIndex || 0;
            setProgress(progressBar, fill, ((donePages + m.progress) * pageShare) * 100);
          }
        },
      });

      let doc = null;
      let fontName = null;
      const pageTexts = [];

      if (mode === "searchable-pdf") {
        const { jsPDF } = window.jspdf;
        const firstViewport = (await pdf.getPage(1)).getViewport({ scale: 1 });
        doc = new jsPDF({
          unit: "pt",
          format: [firstViewport.width, firstViewport.height],
          // jsPDF silently swaps a custom [w,h] format to match its default
          // "portrait" assumption unless told otherwise — without this, a
          // landscape-shaped scanned page comes out with width/height flipped.
          orientation: firstViewport.width > firstViewport.height ? "l" : "p",
        });
        fontName = await registerThaiFont(doc);
      }

      for (let i = 1; i <= total; i++) {
        worker.__pageIndex = i - 1;
        setStatus(status, "info", `กำลังอ่านข้อความหน้า ${i} จาก ${total}...`);
        const page = await pdf.getPage(i);
        const viewport1 = page.getViewport({ scale: 1 });
        const canvas = await renderPageToCanvas(page, OCR_SCALE);
        const factor = viewport1.width / canvas.width;

        const { data } = await worker.recognize(canvas);
        pageTexts.push(data.text || "");

        if (mode === "searchable-pdf") {
          if (i > 1) {
            doc.addPage([viewport1.width, viewport1.height], viewport1.width > viewport1.height ? "l" : "p");
          }
          const imgData = canvas.toDataURL("image/jpeg", 0.82);
          doc.addImage(imgData, "JPEG", 0, 0, viewport1.width, viewport1.height);
          doc.setFont(fontName);

          // Placing one invisible run per OCR *line* (rather than per word)
          // keeps the text layer's word joins intact for copy/search — Thai
          // script has no spaces between words, so Tesseract's per-word
          // boxes are often single-character fragments, which would make
          // the hidden text layer copy/search as broken, spaced-out letters.
          for (const line of data.lines || []) {
            const text = (line.text || "").replace(/\s+/g, " ").trim();
            if (!text) continue;
            const { x0, y0, x1, y1 } = line.bbox;
            const wPt = (x1 - x0) * factor;
            const hPt = (y1 - y0) * factor;
            if (wPt <= 0 || hPt <= 0) continue;
            const fontSize = Math.max(4, hPt * 0.75);
            doc.setFontSize(fontSize);
            doc.text(text, x0 * factor, y1 * factor, { renderingMode: "invisible" });
          }
        }
      }

      await worker.terminate();
      worker = null;
      setProgress(progressBar, fill, 98);

      if (mode === "searchable-pdf") {
        const blob = doc.output("blob");
        const filename = `${baseName}-ocr.pdf`;
        downloadBlob(blob, filename);
        resultList.appendChild(el("div", { class: "result-row" }, [el("span", {}, "✅"), el("span", { class: "name" }, filename)]));
      } else if (perPageField.checked) {
        const outputs = pageTexts.map((t, i) => ({ name: `${baseName}-page${i + 1}.txt`, blob: new Blob([t], { type: "text/plain" }) }));
        await zipAndDownload(outputs, `${baseName}-ocr-text.zip`);
        outputs.forEach(o => resultList.appendChild(el("div", { class: "result-row" }, [el("span", {}, "✅"), el("span", { class: "name" }, o.name)])));
      } else {
        const combined = pageTexts.map((t, i) => `----- หน้า ${i + 1} -----\n${t}`).join("\n\n");
        const blob = new Blob([combined], { type: "text/plain" });
        const filename = `${baseName}-ocr.txt`;
        downloadBlob(blob, filename);
        resultList.appendChild(el("div", { class: "result-row" }, [el("span", {}, "✅"), el("span", { class: "name" }, filename)]));
      }

      setProgress(progressBar, fill, null);
      setStatus(status, "success", `OCR สำเร็จทั้งหมด ${total} หน้า`);
    } catch (err) {
      console.error(err);
      if (worker) { try { await worker.terminate(); } catch {} }
      setProgress(progressBar, fill, null);
      setStatus(status, "error", "OCR ไม่สำเร็จ: " + err.message);
    }
  }
}
