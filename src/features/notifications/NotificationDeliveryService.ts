import type { EmailDeliveryProvider } from "./EmailDeliveryProvider";
import type { DeliveryFailureCategory, NotificationIntent } from "./domain";
import { renderNotificationTemplate } from "./templates";

export interface NotificationDeliveryRepository {
  create(intent: NotificationIntent): Promise<"CREATED" | "EXISTS" | "MISMATCH">;
  claim(id: string, workerId: string): Promise<boolean>;
  accepted(id: string, provider: string, providerMessageId: string): Promise<void>;
  failed(id: string, category: DeliveryFailureCategory): Promise<void>;
}

export class NotificationDeliveryService {
  constructor(
    private readonly repository: NotificationDeliveryRepository,
    private readonly provider: EmailDeliveryProvider,
    private readonly from: string,
  ) {}

  async deliver(intent: NotificationIntent, workerId: string) {
    const created = await this.repository.create(intent);
    if (created === "MISMATCH") return { status: "IDEMPOTENCY_MISMATCH" as const };
    if (!(await this.repository.claim(intent.id, workerId))) return { status: "NOT_CLAIMED" as const };
    let email;
    try {
      email = renderNotificationTemplate(intent.type, intent.input);
    } catch {
      await this.repository.failed(intent.id, "TemplateFailure");
      return { status: "FAILED" as const, category: "TemplateFailure" as const };
    }
    const result = await this.provider.send({
      from: this.from,
      to: intent.recipient.destination,
      recipientName: intent.recipient.displayName,
      email,
      idempotencyKey: intent.idempotencyKey,
    });
    if (!result.accepted) {
      await this.repository.failed(intent.id, result.category);
      return { status: "FAILED" as const, category: result.category };
    }
    await this.repository.accepted(intent.id, result.provider, result.providerMessageId);
    return { status: "PROVIDER_ACCEPTED" as const, providerMessageId: result.providerMessageId };
  }
}
