import { randomBytes } from "node:crypto";
import { hmacHex, hmacMatches, type GatewayPayment, type GatewayRefund, type PaymentGateway } from "./gateway";

// Stands in for Razorpay when no keys are configured, so the whole flow runs locally.
// Payments are "captured" instantly by the dev-only /api/dev/mock-pay route.
export const MOCK_SECRET = "mock_secret_for_local_development_only";

const payments = new Map<string, GatewayPayment>();

function id(prefix: string) {
  return `${prefix}_mock${randomBytes(7).toString("hex")}`;
}

export class MockGateway implements PaymentGateway {
  readonly mode = "mock" as const;
  readonly keyId = "rzp_test_mock";

  async createOrder() {
    return { id: id("order") };
  }

  // Simulates the customer completing Razorpay Checkout.
  capture(orderId: string, amountPaise: number, method = "upi") {
    const payment: GatewayPayment = {
      id: id("pay"),
      orderId,
      amountPaise,
      status: "captured",
      method,
      feePaise: Math.round(amountPaise * 0.02),
      taxPaise: Math.round(amountPaise * 0.02 * 0.18),
    };
    payments.set(payment.id, payment);
    return { payment, signature: hmacHex(MOCK_SECRET, `${orderId}|${payment.id}`) };
  }

  async fetchPayment(paymentId: string): Promise<GatewayPayment> {
    const p = payments.get(paymentId);
    if (!p) throw new Error(`Mock payment ${paymentId} not found`);
    return p;
  }

  async refund(): Promise<GatewayRefund> {
    return { id: id("rfnd"), status: "processed" };
  }

  verifyPaymentSignature({ orderId, paymentId, signature }: { orderId: string; paymentId: string; signature: string }) {
    return hmacMatches(MOCK_SECRET, `${orderId}|${paymentId}`, signature);
  }

  verifyWebhookSignature(rawBody: string, signature: string) {
    return hmacMatches(MOCK_SECRET, rawBody, signature);
  }
}
