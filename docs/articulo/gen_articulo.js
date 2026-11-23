// Genera el articulo IEEE de la Entrega 2 (docx) a partir de datos/resultados.json
// Uso: node gen_articulo.js  -> Entrega2_Arduino_IEEE_Ortiz_Perea.docx
const fs = require("fs");
const path = require("path");
const {
  Document, Packer, Paragraph, TextRun, ImageRun, Table, TableRow, TableCell, AlignmentType,
  SectionType, WidthType, BorderStyle, ShadingType, TabStopType, LineRuleType, ExternalHyperlink,
  PageNumber, Footer,
} = require("docx");

const RAIZ = path.resolve(__dirname, "../..");
const R = JSON.parse(fs.readFileSync(path.join(RAIZ, "datos/resultados.json"))).configuraciones;
const FIG = (n) => path.join(RAIZ, "figuras", n);
const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, "config.json")));

// ---------- formato numerico en espanol ----------
function num(x, d = 1) {
  const s = Number(x).toFixed(d);
  let [e, f] = s.split(".");
  const neg = e.startsWith("-");
  if (neg) e = e.slice(1);
  if (e.length > 4) e = e.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return (neg ? "−" : "") + e + (f ? "," + f : "");
}
const pct = (x, d = 1) => num(x, d) + " %";

// ---------- estilos ----------
const FUENTE = "Times New Roman";
const T = 20; // 10 pt cuerpo
function runs(texto, base = {}) {
  // *cursiva*, **negrita**, `mono`
  const out = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  let i = 0, m;
  while ((m = re.exec(texto))) {
    if (m.index > i) out.push(new TextRun({ text: texto.slice(i, m.index), font: FUENTE, size: T, ...base }));
    const t = m[0];
    if (t.startsWith("**")) out.push(new TextRun({ text: t.slice(2, -2), bold: true, font: FUENTE, size: T, ...base }));
    else if (t.startsWith("*")) out.push(new TextRun({ text: t.slice(1, -1), italics: true, font: FUENTE, size: T, ...base }));
    else out.push(new TextRun({ text: t.slice(1, -1), font: "Courier New", size: T - 2, ...base }));
    i = m.index + t.length;
  }
  if (i < texto.length) out.push(new TextRun({ text: texto.slice(i), font: FUENTE, size: T, ...base }));
  return out;
}
const P = (texto, o = {}) => new Paragraph({
  children: runs(texto, o.run || {}), alignment: o.align || AlignmentType.JUSTIFIED,
  indent: o.noIndent ? undefined : { firstLine: 202 }, spacing: { after: 0, line: 228, lineRule: LineRuleType.AUTO, ...(o.spacing || {}) },
  keepNext: o.keepNext,
});
const H1 = (romano, texto) => new Paragraph({
  children: [...(romano ? [new TextRun({ text: `${romano}. `, font: FUENTE, size: T })] : []), new TextRun({ text: texto.toUpperCase(), font: FUENTE, size: 16 })],
  alignment: AlignmentType.CENTER, spacing: { before: 160, after: 80 }, keepNext: true,
});
const H2 = (letra, texto) => new Paragraph({
  children: [new TextRun({ text: `${letra}. ${texto}`, italics: true, font: FUENTE, size: T })],
  spacing: { before: 100, after: 40 }, keepNext: true,
});
const VINETA = (texto) => new Paragraph({
  children: [new TextRun({ text: "•  ", font: FUENTE, size: T }), ...runs(texto)],
  alignment: AlignmentType.JUSTIFIED, indent: { left: 200, hanging: 160 }, spacing: { after: 0, line: 228 },
});
const ECUACION = (texto, n) => new Paragraph({
  children: [new TextRun({ text: "\t" + texto, italics: true, font: FUENTE, size: T }), new TextRun({ text: `\t(${n})`, font: FUENTE, size: T })],
  tabStops: [{ type: TabStopType.CENTER, position: 2520 }, { type: TabStopType.RIGHT, position: 5040 }],
  spacing: { before: 60, after: 60 },
});
const CODIGO = (lineas) => lineas.map((l, k) => new Paragraph({
  children: [new TextRun({ text: l.length ? l : " ", font: "Courier New", size: 14 })],
  spacing: { after: 0, line: 180, before: k === 0 ? 60 : 0 }, keepLines: true,
}));
let nFig = 0;
function FIGURA(archivo, ancho, alto, pie) {
  nFig++;
  return [
    new Paragraph({ children: [new ImageRun({ type: "png", data: fs.readFileSync(FIG(archivo)), transformation: { width: ancho, height: alto } })],
      alignment: AlignmentType.CENTER, spacing: { before: 80, after: 40 }, keepNext: true }),
    new Paragraph({ children: [new TextRun({ text: `Fig. ${nFig}. `, font: FUENTE, size: 16 }), ...runs(pie, { size: 16 })],
      alignment: AlignmentType.JUSTIFIED, spacing: { after: 120 } }),
  ];
}
function tamPng(archivo, anchoPx) {
  const b = fs.readFileSync(FIG(archivo));
  const w = b.readUInt32BE(16), h = b.readUInt32BE(20);
  return [anchoPx, Math.round(anchoPx * h / w)];
}
function FIG_COL(archivo, pie, ancho = 325) {
  const [w, h] = tamPng(archivo, ancho);
  return FIGURA(archivo, w, h, pie);
}
let nTab = 0;
const ROMANOS = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII"];
function TABLA(titulo, cab, filas, anchos) {
  const total = anchos.reduce((a, b) => a + b, 0);
  const borde = { style: BorderStyle.SINGLE, size: 4, color: "000000" };
  const nada = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
  const celda = (t, i, esCab, ultima) => new TableCell({
    width: { size: anchos[i], type: WidthType.DXA },
    borders: { top: esCab ? borde : nada, bottom: esCab || ultima ? borde : nada, left: nada, right: nada },
    margins: { top: 20, bottom: 20, left: 50, right: 50 },
    children: [new Paragraph({ children: runs(t, { size: 15, bold: false }), alignment: i === 0 ? AlignmentType.LEFT : AlignmentType.LEFT, spacing: { after: 0 } })],
  });
  nTab++;
  return [
    new Paragraph({ children: [new TextRun({ text: `TABLA ${ROMANOS[nTab - 1]}`, font: FUENTE, size: 16 })], alignment: AlignmentType.CENTER, spacing: { before: 120, after: 0 }, keepNext: true }),
    new Paragraph({ children: [new TextRun({ text: titulo.toUpperCase(), font: FUENTE, size: 14 })], alignment: AlignmentType.CENTER, spacing: { after: 60 }, keepNext: true }),
    new Table({
      width: { size: total, type: WidthType.DXA }, columnWidths: anchos,
      rows: [new TableRow({ children: cab.map((t, i) => celda(t, i, true, false)), tableHeader: true }),
        ...filas.map((f, k) => new TableRow({ children: f.map((t, i) => celda(t, i, false, k === filas.length - 1)), cantSplit: true }))],
    }),
    new Paragraph({ children: [], spacing: { after: 80 } }),
  ];
}

