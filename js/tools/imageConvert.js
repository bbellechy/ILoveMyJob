import { el, setStatus, setProgress, downloadBlob, canvasToBlob, stripExt, zipAndDownload } from "../utils.js";
import { createFileDropzone } from "../dropzone.js";
import { canvasToBmpBlob } from "../bmpEncoder.js";

const FORMATS = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/bmp": "bmp",
};

export function mount(container) {
  container.innerHTML = "";
  container.appendChild(el("div", { class: "tool-header" }, [
    el("h2", {}, ["🔄 แปลงชนิดไฟล์รูปภาพ"]),
    el("p", {}, "แปลงไฟล์รูประหว่าง PNG, JPG, WEBP, BMP ได้ทีละหลายไฟล์"),
  ]));

  const panel = el("div", { class: "panel" });
  let images = [];
  const dz = createFileDropzone({
    accept: "image/*",
    multiple: true,
    hint: "เลือกได้หลายไฟล์พร้อมกัน",
    onChange: (files) => { images = files; },
  });
  panel.appendChild(dz.container);

  const formatField = el("select", {}, Object.entries(FORMATS).map(([mime, ext]) =>
    el("option", { value: mime }, ext.toUpperCase())
  ));
  formatField.value = "image/jpeg";
  const qualityField = el("input", { type: "range", min: "0.3", max: "1", step: "0.05", value: "0.9" });
  const qualityLabel = el("span", {}, "90%");
  qualityField.addEventListener("input", () => qualityLabel.textContent = Math.round(qualityField.value * 100) + "%");

  panel.appendChild(el("div", { class: "options-row" }, [
    el("div", { class: "field" }, [el("label", {}, "แปลงเป็น"), formatField]),
    el("div", { class: "field" }, [el("label", {}, ["คุณภาพ (สำหรับ JPG/WEBP) ", qualityLabel]), qualityField]),
  ]));

  const status = el("div", { class: "status-msg" });
  const progressBar = el("div", { class: "progress-bar" }, [el("div", { class: "fill" })]);
  const resultList = el("div", { class: "result-list" });
  panel.appendChild(status);
  panel.appendChild(progressBar);
  panel.appendChild(el("div", { class: "actions-row" }, [
    el("button", { class: "btn", type: "button", onclick: run }, "🔄 แปลงไฟล์"),
  ]));
  panel.appendChild(resultList);
  container.appendChild(panel);

  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { resolve(img); URL.revokeObjectURL(url); };
      img.onerror = reject;
      img.src = url;
    });
  }

  async function run() {
    if (!images.length) { setStatus(status, "error", "กรุณาเลือกรูปภาพอย่างน้อย 1 ไฟล์"); return; }
    resultList.innerHTML = "";
    setStatus(status, "info", "กำลังแปลงไฟล์...");
    const fill = progressBar.querySelector(".fill");
    const mime = formatField.value;
    const ext = FORMATS[mime];
    const quality = (mime === "image/jpeg" || mime === "image/webp") ? Number(qualityField.value) : undefined;
    const outputs = [];

    try {
      for (let i = 0; i < images.length; i++) {
        const file = images[i];
        const img = await loadImage(file);
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext("2d");
        if (mime === "image/jpeg" || mime === "image/bmp") {
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
        ctx.drawImage(img, 0, 0);
        const blob = mime === "image/bmp" ? canvasToBmpBlob(canvas) : await canvasToBlob(canvas, mime, quality);
        outputs.push({ name: `${stripExt(file.name)}.${ext}`, blob });
        setProgress(progressBar, fill, ((i + 1) / images.length) * 100);
      }
      setProgress(progressBar, fill, null);

      if (outputs.length === 1) {
        downloadBlob(outputs[0].blob, outputs[0].name);
      } else {
        await zipAndDownload(outputs, `converted-${ext}.zip`);
      }
      outputs.forEach(o => resultList.appendChild(el("div", { class: "result-row" }, [el("span", {}, "✅"), el("span", { class: "name" }, o.name)])));
      setStatus(status, "success", `แปลงสำเร็จ ${outputs.length} ไฟล์`);
    } catch (err) {
      console.error(err);
      setStatus(status, "error", "แปลงไฟล์ไม่สำเร็จ: " + err.message);
    }
  }
}
