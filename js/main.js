import { el, $ } from "./utils.js";

const TOOLS = [
  {
    category: "จัดการไฟล์ PDF",
    items: [
      { id: "pageManager", icon: "📑", title: "จัดการหน้า PDF", desc: "เลือกเก็บ/ลบหน้า สลับลำดับ และหมุนหน้า PDF", mod: "./tools/pageManager.js" },
      { id: "pdfMerge", icon: "🔗", title: "รวมไฟล์ PDF", desc: "รวมหลายไฟล์ PDF เป็นไฟล์เดียว", mod: "./tools/pdfMerge.js" },
      { id: "pdfSplit", icon: "✂️", title: "แยกไฟล์ PDF", desc: "แยก PDF ตามหน้าหรือช่วงหน้าที่กำหนด", mod: "./tools/pdfSplit.js" },
      { id: "pdfCompress", icon: "🗜️", title: "บีบอัดไฟล์ PDF", desc: "ลดขนาดไฟล์ PDF ที่มีรูปภาพเยอะหรือสแกนมา", mod: "./tools/pdfCompress.js" },
      { id: "pdfOcr", icon: "🔍", title: "OCR อ่านข้อความจากภาพสแกน", desc: "อ่านตัวอักษรใน PDF สแกน สร้าง PDF ที่ค้นหาข้อความได้ หรือดึงเป็น TXT", mod: "./tools/pdfOcr.js" },
    ],
  },
  {
    category: "แปลงจาก PDF",
    items: [
      { id: "pdfToImages", icon: "🖼️", title: "PDF → รูปภาพ", desc: "แปลงหน้า PDF เป็น PNG หรือ JPG", mod: "./tools/pdfToImages.js" },
      { id: "pdfToText", icon: "📄", title: "PDF → ข้อความ", desc: "ดึงข้อความออกมาเป็นไฟล์ TXT", mod: "./tools/pdfToText.js" },
      { id: "pdfToWord", icon: "📝", title: "PDF → Word", desc: "แปลงเนื้อหา PDF เป็นเอกสาร DOCX", mod: "./tools/pdfToWord.js" },
      { id: "pdfToExcel", icon: "📊", title: "PDF → Excel", desc: "จับตารางใน PDF แปลงเป็นไฟล์ XLSX", mod: "./tools/pdfToExcel.js" },
    ],
  },
  {
    category: "แปลงเป็น PDF",
    items: [
      { id: "wordToPdf", icon: "📘", title: "Word → PDF", desc: "แปลงเอกสาร DOCX เป็น PDF", mod: "./tools/wordToPdf.js" },
      { id: "excelToPdf", icon: "📕", title: "Excel → PDF", desc: "แปลงแต่ละชีทของ Excel เป็นตารางใน PDF", mod: "./tools/excelToPdf.js" },
      { id: "imagesToPdf", icon: "🧩", title: "รูปภาพ → PDF", desc: "รวมรูปภาพหลายไฟล์เป็น PDF เดียว", mod: "./tools/imagesToPdf.js" },
    ],
  },
  {
    category: "รูปภาพ",
    items: [
      { id: "imageConvert", icon: "🔄", title: "แปลงชนิดไฟล์รูปภาพ", desc: "สลับไปมาระหว่าง PNG, JPG, WEBP, BMP", mod: "./tools/imageConvert.js" },
    ],
  },
];

const home = $("#home-view");
const toolView = $("#tool-view");
const toolContainer = $("#tool-container");
const backBtn = $("#back-btn");
const logo = $("#logo");

function buildHome() {
  TOOLS.forEach((group) => {
    home.appendChild(el("div", { class: "category-label" }, group.category));
    const grid = el("div", { class: "tool-grid" });
    group.items.forEach((tool) => {
      const card = el("button", { class: "tool-card", type: "button", onclick: () => openTool(tool) }, [
        el("div", { class: "icon" }, tool.icon),
        el("h3", {}, tool.title),
        el("p", {}, tool.desc),
      ]);
      grid.appendChild(card);
    });
    home.appendChild(grid);
  });
}

const mountedCache = new Map();

async function openTool(tool) {
  home.classList.remove("active");
  toolView.classList.add("active");
  backBtn.classList.add("show");
  toolContainer.innerHTML = "";
  const loading = el("div", { class: "empty-hint" }, "กำลังโหลดเครื่องมือ...");
  toolContainer.appendChild(loading);
  try {
    const mod = await import(tool.mod);
    toolContainer.innerHTML = "";
    mod.mount(toolContainer);
  } catch (err) {
    console.error(err);
    toolContainer.innerHTML = "";
    toolContainer.appendChild(el("div", { class: "status-msg show error" }, "โหลดเครื่องมือไม่สำเร็จ: " + err.message));
  }
}

function goHome() {
  toolView.classList.remove("active");
  home.classList.add("active");
  backBtn.classList.remove("show");
}

backBtn.addEventListener("click", goHome);
logo.addEventListener("click", goHome);

buildHome();
home.classList.add("active");
