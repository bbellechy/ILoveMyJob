import { el, setStatus, setProgress, downloadBlob, readFileAsArrayBuffer,
  loadPdfDocument, renderPageToCanvas, canvasToBlob, stripExt, zipAndDownload } from "../utils.js";
import { createFileDropzone } from "../dropzone.js";
import { parsePageRange } from "../pageRange.js";

export function mount(container) {
  container.innerHTML = "";
  container.appendChild(el("div", { class: "tool-header" }, [
    el("h2", {}, ["🖼️ PDF → รูปภาพ (PNG / JPG)"]),
    el("p", {}, "แปลงแต่ละหน้าของ PDF ให้เป็นไฟล์รูปภาพ เลือกได้ว่าจะเอาทุกหน้าหรือระบุเฉพาะบางหน้า"),
  ]));

  const panel = el("div", { class: "panel" });
  const dz = createFileDropzone({
    accept: "application/pdf",
    multiple: false,
    showList: true,
    hint: "รองรับไฟล์ PDF 1 ไฟล์ต่อครั้ง",
    onChange: (files) => { file = files[0] || null; },
  });
  panel.appendChild(dz.container);

  let file = null;

  const formatField = el("select", {}, [
    el("option", { value: "image/png" }, "PNG (คุณภาพสูง ไม่มีการบีบอัด)"),
    el("option", { value: "image/jpeg" }, "JPG (ไฟล์เล็กกว่า)"),
  ]);
  const scaleField = el("input", { type: "range", min: "1", max: "4", step: "0.5", value: "2" });
  const scaleLabel = el("span", {}, "2.0x");
  scaleField.addEventListener("input", () => scaleLabel.textContent = Number(scaleField.value).toFixed(1) + "x");
  const qualityField = el("input", { type: "range", min: "0.3", max: "1", step: "0.05", value: "0.9" });
  const qualityLabel = el("span", {}, "90%");
  qualityField.addEventListener("input", () => qualityLabel.textContent = Math.round(qualityField.value * 100) + "%");
  const rangeField = el("input", { type: "text", placeholder: "เช่น all หรือ 1-3,5,7-9", value: "all" });

  panel.appendChild(el("div", { class: "options-row" }, [
    el("div", { class: "field" }, [el("label", {}, "รูปแบบไฟล์"), formatField]),
    el("div", { class: "field" }, [el("label", {}, ["ความละเอียด ", scaleLabel]), scaleField]),
    el("div", { class: "field" }, [el("label", {}, ["คุณภาพ JPG ", qualityLabel]), qualityField]),
    el("div", { class: "field", style: "flex:1;min-width:220px;" }, [el("label", {}, "หน้าที่ต้องการ"), rangeField]),
  ]));

  const status = el("div", { class: "status-msg" });
  const progressBar = el("div", { class: "progress-bar" }, [el("div", { class: "fill" })]);
  const resultList = el("div", { class: "result-list" });
  const actionsRow = el("div", { class: "actions-row" }, [
    el("button", { class: "btn", type: "button", onclick: run }, "🖼️ แปลงเป็นรูปภาพ"),
  ]);

  panel.appendChild(status);
  panel.appendChild(progressBar);
  panel.appendChild(actionsRow);
  panel.appendChild(resultList);
  container.appendChild(panel);

  async function run() {
    if (!file) { setStatus(status, "error", "กรุณาเลือกไฟล์ PDF ก่อน"); return; }
    resultList.innerHTML = "";
    setStatus(status, "info", "กำลังแปลงไฟล์...");
    const fill = progressBar.querySelector(".fill");
    try {
      const buf = await readFileAsArrayBuffer(file);
      const pdf = await loadPdfDocument(buf);
      const total = pdf.numPages;
      const indices = parsePageRange(rangeField.value, total);
      if (!indices.length) { setStatus(status, "error", "ระบุช่วงหน้าไม่ถูกต้อง"); return; }

      const mime = formatField.value;
      const ext = mime === "image/png" ? "png" : "jpg";
      const quality = mime === "image/jpeg" ? Number(qualityField.value) : undefined;
      const scale = Number(scaleField.value);
      const baseName = stripExt(file.name);
      const outputs = [];

      for (let i = 0; i < indices.length; i++) {
        const pageNum = indices[i];
        const page = await pdf.getPage(pageNum);
        const canvas = await renderPageToCanvas(page, scale);
        const blob = await canvasToBlob(canvas, mime, quality);
        outputs.push({ name: `${baseName}-page${pageNum}.${ext}`, blob });
        setProgress(progressBar, fill, ((i + 1) / indices.length) * 100);
      }
      setProgress(progressBar, fill, null);

      if (outputs.length === 1) {
        downloadBlob(outputs[0].blob, outputs[0].name);
      } else {
        await zipAndDownload(outputs, `${baseName}-images.zip`);
      }
      outputs.forEach(o => resultList.appendChild(el("div", { class: "result-row" }, [el("span", {}, "✅"), el("span", { class: "name" }, o.name)])));
      setStatus(status, "success", `แปลงสำเร็จ ${outputs.length} หน้า`);
    } catch (err) {
      console.error(err);
      setStatus(status, "error", "แปลงไฟล์ไม่สำเร็จ: " + err.message);
    }
  }
}
