import { el, setStatus, downloadBlob, readFileAsArrayBuffer, stripExt, zipAndDownload } from "../utils.js";
import { createFileDropzone } from "../dropzone.js";
import { splitIntoRangeGroups } from "../pageRange.js";

export function mount(container) {
  container.innerHTML = "";
  container.appendChild(el("div", { class: "tool-header" }, [
    el("h2", {}, ["✂️ แยกไฟล์ PDF (Split)"]),
    el("p", {}, "แยก PDF หนึ่งไฟล์ออกเป็นหลายไฟล์ ตามหน้าเดี่ยวหรือช่วงหน้าที่กำหนด"),
  ]));

  const panel = el("div", { class: "panel" });
  let file = null;
  const dz = createFileDropzone({
    accept: "application/pdf",
    multiple: false,
    hint: "รองรับไฟล์ PDF 1 ไฟล์ต่อครั้ง",
    onChange: (fs) => { file = fs[0] || null; },
  });
  panel.appendChild(dz.container);

  const rangeField = el("input", { type: "text", placeholder: "เช่น all (แยกทุกหน้า) หรือ 1-3,4-6,7", value: "all" });
  panel.appendChild(el("div", { class: "options-row" }, [
    el("div", { class: "field", style: "flex:1;min-width:260px;" }, [
      el("label", {}, "ระบุช่วงหน้า — แต่ละกลุ่มที่คั่นด้วยจุลภาคจะกลายเป็น 1 ไฟล์"),
      rangeField,
    ]),
  ]));

  const status = el("div", { class: "status-msg" });
  const resultList = el("div", { class: "result-list" });
  panel.appendChild(status);
  panel.appendChild(el("div", { class: "actions-row" }, [
    el("button", { class: "btn", type: "button", onclick: run }, "✂️ แยกไฟล์"),
  ]));
  panel.appendChild(resultList);
  container.appendChild(panel);

  async function run() {
    if (!file) { setStatus(status, "error", "กรุณาเลือกไฟล์ PDF ก่อน"); return; }
    resultList.innerHTML = "";
    setStatus(status, "info", "กำลังแยกไฟล์...");
    try {
      const { PDFDocument } = PDFLib;
      const buf = await readFileAsArrayBuffer(file);
      const srcDoc = await PDFDocument.load(buf);
      const total = srcDoc.getPageCount();
      const groups = splitIntoRangeGroups(rangeField.value, total);
      if (!groups.length) { setStatus(status, "error", "ระบุช่วงหน้าไม่ถูกต้อง"); return; }

      const baseName = stripExt(file.name);
      const outputs = [];
      for (const group of groups) {
        const newDoc = await PDFDocument.create();
        const indices = group.pages.map(p => p - 1);
        const pages = await newDoc.copyPages(srcDoc, indices);
        pages.forEach(p => newDoc.addPage(p));
        const bytes = await newDoc.save();
        outputs.push({ name: `${baseName}-p${group.label}.pdf`, blob: new Blob([bytes], { type: "application/pdf" }) });
      }

      if (outputs.length === 1) {
        downloadBlob(outputs[0].blob, outputs[0].name);
      } else {
        await zipAndDownload(outputs, `${baseName}-split.zip`);
      }
      outputs.forEach(o => resultList.appendChild(el("div", { class: "result-row" }, [el("span", {}, "✅"), el("span", { class: "name" }, o.name)])));
      setStatus(status, "success", `แยกไฟล์สำเร็จทั้งหมด ${outputs.length} ไฟล์`);
    } catch (err) {
      console.error(err);
      setStatus(status, "error", "แยกไฟล์ไม่สำเร็จ: " + err.message);
    }
  }
}
