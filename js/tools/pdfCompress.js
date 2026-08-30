import { el, setStatus, setProgress, downloadBlob, readFileAsArrayBuffer, formatBytes,
  loadPdfDocument, renderPageToCanvas, canvasToBlob, stripExt } from "../utils.js";
import { createFileDropzone } from "../dropzone.js";

export function mount(container) {
  container.innerHTML = "";
  container.appendChild(el("div", { class: "tool-header" }, [
    el("h2", {}, ["🗜️ บีบอัดไฟล์ PDF"]),
    el("p", {}, "ลดขนาดไฟล์โดยแปลงแต่ละหน้าเป็นภาพคุณภาพที่กำหนดแล้วประกอบกลับเป็น PDF ใหม่ เหมาะกับ PDF ที่สแกนมาหรือมีรูปภาพเยอะ (หมายเหตุ: วิธีนี้ทำให้ข้อความในไฟล์กลายเป็นภาพ ไม่สามารถเลือก/คัดลอกข้อความได้อีก)"),
  ]));

  const panel = el("div", { class: "panel" });
  let file = null;
  const dz = createFileDropzone({
    accept: "application/pdf",
    multiple: false,
    hint: "รองรับไฟล์ PDF 1 ไฟล์ต่อครั้ง",
    onChange: (files) => {
      file = files[0] || null;
      origSizeLabel.textContent = file ? `ขนาดต้นฉบับ: ${formatBytes(file.size)}` : "";
    },
  });
  panel.appendChild(dz.container);
  const origSizeLabel = el("div", { style: "font-size:12px;color:var(--text-dim);margin-top:6px;" });
  panel.appendChild(origSizeLabel);

  const levelField = el("select", {}, [
    el("option", { value: "high" }, "คุณภาพสูง (ไฟล์เล็กลงปานกลาง)"),
    el("option", { value: "medium", selected: "selected" }, "ปานกลาง (แนะนำ)"),
    el("option", { value: "low" }, "บีบอัดมาก (ไฟล์เล็กสุด คุณภาพลดลงชัดเจน)"),
  ]);
  const LEVELS = {
    high: { scale: 2.0, quality: 0.85 },
    medium: { scale: 1.4, quality: 0.7 },
    low: { scale: 1.0, quality: 0.5 },
  };

  panel.appendChild(el("div", { class: "options-row" }, [
    el("div", { class: "field" }, [el("label", {}, "ระดับการบีบอัด"), levelField]),
  ]));

  const status = el("div", { class: "status-msg" });
  const progressBar = el("div", { class: "progress-bar" }, [el("div", { class: "fill" })]);
  const resultList = el("div", { class: "result-list" });
  panel.appendChild(status);
  panel.appendChild(progressBar);
  panel.appendChild(el("div", { class: "actions-row" }, [
    el("button", { class: "btn", type: "button", onclick: run }, "🗜️ บีบอัดไฟล์"),
  ]));
  panel.appendChild(resultList);
  container.appendChild(panel);

  async function run() {
    if (!file) { setStatus(status, "error", "กรุณาเลือกไฟล์ PDF ก่อน"); return; }
    resultList.innerHTML = "";
    setStatus(status, "info", "กำลังบีบอัดไฟล์...");
    const fill = progressBar.querySelector(".fill");
    const { scale, quality } = LEVELS[levelField.value];

    try {
      const buf = await readFileAsArrayBuffer(file);
      const pdf = await loadPdfDocument(buf.slice(0));
      const total = pdf.numPages;

      const { PDFDocument } = PDFLib;
      const newDoc = await PDFDocument.create();

      for (let i = 1; i <= total; i++) {
        const page = await pdf.getPage(i);
        const canvas = await renderPageToCanvas(page, scale);
        const blob = await canvasToBlob(canvas, "image/jpeg", quality);
        const jpgBytes = new Uint8Array(await blob.arrayBuffer());
        const img = await newDoc.embedJpg(jpgBytes);
        const viewport = page.getViewport({ scale: 1 });
        const newPage = newDoc.addPage([viewport.width, viewport.height]);
        newPage.drawImage(img, { x: 0, y: 0, width: viewport.width, height: viewport.height });
        setProgress(progressBar, fill, (i / total) * 100);
      }
      setProgress(progressBar, fill, null);

      const bytes = await newDoc.save();
      const outBlob = new Blob([bytes], { type: "application/pdf" });
      const filename = `${stripExt(file.name)}-compressed.pdf`;
      downloadBlob(outBlob, filename);

      const before = file.size, after = outBlob.size;
      const pct = before ? Math.round((1 - after / before) * 100) : 0;
      resultList.appendChild(el("div", { class: "result-row" }, [el("span", {}, "✅"), el("span", { class: "name" }, filename)]));
      setStatus(status, "success",
        `เสร็จแล้ว: ${formatBytes(before)} → ${formatBytes(after)}` +
        (pct > 0 ? ` (เล็กลง ${pct}%)` : pct < 0 ? " (ไฟล์ใหญ่ขึ้น ลองเลือกระดับบีบอัดที่มากขึ้น)" : ""));
    } catch (err) {
      console.error(err);
      setProgress(progressBar, fill, null);
      setStatus(status, "error", "บีบอัดไฟล์ไม่สำเร็จ: " + err.message);
    }
  }
}
