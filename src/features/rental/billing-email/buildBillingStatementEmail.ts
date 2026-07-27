export interface BillingStatementEmailSnapshot {
  statementNumber: string;
  rentalNumber: string;
  customer: string;
  representativeName: string;
  recipient: string;
  project: string;
  billingFrom: string;
  billingTo: string;
  amountDue: number;
  currency: string;
}

export function buildBillingStatementEmail(snapshot: BillingStatementEmailSnapshot) {
  const subject = `Billing Statement ${snapshot.statementNumber} — ${snapshot.rentalNumber}`;
  const body = `Dear ${snapshot.representativeName || "Customer Representative"},

Please find the exported Billing Statement for:

Rental: ${snapshot.rentalNumber}
Project: ${snapshot.project}
Billing Period: ${snapshot.billingFrom} to ${snapshot.billingTo}
Amount Due: ${snapshot.currency} ${snapshot.amountDue.toFixed(2)}

Please use ${snapshot.statementNumber} as the payment reference.

Thank you.`;
  return { recipient: snapshot.recipient, subject, body, generatedAt: new Date().toISOString(), statementNumber: snapshot.statementNumber };
}
