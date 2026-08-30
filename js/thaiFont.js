// jsPDF's built-in fonts only cover WinAnsi (Latin) glyphs, so anything
// that draws Thai text with jsPDF needs a real Thai-capable TTF embedded
// first. This fetches one from a public CDN once, caches it in memory,
// and registers it on a given jsPDF document.

const FONT_NAME = "NotoSansThai";
const CANDIDATE_URLS = [
  "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/notosansthai/NotoSansThai%5Bwdth,wght%5D.ttf",
  "https://raw.githubusercontent.com/google/fonts/main/ofl/notosansthai/NotoSansThai%5Bwdth,wght%5D.ttf",
];

let cachedBase64 = null;
let cachedPromise = null;

function arrayBufferToBase64(buf) {
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

async function fetchThaiFontBase64() {
  let lastErr;
  for (const url of CANDIDATE_URLS) {
    try {
      const resp = await fetch(url);
      if (!resp.ok) throw new Error("HTTP " + resp.status);
      const buf = await resp.arrayBuffer();
      return arrayBufferToBase64(buf);
    } catch (err) {
      lastErr = err;
    }
  }
  throw new Error("โหลดฟอนต์ภาษาไทยไม่สำเร็จ: " + (lastErr ? lastErr.message : "unknown error"));
}

export function getThaiFontBase64() {
  if (cachedBase64) return Promise.resolve(cachedBase64);
  if (!cachedPromise) {
    cachedPromise = fetchThaiFontBase64().then((b64) => { cachedBase64 = b64; return b64; });
  }
  return cachedPromise;
}

// Registers the Thai font on the given jsPDF instance and sets it active.
// Returns the font name to pass to doc.setFont(...) later if needed.
//
// The same regular-weight file is also registered under the "bold" and
// "italic" style keys. There's only one real weight available here, but
// without this jsPDF falls back to its built-in Helvetica for those
// styles whenever code calls setFont(name, "bold") — and Helvetica has
// no Thai glyphs, so Thai text silently renders as mojibake instead of
// just "not actually bold".
export async function registerThaiFont(doc) {
  const base64 = await getThaiFontBase64();
  doc.addFileToVFS(FONT_NAME + ".ttf", base64);
  doc.addFont(FONT_NAME + ".ttf", FONT_NAME, "normal");
  doc.addFont(FONT_NAME + ".ttf", FONT_NAME, "bold");
  doc.addFont(FONT_NAME + ".ttf", FONT_NAME, "italic");
  doc.setFont(FONT_NAME);
  return FONT_NAME;
}

export const THAI_FONT_NAME = FONT_NAME;
