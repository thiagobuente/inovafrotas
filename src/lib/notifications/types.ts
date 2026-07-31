// Contrato único de notificações do SEIA.
// Trocar de provedor (Lovable, SMTP Gmail, VPS, Manus...) = trocar apenas a
// implementação de NotificationProvider em src/lib/notifications/provider.server.ts.

export type NotificationEventType =
  | "request_created"
  | "request_approved"
  | "request_rejected"
  | "request_cancelled"
  | "request_completed"
  | "request_status_changed";

export type NotificationAudience = "requester" | "manager";

export type NotificationEvent = {
  type: NotificationEventType;
  protocol: string;
  requesterEmail: string;
  destination: string;
  agenda?: string | null;
  pickupAt?: string | null;
  returnAt?: string | null;
  vehicleLabel?: string | null;
  driverLabel?: string | null;
  note?: string | null;
  previousStatus?: string | null;
  status?: string | null;
};

export type NotificationMessage = {
  to: string;
  audience: NotificationAudience;
  subject: string;
  text: string;
  html: string;
};

export type DeliveryStatus = "sent" | "pending" | "failed" | "skipped";

export type DeliveryResult = {
  to: string;
  audience: NotificationAudience;
  status: DeliveryStatus;
  provider: string;
  reason?: string;
};

export interface NotificationProvider {
  readonly name: string;
  /** Provedor pronto para entregar (domínio remetente configurado, credenciais válidas). */
  isReady(): Promise<boolean> | boolean;
  send(message: NotificationMessage): Promise<DeliveryResult>;
}

export const MANAGER_EMAIL = "frotas.01@inova.pr.gov.br";
