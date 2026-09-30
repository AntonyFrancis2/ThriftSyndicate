import type { PaymentGateway } from "./gateway";
import { MockGateway } from "./mock";
import { RazorpayGateway } from "./razorpay";

let gateway: PaymentGateway | undefined;

// Real Razorpay when keys are set; otherwise the local mock (never in production).
export function getGateway(): PaymentGateway {
  if (gateway) return gateway;
  const { RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET } = process.env;
  if (RAZORPAY_KEY_ID && RAZORPAY_KEY_SECRET && RAZORPAY_WEBHOOK_SECRET) {
    gateway = new RazorpayGateway(RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET);
  } else if (process.env.NODE_ENV === "production") {
    throw new Error("Razorpay keys are not configured");
  } else {
    gateway = new MockGateway();
  }
  return gateway;
}

// Tests swap in their own gateway.
export function setGateway(g: PaymentGateway | undefined) {
  gateway = g;
}

export type { PaymentGateway } from "./gateway";
