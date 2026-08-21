import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { organizationBranding } from "@/shared/branding/organizationBranding";
import OrganizationBrand from "@/shared/branding/OrganizationBrand";
import { buildInvoiceDocument } from "@/features/rental/workspace/invoice/InvoiceDocumentBuilder";
import InvoiceDocumentView from "@/features/rental/workspace/invoice/InvoiceDocumentView";
import { billingStatementPdfText, generateBillingStatementPdf } from "@/features/rental/billing-email/generateBillingStatementPdf";
import type { BillingStatement, BillingStatementLine } from "@/features/rental/billingstatement/types";

const line = (index=1): BillingStatementLine => ({
  id:`line-${index}`,deurId:`internal-deur-${index}`,deurReference:`DEUR-${String(index).padStart(6,"0")} R1`,
  rentalEquipmentLineId:`rental-line-${index}`,equipmentId:`internal-equipment-${index}`,equipmentLabel:`Excavator ${index} (ME-${String(index).padStart(6,"0")})`,
  operatorId:`internal-operator-${index}`,operatorLabel:`Operator ${index}`,workDate:"2026-07-27",description:`Equipment rental work ${index}`,
  costCode:"RENT",billingMethod:"Per Hour",hours:1.5,hourlyRate:100,amount:150,operatingCharge:150,grandTotal:168,
});
const statement = (tax:{vat?:boolean;withholding?:boolean}={}):BillingStatement => {
  const lines=[line()];
  return {id:"internal-statement-uuid",statementNo:"BS-000001",version:1,rentalId:"internal-rental-uuid",rentalNumber:"RENT-000001",
    customer:"Customer Corporation",customerRepresentativeName:"Customer Representative",customerRepresentativeEmail:"customer@example.test",
    equipmentId:"",operatorId:"",project:"Customer Project",billingFrom:"2026-07-01",billingTo:"2026-07-31",subtotal:150,
    vatApplicable:Boolean(tax.vat),...(tax.vat?{vat:18}:{}),withholdingTaxApplicable:Boolean(tax.withholding),...(tax.withholding?{withholdingTax:3}:{}),
    grandTotal:165,approvalStatus:"Approved",invoiceStatus:"Invoiced",lines,createdBy:"Administrator",createdAt:"2026-07-27T09:00:00.000Z"};
};

describe("Primary Structures Corporation branding and Billing Statement PDF",()=>{
  it("centralizes the approved identity and static logo path",()=>{
    expect(organizationBranding).toMatchObject({companyName:"Primary Structures Corporation",departmentName:"Equipment Department",systemName:"Equipment Rental Management System",logoAssetPath:"/branding/primary-structures-corporation-logo.png"});
    expect(readFileSync("public/branding/primary-structures-corporation-logo.png").subarray(1,4).toString()).toBe("PNG");
    const html=renderToStaticMarkup(createElement(OrganizationBrand));
    expect(html).toContain("Primary Structures Corporation logo");
    expect(html).toContain("Primary Structures Corporation");
    expect(html).toContain("Equipment Department");
    expect(html).toContain("Equipment Rental Management System");
  });

  it("renders a branded valid PDF with a tabular business-reference row, footer, and embedded logo",()=>{
    const document=buildInvoiceDocument(statement({vat:true}));
    const logo=new Uint8Array(readFileSync("public/branding/primary-structures-corporation-logo.png"));
    const pdf=generateBillingStatementPdf(document,"Administrator",logo);
    const decoded=new TextDecoder("latin1").decode(pdf);
    const semantic=billingStatementPdfText(document);
    expect(decoded.startsWith("%PDF-1.4")).toBe(true);
    expect(decoded).toContain("/Subtype /Image");
    expect(decoded).toContain("Page 1 of 1");
    expect(decoded).toContain("DEUR");
    expect(semantic).toEqual(expect.arrayContaining(["PRIMARY STRUCTURES CORPORATION","Equipment Department","BILLING STATEMENT"]));
    expect(semantic.join(" ")).toContain("DEUR-000001 R1");
    expect(semantic.join(" ")).toContain("Excavator 1 (ME-000001)");
    expect(semantic.join(" ")).toContain("Operator 1");
    expect(semantic.join(" ")).not.toContain("internal-rental-uuid");
  });

  it("repeats the table header and numbers pages for multi-line statements",()=>{
    const source=statement();source.lines=Array.from({length:38},(_,index)=>line(index+1));source.subtotal=5700;source.grandTotal=5700;
    const pdfText=new TextDecoder("latin1").decode(generateBillingStatementPdf(buildInvoiceDocument(source)));
    expect(pdfText).toContain("/Count 3");
    expect((pdfText.match(/EQUIPMENT/g)??[])).toHaveLength(3);
    expect(pdfText).toContain("Page 1 of 3");
    expect(pdfText).toContain("Page 3 of 3");
  });

  it.each([
    ["neither",false,false],
    ["VAT only",true,false],
    ["withholding only",false,true],
    ["both",true,true],
  ])("uses frozen independent tax visibility for %s",(_,vat,withholding)=>{
    const document=buildInvoiceDocument(statement({vat,withholding}));
    const html=renderToStaticMarkup(createElement(InvoiceDocumentView,{document}));
    const pdfText=billingStatementPdfText(document).join("\n");
    expect(html.includes(">VAT<")).toBe(vat);
    expect(html.includes(">Withholding tax<")).toBe(withholding);
    expect(pdfText.includes("VAT:")).toBe(vat);
    expect(pdfText.includes("Withholding Tax:")).toBe(withholding);
  });
});
