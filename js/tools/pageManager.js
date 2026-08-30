import { el, setStatus, clearStatus, setProgress, downloadBlob, readFileAsArrayBuffer,
  loadPdfDocument, renderPageToCanvas, stripExt, enableDragReorder } from "../utils.js";
import { createFileDropzone } from "../dropzone.js";

export function mount(container) {
  container.innerHTML = "";

  container.appendChild(el("div", { class: "tool-header" }, [
    el("h2", {}, ["📑 จัดการหน้า PDF"]),
    el("p", {}, "เลือกหน้าที่จะเก็บไว้หรือลบทิ้ง สลับลำดับหน้าด้วยการลาก และหมุนหน้าได้ตามต้องการ"),
  ]));

  const panel = el("div", { class: "panel" });
  const dz = createFileDropzone({
    accept: "application/pdf",
    multiple: false,
    showList: false,
    hint: "รองรับไฟล์ PDF 1 ไฟล์ต่อครั้ง",
    onChange: (files) => { if (files[0]) loadPdf(files[0]); },
  });
  panel.appendChild(dz.container);

  const status = el("div", { class: "status-msg" });
  panel.appendChild(status);

  const toolbar = el("div", { class: "toolbar", style: "display:none" });
  const grid = el("div", { class: "page-grid" });
  const actionsRow = el("div", { class: "actions-row", style: "display:none" });
  const progressBar = el("div", { class: "progress-bar" }, [el("div", { class: "fill" })]);
  const resultList = el("div", { class: "result-list" });

  panel.appendChild(toolbar);
  panel.appendChild(grid);
  panel.appendChild(progressBar);
  panel.appendChild(actionsRow);
  panel.appendChild(resultList);
  container.appendChild(panel);

  let originalBytes = null;
  let sourceName = "document";
  let pages = []; // { origIndex, rotationDelta, removed, canvas }

  async function loadPdf(file) {
    grid.innerHTML = "";
    resultList.innerHTML = "";
    toolbar.style.display = "none";
    actionsRow.style.display = "none";
    pages = [];
    sourceName = stripExt(file.name);
    setStatus(status, "info", "กำลังโหลดและสร้างภาพตัวอย่างหน้า PDF...");

    try {
      originalBytes = await readFileAsArrayBuffer(file);
      const pdf = await loadPdfDocument(originalBytes.slice(0));
      const count = pdf.numPages;
      buildToolbar();
      buildActions();

      for (let i = 1; i <= count; i++) {
        const page = await pdf.getPage(i);
        const canvas = await renderPageToCanvas(page, 0.35);
        pages.push({ origIndex: i - 1, rotationDelta: 0, removed: false, canvas });
        renderGrid();
        setProgress(progressBar, progressBar.querySelector(".fill"), (i / count) * 100);
      }
      setProgress(progressBar, progressBar.querySelector(".fill"), null);
      setStatus(status, "success", `โหลดสำเร็จ ${count} หน้า — คลิกไอคอนบนแต่ละหน้าเพื่อลบ/หมุน หรือลากเพื่อสลับตำแหน่ง`);
    } catch (err) {
      console.error(err);
      setStatus(status, "error", "ไม่สามารถอ่านไฟล์ PDF นี้ได้: " + err.message);
    }
  }

  function buildToolbar() {
    toolbar.style.display = "flex";
    toolbar.innerHTML = "";
    const mk = (label, onclick, extraClass = "secondary") =>
      el("button", { class: "btn " + extraClass, type: "button", onclick }, label);

    toolbar.appendChild(mk("เลือกทั้งหมด", () => { pages.forEach(p => p.removed = false); renderGrid(); }));
    toolbar.appendChild(mk("ไม่เลือกทั้งหมด", () => { pages.forEach(p => p.removed = true); renderGrid(); }));
    toolbar.appendChild(mk("สลับการเลือก", () => { pages.forEach(p => p.removed = !p.removed); renderGrid(); }));
    toolbar.appendChild(el("span", { class: "sep" }));
    toolbar.appendChild(mk("ลบหน้าที่เลือกไว้ทั้งหมด", () => { pages.forEach(p => { if (!p.removed) p.removed = true; }); renderGrid(); }, "danger"));
    const badge = el("span", { class: "count-badge" });
    toolbar.appendChild(badge);
    toolbar._badge = badge;
  }

  function buildActions() {
    actionsRow.style.display = "flex";
    actionsRow.innerHTML = "";
    const exportBtn = el("button", { class: "btn", type: "button", onclick: exportPdf }, "⬇ ส่งออกเป็น PDF ใหม่");
    actionsRow.appendChild(exportBtn);
  }

  function renderGrid() {
    grid.innerHTML = "";
    const kept = pages.filter(p => !p.removed).length;
    if (toolbar._badge) toolbar._badge.textContent = `เก็บไว้ ${kept} / ${pages.length} หน้า`;

    pages.forEach((p, idx) => {
      const imgWrap = el("div", { class: "thumb-wrap" }, [
        (() => {
          const img = document.createElement("img");
          img.src = p.canvas.toDataURL("image/png");
          img.style.transform = `rotate(${p.rotationDelta}deg)`;
          return img;
        })(),
      ]);

      const card = el("div", {
        class: "page-card" + (p.removed ? " removed" : ""),
        draggable: "true",
        "data-idx": idx,
      }, [
        imgWrap,
        el("div", { class: "bar" }, [
          el("span", { class: "pageno" }, `#${idx + 1}`),
          el("span", { style: "color:var(--text-dim)" }, `เดิมหน้า ${p.origIndex + 1}`),
          el("span", { class: "bar-actions" }, [
            el("button", { class: "mini-btn", title: "หมุนซ้าย", type: "button", onclick: () => { p.rotationDelta = (p.rotationDelta - 90 + 360) % 360; renderGrid(); } }, "⟲"),
            el("button", { class: "mini-btn", title: "หมุนขวา", type: "button", onclick: () => { p.rotationDelta = (p.rotationDelta + 90) % 360; renderGrid(); } }, "⟳"),
            el("button", { class: "mini-btn danger", title: p.removed ? "กู้คืนหน้านี้" : "ลบหน้านี้", type: "button", onclick: () => { p.removed = !p.removed; renderGrid(); } }, p.removed ? "↺" : "🗑"),
          ]),
        ]),
      ]);
      grid.appendChild(card);
    });

    enableDragReorder(grid, ".page-card", (from, to) => {
      const [moved] = pages.splice(from, 1);
      pages.splice(to, 0, moved);
      renderGrid();
    });
  }

  async function exportPdf() {
    const kept = pages.filter(p => !p.removed);
    if (!kept.length) {
      setStatus(status, "error", "กรุณาเก็บไว้อย่างน้อย 1 หน้า ก่อนส่งออก");
      return;
    }
    setStatus(status, "info", "กำลังสร้างไฟล์ PDF ใหม่...");
    resultList.innerHTML = "";
    try {
      const { PDFDocument, degrees } = PDFLib;
      const srcDoc = await PDFDocument.load(originalBytes.slice(0));
      const newDoc = await PDFDocument.create();
      const indices = kept.map(p => p.origIndex);
      const copied = await newDoc.copyPages(srcDoc, indices);
      copied.forEach((pg, i) => {
        const delta = kept[i].rotationDelta;
        if (delta) pg.setRotation(degrees(pg.getRotation().angle + delta));
        newDoc.addPage(pg);
      });
      const bytes = await newDoc.save();
      const blob = new Blob([bytes], { type: "application/pdf" });
      const filename = `${sourceName}-edited.pdf`;
      downloadBlob(blob, filename);
      setStatus(status, "success", `สร้างไฟล์สำเร็จ (${kept.length} หน้า) และเริ่มดาวน์โหลดแล้ว`);
      resultList.appendChild(el("div", { class: "result-row" }, [
        el("span", {}, "✅"),
        el("span", { class: "name" }, filename),
      ]));
    } catch (err) {
      console.error(err);
      setStatus(status, "error", "สร้างไฟล์ไม่สำเร็จ: " + err.message);
    }
  }
}
