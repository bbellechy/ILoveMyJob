import { el, setStatus, setProgress, downloadBlob, readFileAsArrayBuffer,
  loadPdfDocument, stripExt } from "../utils.js";
import { createFileDropzone } from "../dropzone.js";
import { extractPageTable } from "../tableExtract.js";

export function mount(container) {
  container.innerHTML = "";
  container.appendChild(el("div", { class: "tool-header" }, [
    el("h2", {}, ["📊 PDF → Excel (XLSX)"]),
    el("p", {}, "พยายามจับตำแหน่งคอลัมน์ในตารางของ PDF โดยอัตโนมัติ แล้วแปลงเป็นไฟล์ Excel เหมาะกับ PDF ที่เป็นตาราง/รายการ (ไม่ใช่ภาพสแกน)"),
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

  const modeField = el("select", {}, [
    el("option", { value: "sheet-per-page" }, "1 ชีทต่อ 1 หน้า"),
    el("option", { value: "single-sheet" }, "รวมทุกหน้าไว้ในชีทเดียว (คั่นด้วยแถวว่าง)"),
  ]);
  panel.appendChild(el("div", { class: "options-row" }, [
    el("div", { class: "field" }, [el("label", {}, "รูปแบบชีท"), modeField]),
  ]));

  const status = el("div", { class: "status-msg" });
  const progressBar = el("div", { class: "progress-bar" }, [el("div", { class: "fill" })]);
  const resultList = el("div", { class: "result-list" });
  panel.appendChild(status);
  panel.appendChild(progressBar);
  panel.appendChild(el("div", { class: "actions-row" }, [
    el("button", { class: "btn", type: "button", onclick: run }, "📊 แปลงเป็น Excel"),
  ]));
  panel.appendChild(resultList);
  container.appendChild(panel);

  async function run() {
    if (!file) { setStatus(status, "error", "กรุณาเลือกไฟล์ PDF ก่อน"); return; }
    resultList.innerHTML = "";
    setStatus(status, "info", "กำลังวิเคราะห์ตารางและแปลงไฟล์...");
    const fill = progressBar.querySelector(".fill");
    try {
      const buf = await readFileAsArrayBuffer(file);
      const pdf = await loadPdfDocument(buf);
      const total = pdf.numPages;
      const baseName = stripExt(file.name);
      const wb = XLSX.utils.book_new();
      const singleSheetRows = [];

      for (let i = 1; i <= total; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const rows = extractPageTable(textContent);

        if (modeField.value === "sheet-per-page") {
          const ws = XLSX.utils.aoa_to_sheet(rows.length ? rows : [[""]]);
          XLSX.utils.book_append_sheet(wb, ws, `Page${i}`.slice(0, 31));
        } else {
          singleSheetRows.push([`หน้า ${i}`]);
          rows.forEach(r => singleSheetRows.push(r));
          singleSheetRows.push([]);
        }
        setProgress(progressBar, fill, (i / total) * 100);
      }

      if (modeField.value === "single-sheet") {
        const ws = XLSX.utils.aoa_to_sheet(singleSheetRows);
        XLSX.utils.book_append_sheet(wb, ws, "All Pages");
      }
      setProgress(progressBar, fill, null);

      const wbArray = XLSX.write(wb, { type: "array", bookType: "xlsx" });
      const blob = new Blob([wbArray], { type: "application/octet-stream" });
      const filename = `${baseName}.xlsx`;
      downloadBlob(blob, filename);
      resultList.appendChild(el("div", { class: "result-row" }, [el("span", {}, "✅"), el("span", { class: "name" }, filename)]));
      setStatus(status, "success", `แปลงสำเร็จ ${total} หน้า (การจับตารางเป็นแบบประมาณการ ควรตรวจสอบผลลัพธ์อีกครั้ง)`);
    } catch (err) {
      console.error(err);
      setStatus(status, "error", "แปลงไฟล์ไม่สำเร็จ: " + err.message);
    }
  }
}
