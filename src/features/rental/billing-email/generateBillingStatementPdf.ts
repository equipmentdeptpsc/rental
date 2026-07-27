import type { InvoiceDocument } from "@/features/rental/workspace/invoice/InvoiceDocumentBuilder";
import { organizationBranding } from "../../../shared/branding/organizationBranding";

const encoder = new TextEncoder();
const escapePdf = (value: string) => value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
const ascii = (value: unknown) => String(value ?? "").normalize("NFKD").replace(/[^\x20-\x7E]/g, "");
const money = (value: number, currency: string) => `${currency} ${value.toFixed(2)}`;
const short = (value: unknown, length: number) => {
  const text = ascii(value);
  return text.length <= length ? text : `${text.slice(0, Math.max(0, length - 3))}...`;
};

export function billingStatementPdfText(document: InvoiceDocument, preparedBy = "Administrator") {
  return [
    organizationBranding.companyName.toUpperCase(),
    organizationBranding.departmentName,
    "BILLING STATEMENT",
    organizationBranding.systemName,
    `Billing Statement Number: ${document.statementNo}`,
    `Rental Number: ${document.rentalNumber}`,
    `Billing Period: ${document.billingFrom} to ${document.billingTo}`,
    `Statement Date: ${document.statementDate.slice(0, 10)}`,
    `Status: ${document.status}`,
    `Customer: ${document.customer}`,
    `Customer Representative: ${document.customerRepresentativeName ?? "Not provided"}`,
    `Representative Email: ${document.customerRepresentativeEmail ?? "Not provided"}`,
    `Project: ${document.project}`,
    "DEUR | DATE | EQUIPMENT / OPERATOR | DESCRIPTION | METHOD | QTY | RATE | AMOUNT",
    ...document.lines.map((line) => `${line.deurReference ?? "DEUR reference unavailable"} | ${line.workDate} | ${line.equipmentLabel} / ${line.operatorLabel} | ${line.description} | ${line.billingMethod ?? "Not recorded"} | ${line.quantity !== undefined ? line.quantity.toFixed(2) : (line.hours ?? 0).toFixed(2)} | ${money(line.unitRate ?? line.hourlyRate, document.currency)} | ${money(line.grandTotal ?? line.amount, document.currency)}`),
    `Subtotal: ${money(document.subtotal, document.currency)}`,
    ...(document.optionalChargeTotals ?? []).map(charge=>`${charge.label}: ${money(charge.amount,document.currency)}`),
    ...(document.vatApplicable ? [`VAT: ${money(document.vat ?? 0, document.currency)}`] : []),
    ...(document.withholdingTaxApplicable ? [`Withholding Tax: (${money(document.withholdingTax ?? 0, document.currency)})`] : []),
    `GRAND TOTAL: ${money(document.grandTotal, document.currency)}`,
    ...(document.amountCollected !== undefined ? [`Amount Collected: ${money(document.amountCollected, document.currency)}`] : []),
    ...(document.outstandingBalance !== undefined ? [`Outstanding Amount: ${money(document.outstandingBalance, document.currency)}`] : []),
    `Prepared By: ${preparedBy}`,
    organizationBranding.documentFooter,
  ].map(ascii);
}

interface PngImage { width: number; height: number; data: Uint8Array }
function readPng(bytes?: Uint8Array): PngImage | undefined {
  if (!bytes || bytes.length < 33 || String.fromCharCode(...bytes.slice(1, 4)) !== "PNG") return undefined;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16); const height = view.getUint32(20);
  const bitDepth = bytes[24]; const colorType = bytes[25];
  if (bitDepth !== 8 || colorType !== 2) return undefined;
  const chunks: Uint8Array[] = [];
  for (let offset = 8; offset + 12 <= bytes.length;) {
    const length = view.getUint32(offset); const type = String.fromCharCode(...bytes.slice(offset + 4, offset + 8));
    if (type === "IDAT") chunks.push(bytes.slice(offset + 8, offset + 8 + length));
    offset += 12 + length;
    if (type === "IEND") break;
  }
  const data = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0));
  let cursor = 0; for (const chunk of chunks) { data.set(chunk, cursor); cursor += chunk.length; }
  return chunks.length ? { width, height, data } : undefined;
}

