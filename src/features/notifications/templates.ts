import type { NotificationTemplateInput, NotificationType, RenderedEmail } from "./domain";

export const NOTIFICATION_TEMPLATE_VERSION = 1;

export function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

function title(type: NotificationType) {
  const titles: Record<NotificationType, string> = {
    CUSTOMER_REVIEW_REQUESTED: "DEUR review requested",
    CUSTOMER_CORRECTED_REVIEW_REQUESTED: "Corrected DEUR review requested",
    CUSTOMER_ACKNOWLEDGED: "DEUR acknowledgement confirmed",
    CUSTOMER_CORRECTION_CONFIRMED: "DEUR correction request confirmed",
    MANAGER_REVIEW_REQUESTED: "Manager DEUR review requested",
    MANAGER_CORRECTED_REVIEW_REQUESTED: "Corrected DEUR manager review requested",
    MANAGER_APPROVED: "Manager approval confirmed",
    MANAGER_REJECTED: "Manager rejection confirmed",
    MANAGER_CORRECTION_CONFIRMED: "Manager correction request confirmed",
    CUSTOMER_CORRECTION_WORK_ITEM: "Customer correction work item created",
    MANAGER_CORRECTION_WORK_ITEM: "Manager correction work item created",
  };
  return titles[type];
}

export function renderNotificationTemplate(type: NotificationType, input: NotificationTemplateInput): RenderedEmail {
  const subject = title(type).replaceAll(/[\r\n]/g, " ");
  const lines = [
    `Hello ${input.recipientName},`, title(type), `Company: ${input.companyName}`,
    `Rental: ${input.rentalReference}`,
    input.projectName ? `Project: ${input.projectName}` : "",
    input.equipmentDescription ? `Equipment: ${input.equipmentDescription}` : "",
    input.deurNumber ? `DEUR: ${input.deurNumber}${input.revisionLabel ? ` ${input.revisionLabel}` : ""}` : "",
    input.reason ? `Reason: ${input.reason}` : "",
    input.expirationLabel ? `Expires: ${input.expirationLabel}` : "",
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
  const text = [...lines, ...(timelineText.length ? ["Activity Timeline", ...timelineText] : []), ...totalsText].join("\n");
  const htmlLines = lines.map((line) => {
    if (input.reviewUrl && line === `Secure review: ${input.reviewUrl}`) {
      const safe = escapeHtml(input.reviewUrl);
      return `<p><a href="${safe}">Open secure review</a></p>`;
    }
    return `<p>${escapeHtml(line)}</p>`;
  });
  const timelineHtml = (input.activityTimeline ?? []).map((entry) => `<li><strong>${entry.sequence}. ${escapeHtml(entry.activityType)}</strong><br>Start: ${escapeHtml(entry.start)}<br>End: ${escapeHtml(entry.end)}<br>Duration: ${entry.durationSeconds} seconds${entry.workDescription ? `<br>Work: ${escapeHtml(entry.workDescription)}` : ""}${entry.remarks ? `<br>Remarks: ${escapeHtml(entry.remarks)}` : ""}${entry.openingMeter !== undefined ? `<br>Opening meter: ${entry.openingMeter}` : ""}${entry.closingMeter !== undefined ? `<br>Closing meter: ${entry.closingMeter}` : ""}</li>`).join("");
  const totalsHtml = input.activityTotals ? `<h2>Activity Summary</h2><p>Operation: ${input.activityTotals.operationMinutes} min<br>Idle: ${input.activityTotals.idleMinutes} min<br>Standby: ${input.activityTotals.standbyMinutes} min<br>Breakdown: ${input.activityTotals.breakdownMinutes} min</p>` : "";
  return { subject, text, html: `<!doctype html><html><body>${htmlLines.join("")}${timelineHtml ? `<h2>Activity Timeline</h2><ol>${timelineHtml}</ol>` : ""}${totalsHtml}</body></html>` };
}
