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
  const text = lines.join("\n");
  const htmlLines = lines.map((line) => {
    if (input.reviewUrl && line === `Secure review: ${input.reviewUrl}`) {
      const safe = escapeHtml(input.reviewUrl);
      return `<p><a href="${safe}">Open secure review</a></p>`;
    }
    return `<p>${escapeHtml(line)}</p>`;
  });
  return { subject, text, html: `<!doctype html><html><body>${htmlLines.join("")}</body></html>` };
}
