// Renders a Markdown guide in docs/ into a print-ready PDF.
//   node tools/build_guide_pdf.js docs/Accidiox_Demo_Video_and_Pitch_Guide.md
// Supports: # / ## / ### headings, - bullets, 1. numbered lists, > quotes,
// --- page breaks, **bold**, `code`, and plain paragraphs. No HTML, no
// headless browser, so it runs offline.
const fs = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit");

const src = process.argv[2] || "docs/Accidiox_Demo_Video_and_Pitch_Guide.md";
const out = process.argv[3] || src.replace(/\.md$/, ".pdf");

const INK = "#14161a";
const MUTED = "#5b616b";
const BRAND = "#dc2626";
const RULE = "#e3e5e9";

const doc = new PDFDocument({ size: "A4", margins: { top: 64, bottom: 64, left: 64, right: 64 }, autoFirstPage: true });
doc.pipe(fs.createWriteStream(out));

const WIDTH = doc.page.width - 128;

// Splits "**bold** and `code`" into styled runs for pdfkit's continued text.
function runs(text) {
  const parts = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0, m;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push({ t: text.slice(last, m.index), style: "normal" });
    parts.push(m[0].startsWith("**")
      ? { t: m[0].slice(2, -2), style: "bold" }
      : { t: m[0].slice(1, -1), style: "code" });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ t: text.slice(last), style: "normal" });
  return parts;
}

function write(text, { size = 10.5, color = INK, indent = 0, gap = 6, font = "Helvetica", width = WIDTH } = {}) {
  const parts = runs(text);
  doc.fontSize(size).fillColor(color);
  width -= indent;
  parts.forEach((p, i) => {
    doc.font(p.style === "bold" ? "Helvetica-Bold" : p.style === "code" ? "Courier" : font)
       .fillColor(p.style === "code" ? BRAND : color)
       .text(p.t, { width, indent: 0, continued: i < parts.length - 1, lineGap: 2 });
  });
  doc.moveDown(gap / 12);
}

function space(n) { doc.y += n; }
function room(n) { if (doc.y + n > doc.page.height - 64) doc.addPage(); }

const lines = fs.readFileSync(src, "utf8").split(/\r?\n/);
let i = 0;
let firstH1 = true;

while (i < lines.length) {
  const line = lines[i];
  const raw = line.trim();
  i++;

  if (!raw) { space(4); continue; }

  if (raw === "---") { doc.addPage(); continue; }

  if (raw.startsWith("# ")) {
    if (!firstH1) doc.addPage();
    firstH1 = false;
    doc.font("Helvetica-Bold").fontSize(26).fillColor(INK).text(raw.slice(2), { width: WIDTH });
    space(6);
    doc.moveTo(64, doc.y).lineTo(doc.page.width - 64, doc.y).lineWidth(2).strokeColor(BRAND).stroke();
    space(14);
    continue;
  }

  if (raw.startsWith("## ")) {
    room(90);
    space(10);
    doc.font("Helvetica-Bold").fontSize(16).fillColor(INK).text(raw.slice(3), { width: WIDTH });
    space(4);
    doc.moveTo(64, doc.y).lineTo(doc.page.width - 64, doc.y).lineWidth(0.7).strokeColor(RULE).stroke();
    space(10);
    continue;
  }

  if (raw.startsWith("### ")) {
    room(60);
    space(6);
    doc.font("Helvetica-Bold").fontSize(12).fillColor(INK).text(raw.slice(4), { width: WIDTH });
    space(4);
    continue;
  }

  // A line that is only a `code span` (a URL, a filename) stands alone.
  if (/^`[^`]+`$/.test(raw)) {
    room(30);
    write(raw, { size: 10.5 });
    space(2);
    continue;
  }

  // A line that is entirely bold acts as a sub-heading, so the text under it
  // starts its own paragraph instead of running on.
  const label = raw.match(/^\*\*(.+)\*\*$/);
  if (label) {
    room(56);
    space(6);
    doc.font("Helvetica-Bold").fontSize(11.5).fillColor(INK).text(label[1], 64, doc.y, { width: WIDTH });
    space(3);
    continue;
  }

  // Blockquote: pull-out box.
  if (raw.startsWith("> ")) {
    const block = [raw.slice(2)];
    while (i < lines.length && lines[i].trim().startsWith("> ")) block.push(lines[i++].trim().slice(2));
    room(70);
    const top = doc.y;
    doc.save().translate(14, 0);
    write(block.join(" "), { size: 10.5, color: MUTED, indent: 14 });
    doc.restore();
    doc.moveTo(66, top - 2).lineTo(66, doc.y - 2).lineWidth(2.5).strokeColor(BRAND).stroke();
    space(8);
    continue;
  }

  // Bullet / numbered item, including its wrapped continuation lines.
  const bullet = raw.match(/^-\s+(.*)$/);
  const num = raw.match(/^(\d+)\.\s+(.*)$/);
  if (bullet || num) {
    let text = bullet ? bullet[1] : num[2];
    while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !/^\s*[-\d]/.test(lines[i])) {
      text += " " + lines[i].trim();
      i++;
    }
    room(40);
    const marker = bullet ? "•" : `${num[1]}.`;
    const top = doc.y;
    doc.font("Helvetica-Bold").fontSize(10.5).fillColor(bullet ? BRAND : MUTED).text(marker, 64, top, { width: 18 });
    doc.y = top;
    doc.x = 64 + 20;
    write(text, { size: 10.5, width: WIDTH - 20 });
    doc.x = 64;
    space(2);
    continue;
  }

  // Paragraph: join wrapped lines until a blank line or a new block.
  let para = raw;
  while (i < lines.length && lines[i].trim() && !/^(#|-|>|\d+\.|---|\*\*.+\*\*$|`[^`]+`$)/.test(lines[i].trim())) {
    para += " " + lines[i].trim();
    i++;
  }
  room(40);
  write(para, { size: 10.5 });
  space(3);
}

doc.end();
console.log("wrote", path.resolve(out));
