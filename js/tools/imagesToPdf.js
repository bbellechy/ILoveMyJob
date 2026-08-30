import { el, setStatus, setProgress, downloadBlob, readFileAsArrayBuffer } from "../utils.js";
import { createFileDropzone } from "../dropzone.js";

const PAGE_SIZES = {
  a4: [595.28, 841.89],
  letter: [612, 792],
  fit: null, // page sized to match each image
};

export function mount(container) {
  container.innerHTML = "";
  container.appendChild(el("div", { class: "tool-header" }, [
    el("h2", {}, ["🧩 รูปภาพ → PDF"]),
    el("p", {}, "รวมรูปภาพหลายไฟล์ (JPG, PNG, WEBP) ให้เป็น PDF ไฟล์เดียว จัดลำดับได้ด้วยการลาก"),
  ]));

  const panel = el("div", { class: "panel" });
  const dz = createFileDropzone({
    accept: "image/*",
    multiple: true,
    hint: "เลือกได้หลายไฟล์ ลากเพื่อจัดลำดับก่อนแปลง",
    onChange: (files) => { images = files; },
  });
  panel.appendChild(dz.container);
  let images = [];

  const sizeField = el("select", {}, [
    el("option", { value: "fit" }, "พอดีกับขนาดรูปภาพ (Fit)"),
    el("option", { value: "a4" }, "A4"),
    el("option", { value: "letter" }, "Letter"),
  ]);
  const marginField = el("input", { type: "number", min: "0", max: "100", value: "0", step: "5" });

  panel.appendChild(el("div", { class: "options-row" }, [
    el("div", { class: "field" }, [el("label", {}, "ขนาดหน้ากระดาษ"), sizeField]),
    el("div", { class: "field" }, [el("label", {}, "ระยะขอบ (pt)"), marginField]),
  ]));

  const status = el("div", { class: "status-msg" });
  const progressBar = el("div", { class: "progress-bar" }, [el("div", { class: "fill" })]);
  const resultList = el("div", { class: "result-list" });
  panel.appendChild(status);
  panel.appendChild(progressBar);
  panel.appendChild(el("div", { class: "actions-row" }, [
    el("button", { class: "btn", type: "button", onclick: run }, "🧩 รวมเป็น PDF"),
  ]));
  panel.appendChild(resultList);
  container.appendChild(panel);

  async function embedImage(pdfDoc, file) {
    const buf = await readFileAsArrayBuffer(file);
    const isPng = file.type === "image/png" || /\.png$/i.test(file.name);
    if (isPng) return pdfDoc.embedPng(buf);
    try {
      return await pdfDoc.embedJpg(buf);
    } catch {
      // Non-JPEG/PNG formats (webp, bmp, gif...) get re-encoded via canvas first.
      const bitmap = await createImageBitmap(new Blob([buf]));
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      canvas.getContext("2d").drawImage(bitmap, 0, 0);
      const jpegDataUrl = canvas.toDataURL("image/jpeg", 0.92);
      const jpegBytes = Uint8Array.from(atob(jpegDataUrl.split(",")[1]), c => c.charCodeAt(0));
      return pdfDoc.embedJpg(jpegBytes);
    }
  }

  async function run() {
    if (!images.length) { setStatus(status, "error", "กรุณาเลือกรูปภาพอย่างน้อย 1 ไฟล์"); return; }
    resultList.innerHTML = "";
    setStatus(status, "info", "กำลังสร้างไฟล์ PDF...");
    const fill = progressBar.querySelector(".fill");
    try {
      const { PDFDocument } = PDFLib;
      const pdfDoc = await PDFDocument.create();
      const margin = Number(marginField.value) || 0;
      const sizeChoice = sizeField.value;

      for (let i = 0; i < images.length; i++) {
        const img = await embedImage(pdfDoc, images[i]);
        const imgW = img.width, imgH = img.height;

        let pageW, pageH, drawW, drawH, x, y;
        if (sizeChoice === "fit") {
          pageW = imgW + margin * 2;
          pageH = imgH + margin * 2;
          drawW = imgW; drawH = imgH;
          x = margin; y = margin;
        } else {
          [pageW, pageH] = PAGE_SIZES[sizeChoice];
          const availW = pageW - margin * 2;
          const availH = pageH - margin * 2;
          const scale = Math.min(availW / imgW, availH / imgH);
          drawW = imgW * scale;
          drawH = imgH * scale;
          x = (pageW - drawW) / 2;
          y = (pageH - drawH) / 2;
        }

        const page = pdfDoc.addPage([pageW, pageH]);
        page.drawImage(img, { x, y, width: drawW, height: drawH });
        setProgress(progressBar, fill, ((i + 1) / images.length) * 100);
      }
      setProgress(progressBar, fill, null);

      const bytes = await pdfDoc.save();
      const blob = new Blob([bytes], { type: "application/pdf" });
      const filename = "images-merged.pdf";
      downloadBlob(blob, filename);
      resultList.appendChild(el("div", { class: "result-row" }, [el("span", {}, "✅"), el("span", { class: "name" }, filename)]));
      setStatus(status, "success", `สร้าง PDF สำเร็จจากรูปภาพ ${images.length} ไฟล์`);
    } catch (err) {
      console.error(err);
      setStatus(status, "error", "สร้างไฟล์ไม่สำเร็จ: " + err.message);
    }
  }
}
