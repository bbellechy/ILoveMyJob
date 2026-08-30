import { el, setStatus, downloadBlob, readFileAsArrayBuffer } from "../utils.js";
import { createFileDropzone } from "../dropzone.js";

export function mount(container) {
  container.innerHTML = "";
  container.appendChild(el("div", { class: "tool-header" }, [
    el("h2", {}, ["🔗 รวมไฟล์ PDF (Merge)"]),
    el("p", {}, "รวมไฟล์ PDF หลายไฟล์เข้าด้วยกันตามลำดับที่กำหนด ลากไฟล์เพื่อสลับลำดับได้"),
  ]));

  const panel = el("div", { class: "panel" });
  let files = [];
  const dz = createFileDropzone({
    accept: "application/pdf",
    multiple: true,
    hint: "เลือกไฟล์ PDF ตั้งแต่ 2 ไฟล์ขึ้นไป",
    onChange: (fs) => { files = fs; },
  });
  panel.appendChild(dz.container);

  const status = el("div", { class: "status-msg" });
  const resultList = el("div", { class: "result-list" });
  panel.appendChild(status);
  panel.appendChild(el("div", { class: "actions-row" }, [
    el("button", { class: "btn", type: "button", onclick: run }, "🔗 รวมไฟล์"),
  ]));
  panel.appendChild(resultList);
  container.appendChild(panel);

  async function run() {
    if (files.length < 2) { setStatus(status, "error", "กรุณาเลือกไฟล์ PDF อย่างน้อย 2 ไฟล์"); return; }
    resultList.innerHTML = "";
    setStatus(status, "info", "กำลังรวมไฟล์...");
    try {
      const { PDFDocument } = PDFLib;
      const mergedDoc = await PDFDocument.create();
      for (const file of files) {
        const buf = await readFileAsArrayBuffer(file);
        const srcDoc = await PDFDocument.load(buf);
        const pages = await mergedDoc.copyPages(srcDoc, srcDoc.getPageIndices());
        pages.forEach(p => mergedDoc.addPage(p));
      }
      const bytes = await mergedDoc.save();
      const blob = new Blob([bytes], { type: "application/pdf" });
      const filename = "merged.pdf";
      downloadBlob(blob, filename);
      resultList.appendChild(el("div", { class: "result-row" }, [el("span", {}, "✅"), el("span", { class: "name" }, filename)]));
      setStatus(status, "success", `รวมไฟล์สำเร็จทั้งหมด ${files.length} ไฟล์`);
    } catch (err) {
      console.error(err);
      setStatus(status, "error", "รวมไฟล์ไม่สำเร็จ: " + err.message);
    }
  }
}
