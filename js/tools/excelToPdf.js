import { el, setStatus, setProgress, downloadBlob, readFileAsArrayBuffer, stripExt } from "../utils.js";
import { createFileDropzone } from "../dropzone.js";
import { registerThaiFont } from "../thaiFont.js";

export function mount(container) {
  container.innerHTML = "";
  container.appendChild(el("div", { class: "tool-header" }, [
    el("h2", {}, ["📕 Excel → PDF"]),
    el("p", {}, "แปลงแต่ละชีทของไฟล์ Excel ให้เป็นตารางใน PDF หนึ่งไฟล์ (แยกหน้าใหม่ทุกชีท)"),
  ]));

  const panel = el("div", { class: "panel" });
  let file = null;
  const dz = createFileDropzone({
    accept: ".xlsx,.xls,.csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    multiple: false,
    hint: "รองรับไฟล์ .xlsx, .xls, .csv",
    onChange: (files) => { file = files[0] || null; },
  });
  panel.appendChild(dz.container);

  const orientField = el("select", {}, [
    el("option", { value: "landscape" }, "แนวนอน (เหมาะกับตารางกว้าง)"),
    el("option", { value: "portrait" }, "แนวตั้ง"),
  ]);
  const headerField = el("input", { type: "checkbox", id: "header-toggle", checked: "checked" });

  panel.appendChild(el("div", { class: "options-row" }, [
    el("div", { class: "field" }, [el("label", {}, "แนวกระดาษ"), orientField]),
    el("label", { class: "checkbox-field", for: "header-toggle" }, [headerField, "แถวแรกของแต่ละชีทเป็นหัวตาราง"]),
  ]));

  const status = el("div", { class: "status-msg" });
  const progressBar = el("div", { class: "progress-bar" }, [el("div", { class: "fill" })]);
  const resultList = el("div", { class: "result-list" });
  panel.appendChild(status);
  panel.appendChild(progressBar);
  panel.appendChild(el("div", { class: "actions-row" }, [
    el("button", { class: "btn", type: "button", onclick: run }, "📕 แปลงเป็น PDF"),
  ]));
  panel.appendChild(resultList);
  container.appendChild(panel);

  async function run() {
    if (!file) { setStatus(status, "error", "กรุณาเลือกไฟล์ Excel ก่อน"); return; }
    resultList.innerHTML = "";
    setStatus(status, "info", "กำลังโหลดฟอนต์และแปลงไฟล์...");
    const fill = progressBar.querySelector(".fill");
    setProgress(progressBar, fill, 5);
    try {
      const buf = await readFileAsArrayBuffer(file);
      const wb = XLSX.read(buf, { type: "array" });
      const sheetNames = wb.SheetNames;

      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({ unit: "pt", format: "a4", orientation: orientField.value });
      const fontName = await registerThaiFont(doc);
      setProgress(progressBar, fill, 20);

      sheetNames.forEach((name, idx) => {
        const sheet = wb.Sheets[name];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false })
          .map(r => r.map(c => (c === null || c === undefined ? "" : String(c))));

        if (idx > 0) doc.addPage();
        doc.setFont(fontName);
        doc.setFontSize(13);
        doc.text(name, 30, 30);

        const head = headerField.checked && rows.length ? [rows[0]] : [];
        const body = headerField.checked && rows.length ? rows.slice(1) : rows;

        doc.autoTable({
          head,
          body,
          startY: 42,
          margin: { left: 24, right: 24 },
          styles: { font: fontName, fontSize: 9, cellPadding: 4 },
          headStyles: { font: fontName, fillColor: [91, 95, 240] },
          theme: "grid",
        });
        setProgress(progressBar, fill, 20 + ((idx + 1) / sheetNames.length) * 75);
      });

      setProgress(progressBar, fill, null);
      const blob = doc.output("blob");
      const filename = `${stripExt(file.name)}.pdf`;
      downloadBlob(blob, filename);
      resultList.appendChild(el("div", { class: "result-row" }, [el("span", {}, "✅"), el("span", { class: "name" }, filename)]));
      setStatus(status, "success", `แปลงสำเร็จทั้งหมด ${sheetNames.length} ชีท`);
    } catch (err) {
      console.error(err);
      setProgress(progressBar, fill, null);
      setStatus(status, "error", "แปลงไฟล์ไม่สำเร็จ: " + err.message);
    }
  }
}
