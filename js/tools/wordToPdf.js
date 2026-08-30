import { el, setStatus, setProgress, downloadBlob, readFileAsArrayBuffer, stripExt } from "../utils.js";
import { createFileDropzone } from "../dropzone.js";
import { registerThaiFont } from "../thaiFont.js";

const PAGE_MARGIN = 40;
const HEADING_SIZES = { h1: 20, h2: 17, h3: 15, h4: 13, h5: 12, h6: 11 };

export function mount(container) {
  container.innerHTML = "";
  container.appendChild(el("div", { class: "tool-header" }, [
    el("h2", {}, ["📘 Word → PDF"]),
    el("p", {}, "แปลงเนื้อหาเอกสาร Word (.docx) เป็น PDF โดยพยายามรักษาหัวข้อ ย่อหน้า รายการ ตาราง และรูปภาพไว้ (จัดรูปแบบที่ซับซ้อนมากอาจไม่เหมือนต้นฉบับทุกจุด)"),
  ]));

  const panel = el("div", { class: "panel" });
  let file = null;
  const dz = createFileDropzone({
    accept: ".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    multiple: false,
    hint: "รองรับไฟล์ .docx เท่านั้น (ไฟล์ .doc เก่าไม่รองรับ)",
    onChange: (files) => { file = files[0] || null; },
  });
  panel.appendChild(dz.container);

  const status = el("div", { class: "status-msg" });
  const progressBar = el("div", { class: "progress-bar" }, [el("div", { class: "fill" })]);
  const resultList = el("div", { class: "result-list" });
  panel.appendChild(status);
  panel.appendChild(progressBar);
  panel.appendChild(el("div", { class: "actions-row" }, [
    el("button", { class: "btn", type: "button", onclick: run }, "📘 แปลงเป็น PDF"),
  ]));
  panel.appendChild(resultList);
  container.appendChild(panel);

  async function run() {
    if (!file) { setStatus(status, "error", "กรุณาเลือกไฟล์ Word (.docx) ก่อน"); return; }
    resultList.innerHTML = "";
    setStatus(status, "info", "กำลังโหลดฟอนต์และอ่านเอกสาร...");
    const fill = progressBar.querySelector(".fill");
    setProgress(progressBar, fill, 10);

    try {
      const buf = await readFileAsArrayBuffer(file);
      const { value: html } = await mammoth.convertToHtml({ arrayBuffer: buf });
      setProgress(progressBar, fill, 35);

      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({ unit: "pt", format: "a4" });
      const fontName = await registerThaiFont(doc);
      doc.setFont(fontName);
      setProgress(progressBar, fill, 50);

      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const maxWidth = pageWidth - PAGE_MARGIN * 2;

      const dom = new DOMParser().parseFromString(html, "text/html");
      let y = PAGE_MARGIN;

      function ensureSpace(neededHeight) {
        if (y + neededHeight > pageHeight - PAGE_MARGIN) {
          doc.addPage();
          doc.setFont(fontName);
          y = PAGE_MARGIN;
        }
      }

      function writeParagraph(text, { size = 11, bold = false, indent = 0, gapAfter = 10 } = {}) {
        const trimmed = text.replace(/\s+/g, " ").trim();
        doc.setFontSize(size);
        doc.setFont(fontName, bold ? "bold" : "normal");
        if (!trimmed) { y += size * 0.6; return; }
        const lines = doc.splitTextToSize(trimmed, maxWidth - indent);
        const lineHeight = size * 1.35;
        for (const line of lines) {
          ensureSpace(lineHeight);
          doc.text(line, PAGE_MARGIN + indent, y);
          y += lineHeight;
        }
        y += gapAfter;
        doc.setFont(fontName, "normal");
      }

      async function drawImage(src) {
        if (!src || !src.startsWith("data:image")) return;
        try {
          const img = await new Promise((resolve, reject) => {
            const im = new Image();
            im.onload = () => resolve(im);
            im.onerror = reject;
            im.src = src;
          });
          const ratio = img.naturalWidth ? img.naturalHeight / img.naturalWidth : 0.6;
          let w = Math.min(maxWidth, img.naturalWidth || maxWidth);
          let h = w * ratio;
          const maxH = pageHeight - PAGE_MARGIN * 2;
          if (h > maxH) { h = maxH; w = h / (ratio || 1); }
          ensureSpace(h + 10);
          const format = src.startsWith("data:image/png") ? "PNG" : "JPEG";
          doc.addImage(src, format, PAGE_MARGIN, y, w, h);
          y += h + 10;
        } catch {
          // Skip images that fail to decode rather than aborting the whole document.
        }
      }

      function tableRows(tableEl) {
        return Array.from(tableEl.querySelectorAll("tr")).map((tr) =>
          Array.from(tr.children).map((cell) => cell.textContent.replace(/\s+/g, " ").trim())
        );
      }

      async function walk(node) {
        for (const child of Array.from(node.children)) {
          const tag = child.tagName.toLowerCase();
          if (HEADING_SIZES[tag]) {
            y += 6;
            writeParagraph(child.textContent, { size: HEADING_SIZES[tag], bold: true, gapAfter: 12 });
          } else if (tag === "p") {
            const img = child.querySelector("img");
            if (img) await drawImage(img.getAttribute("src"));
            const text = child.textContent;
            if (text.trim()) writeParagraph(text, { size: 11, gapAfter: 8 });
          } else if (tag === "img") {
            await drawImage(child.getAttribute("src"));
          } else if (tag === "ul" || tag === "ol") {
            let i = 1;
            for (const li of Array.from(child.children)) {
              const prefix = tag === "ol" ? `${i}. ` : "• ";
              writeParagraph(prefix + li.textContent, { size: 11, indent: 14, gapAfter: 6 });
              i++;
            }
          } else if (tag === "table") {
            const rows = tableRows(child);
            if (rows.length) {
              ensureSpace(30);
              doc.autoTable({
                body: rows,
                startY: y,
                margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
                styles: { font: fontName, fontSize: 9, cellPadding: 4 },
                theme: "grid",
              });
              y = doc.lastAutoTable.finalY + 12;
              doc.setFont(fontName, "normal");
            }
          } else if (tag === "blockquote") {
            writeParagraph(child.textContent, { size: 11, indent: 14, gapAfter: 8 });
          } else {
            await walk(child);
          }
        }
      }

      await walk(dom.body);
      setProgress(progressBar, fill, 95);

      const blob = doc.output("blob");
      const filename = `${stripExt(file.name)}.pdf`;
      downloadBlob(blob, filename);
      setProgress(progressBar, fill, null);
      resultList.appendChild(el("div", { class: "result-row" }, [el("span", {}, "✅"), el("span", { class: "name" }, filename)]));
      setStatus(status, "success", "แปลงไฟล์สำเร็จ");
    } catch (err) {
      console.error(err);
      setProgress(progressBar, fill, null);
      setStatus(status, "error", "แปลงไฟล์ไม่สำเร็จ: " + err.message);
    }
  }
}
