import type { NotificationTemplateInput, NotificationType, RenderedEmail } from "./domain";

export const NOTIFICATION_TEMPLATE_VERSION = 2;

export function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

function title(type: NotificationType) {
  const titles: Record<NotificationType, string> = {
    CUSTOMER_REVIEW_REQUESTED: "DEUR review requested",
    CUSTOMER_CORRECTED_REVIEW_REQUESTED: "Corrected DEUR review requested",
    CUSTOMER_GROUPED_REVIEW_REQUESTED: "Grouped DEUR review requested",
    CUSTOMER_ACKNOWLEDGED: "DEUR acknowledgement confirmed",
    CUSTOMER_CORRECTION_CONFIRMED: "DEUR correction request confirmed",
    MANAGER_REVIEW_REQUESTED: "Manager DEUR review requested",
    MANAGER_CORRECTED_REVIEW_REQUESTED: "Corrected DEUR manager review requested",
    MANAGER_APPROVED: "Manager approval confirmed",
    MANAGER_REJECTED: "Manager rejection confirmed",
    MANAGER_CORRECTION_CONFIRMED: "Manager correction request confirmed",
    CUSTOMER_CORRECTION_WORK_ITEM: "Customer correction work item created",
    MANAGER_CORRECTION_WORK_ITEM: "Manager correction work item created",
    BILLING_STATEMENT_EMAIL: "Billing Statement",
  };
  return titles[type];
}

export function renderNotificationTemplate(type: NotificationType, input: NotificationTemplateInput): RenderedEmail {
  const isGroupedCustomerReview = type === "CUSTOMER_GROUPED_REVIEW_REQUESTED";
  const subject = (isGroupedCustomerReview
    ? `Action Required: Pending DEUR Acknowledgement — Rental ${input.rentalReference}`
    : title(type)).replaceAll(/[\r\n]/g, " ");
  const lines = [
    `Hello ${input.recipientName},`, title(type), `Company: ${input.companyName}`,
    input.customerName ? `Customer: ${input.customerName}` : "",
    `Rental: ${input.rentalReference}`,
    input.projectName ? `Project: ${input.projectName}` : "",
    input.reviewDate ? `Review Date: ${input.reviewDate}` : "",
    input.equipmentDescription ? `Equipment: ${input.equipmentDescription}` : "",
    input.deurNumber ? `DEUR: ${input.deurNumber}${input.revisionLabel ? ` ${input.revisionLabel}` : ""}` : "",
    input.reason ? `Reason: ${input.reason}` : "",
    input.expirationLabel ? `Expires: ${input.expirationLabel}` : "",
    isGroupedCustomerReview ? `Total equipment lines: ${input.totalLineCount ?? 0}` : "",
    isGroupedCustomerReview ? `Awaiting acknowledgement: ${input.actionableCount ?? 0}` : "",
    isGroupedCustomerReview ? `In Progress: ${input.inProgressCount ?? 0}` : "",
    isGroupedCustomerReview ? `Acknowledged: ${input.acknowledgedCount ?? 0}` : "",
    isGroupedCustomerReview ? `Correction Requested: ${input.correctionRequestedCount ?? 0}` : "",
    input.reviewUrl ? `Secure review: ${input.reviewUrl}` : "",
  ].filter(Boolean);
  const timelineText = (input.activityTimeline ?? []).flatMap((entry) => [
    `${entry.sequence}. ${entry.activityType}`,
    `Start: ${entry.start}`,
    `End: ${entry.end}`,
    `Duration: ${entry.durationSeconds} seconds`,
    entry.workDescription ? `Work: ${entry.workDescription}` : "",
    entry.remarks ? `Remarks: ${entry.remarks}` : "",
    entry.openingMeter !== undefined ? `Opening meter: ${entry.openingMeter}` : "",
    entry.closingMeter !== undefined ? `Closing meter: ${entry.closingMeter}` : "",
  ].filter(Boolean));
  const totalsText = input.activityTotals ? [
    "Activity Summary",
    `Operation: ${input.activityTotals.operationMinutes} min`,
    `Idle: ${input.activityTotals.idleMinutes} min`,
    `Standby: ${input.activityTotals.standbyMinutes} min`,
    `Breakdown: ${input.activityTotals.breakdownMinutes} min`,
  ] : [];
  const isCustomerReview = type === "CUSTOMER_REVIEW_REQUESTED" || type === "CUSTOMER_CORRECTED_REVIEW_REQUESTED";
  const customerInstructions = isGroupedCustomerReview && input.reviewUrl
    ? [
      "Submitted DEURs can be acknowledged or sent back with a correction request.",
      "In Progress DEURs are shown for visibility and cannot yet be acknowledged.",
      "Review is completed line-by-line.",
    ]
    : isCustomerReview && input.reviewUrl
    ? ["Review the complete DEUR evidence, then choose:", "- Acknowledge", "- Request Correction"]
    : [];
  const text = [...lines, ...customerInstructions, ...(timelineText.length ? ["Activity Timeline", ...timelineText] : []), ...totalsText].join("\n");
  const htmlLines = lines.map((line) => {
    if (input.reviewUrl && line === `Secure review: ${input.reviewUrl}`) {
      const safe = escapeHtml(input.reviewUrl);
      if (isCustomerReview || isGroupedCustomerReview) {
        const label = isGroupedCustomerReview ? "REVIEW &amp; ACKNOWLEDGE DEURs" : "REVIEW &amp; ACKNOWLEDGE DEUR";
        const help = isGroupedCustomerReview
          ? "Review each submitted DEUR independently. In Progress lines are visible but read-only."
          : "The secure page lets you Acknowledge or Request Correction after reviewing the DEUR evidence.";
        return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td align="center" style="padding:24px 0"><table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr><td bgcolor="#047857" style="border-radius:8px"><a href="${safe}" style="display:inline-block;min-width:260px;padding:16px 24px;color:#ffffff;font-family:Arial,sans-serif;font-size:16px;font-weight:700;line-height:20px;text-align:center;text-decoration:none">${label}</a></td></tr></table></td></tr></table><p style="text-align:center;color:#475569;font-family:Arial,sans-serif;font-size:14px">${help}</p>`;
      }
      return `<p><a href="${safe}">Open secure review</a></p>`;
    }
    return `<p>${escapeHtml(line)}</p>`;
  });
  const timelineHtml = (input.activityTimeline ?? []).map((entry) => `<li><strong>${entry.sequence}. ${escapeHtml(entry.activityType)}</strong><br>Start: ${escapeHtml(entry.start)}<br>End: ${escapeHtml(entry.end)}<br>Duration: ${entry.durationSeconds} seconds${entry.workDescription ? `<br>Work: ${escapeHtml(entry.workDescription)}` : ""}${entry.remarks ? `<br>Remarks: ${escapeHtml(entry.remarks)}` : ""}${entry.openingMeter !== undefined ? `<br>Opening meter: ${entry.openingMeter}` : ""}${entry.closingMeter !== undefined ? `<br>Closing meter: ${entry.closingMeter}` : ""}</li>`).join("");
  const totalsHtml = input.activityTotals ? `<h2>Activity Summary</h2><p>Operation: ${input.activityTotals.operationMinutes} min<br>Idle: ${input.activityTotals.idleMinutes} min<br>Standby: ${input.activityTotals.standbyMinutes} min<br>Breakdown: ${input.activityTotals.breakdownMinutes} min</p>` : "";
  return { subject, text, html: `<!doctype html><html><body>${htmlLines.join("")}${timelineHtml ? `<h2>Activity Timeline</h2><ol>${timelineHtml}</ol>` : ""}${totalsHtml}</body></html>` };
}