// ---------- datos ----------
const S = R.v2_sleep_avance_rapido, SR = R.v2_sleep_tiempo_real, B = R.v2_busy, V1 = R.v1_bloqueante, OR = R.v2_simavr_original;
const fb = S.fase_B, fc = S.fase_C, fd = S.fase_D, fe = S.fase_E, ff = S.fase_F, cpu = S.cpu;
const A_ok = S.fase_A.filter((x) => x.correcta).length, A_n = S.fase_A.length;
const hS = S.anfitrion, hR = SR.anfitrion, hB = B.anfitrion;
const W = cfg.wokwi || {};
const v1C = V1.fase_C, v1D = V1.fase_D;
const v1ErrTot = V1.telemetria[V1.telemetria.length - 1].err;
const v1LoopsMin = Math.min(...V1.telemetria.filter((x) => x.t_us > 31e6 && x.t_us < 43e6).map((x) => x.loops));
const v1CpuMax = Math.max(...V1.telemetria.map((x) => x.cpu));
const busyCpu = B.cpu.firmware_global_pct;
const busyLoops = B.telemetria.filter((x) => x.t_us > 3e6 && x.t_us < 10e6).map((x) => x.loops);
const busyLoopsMed = busyLoops.reduce((a, b) => a + b, 0) / busyLoops.length;
const tA = (o) => S.fase_A.find((x) => x.orden === o);

module.exports = { R, cfg, num, pct, runs, P, H1, H2, VINETA, ECUACION, CODIGO, FIG_COL, TABLA, S, SR, B, V1, OR, fb, fc, fd, fe, ff, cpu,
  A_ok, A_n, hS, hR, hB, W, v1C, v1D, v1ErrTot, v1LoopsMin, v1CpuMax, busyCpu, busyLoopsMed, tA, FUENTE, T, Paragraph, TextRun,
  AlignmentType, ExternalHyperlink, Document, Packer, SectionType, Footer, PageNumber, LineRuleType };

if (require.main === module) require("./contenido.js");