const text = (value: string, x: number, y: number, size = 8) => `BT /F1 ${size} Tf ${x} ${y} Td (${escapePdf(short(value, 90))}) Tj ET`;
const rightText = (value: string, right: number, y: number, size = 8) => text(value, right - ascii(value).length * size * .48, y, size);

function pageContent(document: InvoiceDocument, pageLines: InvoiceDocument["lines"], pageIndex: number, pageCount: number, preparedBy: string, hasLogo: boolean) {
  const commands: string[] = [];
  if (hasLogo) commands.push("q 120 0 0 50.72 36 750 cm /Logo Do Q");
  commands.push(text(organizationBranding.companyName.toUpperCase(), 172, 791, 12));
  commands.push(text(organizationBranding.departmentName, 172, 776, 9));
  commands.push(text("BILLING STATEMENT", 172, 754, 17));
  commands.push(text(organizationBranding.systemName, 172, 740, 8));
  commands.push("0.75 G 36 730 m 576 730 l S");

  let tableTop = 680;
  if (pageIndex === 0) {
    commands.push(text(`Statement No.: ${document.statementNo}`, 36, 713, 9));
    commands.push(text(`Rental No.: ${document.rentalNumber}`, 215, 713, 9));
    commands.push(text(`Status: ${document.status}`, 430, 713, 9));
    commands.push(text(`Billing Period: ${document.billingFrom} to ${document.billingTo}`, 36, 697, 8));
    commands.push(text(`Statement Date: ${document.statementDate.slice(0,10)}`, 330, 697, 8));
    commands.push(text(`Customer: ${document.customer}`, 36, 675, 8));
    commands.push(text(`Representative: ${document.customerRepresentativeName ?? "Not provided"}`, 300, 675, 8));
    commands.push(text(`Email: ${document.customerRepresentativeEmail ?? "Not provided"}`, 36, 660, 8));
    commands.push(text(`Project: ${document.project}`, 300, 660, 8));
    const first = document.lines[0];
    commands.push(text(`Equipment: ${first?.equipmentLabel ?? "Not provided"}`, 36, 645, 8));
    commands.push(text(`Operator: ${first?.operatorLabel ?? "Not provided"}`, 300, 645, 8));
    tableTop = 620;
  }

  commands.push("0.92 g 36 " + tableTop + " 540 20 re f 0 g");
  const headers = [["DEUR",38],["DATE",96],["EQUIPMENT / OPERATOR",148],["DESCRIPTION",278],["METHOD",388],["QTY",442],["RATE",479],["AMOUNT",532]] as const;
  headers.forEach(([label,x]) => commands.push(text(label,x,tableTop+7,6.5)));
  commands.push(`0.7 G 36 ${tableTop} m 576 ${tableTop} l S`);
  pageLines.forEach((line, index) => {
    const y = tableTop - 19 - index * 24;
    commands.push(text(line.deurReference ?? "Unavailable",38,y,6.5));
    commands.push(text(line.workDate,96,y,6.5));
    commands.push(text(short(line.equipmentLabel,20),148,y+4,6.5));
    commands.push(text(short(line.operatorLabel,20),148,y-5,6));
    commands.push(text(short(line.description,24),278,y,6.5));
    commands.push(text(short(line.billingMethod ?? "-",10),388,y,6.5));
    commands.push(rightText(line.quantity !== undefined ? line.quantity.toFixed(2) : (line.hours ?? 0).toFixed(2),467,y,6.5));
    commands.push(rightText(money(line.unitRate ?? line.hourlyRate,document.currency),523,y,6.5));
    commands.push(rightText(money(line.grandTotal ?? line.amount,document.currency),574,y,6.5));
    commands.push(`0.88 G 36 ${y-9} m 576 ${y-9} l S`);
  });

  if (pageIndex === pageCount - 1) {
    let y = Math.max(118, tableTop - 30 - pageLines.length * 24);
    const total = (label: string, value: string, strong = false) => {
      commands.push(text(label,410,y,strong?9:8)); commands.push(rightText(value,574,y,strong?9:8)); y -= 15;
    };
    total("Subtotal", money(document.subtotal,document.currency));
    for (const charge of document.optionalChargeTotals ?? []) total(charge.label,money(charge.amount,document.currency));
    if (document.vatApplicable) total("VAT", money(document.vat ?? 0,document.currency));
    if (document.withholdingTaxApplicable) total("Withholding Tax", `(${money(document.withholdingTax ?? 0,document.currency)})`);
    commands.push(`0.5 G 408 ${y+8} m 576 ${y+8} l S`);
    total("GRAND TOTAL",money(document.grandTotal,document.currency),true);
    if (document.amountCollected !== undefined) total("Amount Collected",money(document.amountCollected,document.currency));
    if (document.outstandingBalance !== undefined) total("Outstanding Amount",money(document.outstandingBalance,document.currency));
    commands.push(text(`Prepared by: ${preparedBy}`,36,90,7));
    commands.push(text(`Generated on ${new Date().toLocaleString("en-PH")}`,36,78,7));
  }
  commands.push("0.75 G 36 48 m 576 48 l S");
  commands.push(text(organizationBranding.documentFooter,36,33,7));
  commands.push(text(organizationBranding.systemName,36,22,7));
  commands.push(rightText(`Page ${pageIndex+1} of ${pageCount}`,576,22,7));
  return commands.join("\n");
}

