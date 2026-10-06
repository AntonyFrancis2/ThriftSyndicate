import Razorpay from "razorpay";
import type { Payments } from "razorpay/dist/types/payments";
import { hmacMatches, type GatewayPayment, type GatewayRefund, type PaymentGateway } from "./gateway";

function toGatewayPayment(p: Payments.RazorpayPayment): GatewayPayment {
  return {
    id: p.id,
    orderId: p.order_id,
    amountPaise: Number(p.amount),
    status: p.status as GatewayPayment["status"],
    method: p.method ?? null,
    feePaise: p.fee ?? null,
    taxPaise: p.tax ?? null,
  };
}

export class RazorpayGateway implements PaymentGateway {
  readonly mode = "razorpay" as const;
  private client: Razorpay;

  constructor(
    readonly keyId: string,
    private keySecret: string,
    private webhookSecret: string,
  ) {
    this.client = new Razorpay({ key_id: keyId, key_secret: keySecret });
  }

  async createOrder({ amountPaise, receipt, notes }: { amountPaise: number; receipt: string; notes?: Record<string, string> }) {
    const order = await this.client.orders.create({
      amount: amountPaise,
      currency: "INR",
      receipt,
      notes,
    });
    return { id: order.id };
  }

  async fetchPayment(paymentId: string): Promise<GatewayPayment> {
    return toGatewayPayment(await this.client.payments.fetch(paymentId));
  }

  async listPayments({ from, to }: { from: Date; to: Date }): Promise<GatewayPayment[]> {
    const out: GatewayPayment[] = [];
    const range = { from: Math.floor(from.getTime() / 1000), to: Math.floor(to.getTime() / 1000) };
    // Razorpay returns at most 100 per page.
    for (let skip = 0; ; skip += 100) {
      const page = await this.client.payments.all({ ...range, count: 100, skip });
      out.push(...page.items.map(toGatewayPayment));
      if (page.items.length < 100) return out;
    }
  }

  async refund({ paymentId, amountPaise, reason, instant }: { paymentId: string; amountPaise: number; reason: string; instant: boolean }): Promise<GatewayRefund> {
    const r = await this.client.payments.refund(paymentId, {
      amount: amountPaise,
      speed: instant ? "optimum" : "normal",
      notes: { reason },
    });
    return { id: r.id, status: r.status as GatewayRefund["status"] };
  }

  verifyPaymentSignature({ orderId, paymentId, signature }: { orderId: string; paymentId: string; signature: string }) {
    return hmacMatches(this.keySecret, `${orderId}|${paymentId}`, signature);
  }

  verifyWebhookSignature(rawBody: string, signature: string) {
    return hmacMatches(this.webhookSecret, rawBody, signature);
  }
}
