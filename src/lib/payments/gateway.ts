import { createHmac, timingSafeEqual } from "node:crypto";

// What the order flow needs from a payment provider. Razorpay in production, a local mock in dev.
export interface PaymentGateway {
  readonly mode: "razorpay" | "mock";
  readonly keyId: string;
  createOrder(input: { amountPaise: number; receipt: string; notes?: Record<string, string> }): Promise<{ id: string }>;
  fetchPayment(paymentId: string): Promise<GatewayPayment>;
  // Payments made between two times, for the nightly reconciliation.
  listPayments(range: { from: Date; to: Date }): Promise<GatewayPayment[]>;
  refund(input: { paymentId: string; amountPaise: number; reason: string; instant: boolean }): Promise<GatewayRefund>;
  verifyPaymentSignature(input: { orderId: string; paymentId: string; signature: string }): boolean;
  verifyWebhookSignature(rawBody: string, signature: string): boolean;
}

export interface GatewayPayment {
  id: string;
  orderId: string;
  amountPaise: number;
  status: "created" | "authorized" | "captured" | "refunded" | "failed";
  method: string | null;
  feePaise: number | null;
  taxPaise: number | null;
}

export interface GatewayRefund {
  id: string;
  status: "pending" | "processed" | "failed";
}

// HMAC-SHA256 hex digest compared in constant time (PRD §8.2).
export function hmacMatches(secret: string, payload: string, signature: string): boolean {
  const expected = createHmac("sha256", secret).update(payload).digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature ?? "", "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

export function hmacHex(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}