function concat(parts: Uint8Array[]) {
  const output = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0; for (const part of parts) { output.set(part, offset); offset += part.length; }
  return output;
}

export function generateBillingStatementPdf(document: InvoiceDocument, preparedBy = "Administrator", logoPng?: Uint8Array): Uint8Array {
  const png = readPng(logoPng);
  const rowsPerPage = 18;
  const pageChunks = Array.from({ length: Math.max(1, Math.ceil(document.lines.length / rowsPerPage)) }, (_, index) => document.lines.slice(index * rowsPerPage, (index + 1) * rowsPerPage));
  const fontId = 3 + pageChunks.length * 2;
  const imageId = png ? fontId + 1 : undefined;
  const pageIds = pageChunks.map((_, index) => 3 + index * 2);
  const objects: Uint8Array[] = [
    encoder.encode("<< /Type /Catalog /Pages 2 0 R >>"),
    encoder.encode(`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageChunks.length} >>`),
  ];
  pageChunks.forEach((lines, index) => {
    const contentId = 4 + index * 2;
    const resources = `/Font << /F1 ${fontId} 0 R >>${imageId ? ` /XObject << /Logo ${imageId} 0 R >>` : ""}`;
    const content = encoder.encode(pageContent(document, lines, index, pageChunks.length, preparedBy, Boolean(png)));
    objects.push(encoder.encode(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources << ${resources} >> /Contents ${contentId} 0 R >>`));
    objects.push(concat([encoder.encode(`<< /Length ${content.length} >>\nstream\n`),content,encoder.encode("\nendstream")]));
  });
  objects.push(encoder.encode("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"));
  if (png) objects.push(concat([encoder.encode(`<< /Type /XObject /Subtype /Image /Width ${png.width} /Height ${png.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /DecodeParms << /Predictor 15 /Colors 3 /BitsPerComponent 8 /Columns ${png.width} >> /Length ${png.data.length} >>\nstream\n`),png.data,encoder.encode("\nendstream")]));

  const parts: Uint8Array[] = [encoder.encode("%PDF-1.4\n")];
  const offsets = [0]; let length = parts[0].length;
  objects.forEach((object,index)=>{offsets.push(length);const wrapped=concat([encoder.encode(`${index+1} 0 obj\n`),object,encoder.encode("\nendobj\n")]);parts.push(wrapped);length+=wrapped.length;});
  const xref = length;
  parts.push(encoder.encode(`xref\n0 ${objects.length+1}\n0000000000 65535 f \n${offsets.slice(1).map(offset=>`${String(offset).padStart(10,"0")} 00000 n `).join("\n")}\ntrailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`));
  return concat(parts);
}
