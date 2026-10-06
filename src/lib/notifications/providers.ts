import type { Template } from "@/lib/notify";
import { emailHtml, renderMessage } from "./messages";

export interface OutboundMessage {
  channel: string;
  to: string;
  template: Template;
  payload: Record<string, unknown>;
}

// A channel with no provider configured, or a template not yet approved for it. Recorded as SKIPPED, not retried.
export class NotConfigured extends Error {}

export interface Sender {
  send(message: OutboundMessage): Promise<{ providerId: string | null }>;
}

function templateIds(envName: string): Record<string, string> {
  const raw = process.env[envName];
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, string>;
  } catch {
    throw new Error(`${envName} must be JSON like {"order_placed":"<id>"}`);
  }
}

async function postJson(url: string, headers: Record<string, string>, body: unknown) {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
  const text = await res.text();
  if (!res.ok) throw new Error(`${new URL(url).host} ${res.status}: ${text.slice(0, 300)}`);
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return {};
  }
}

// Email by Resend (resend.com). Free tier: 3,000 emails/month, 100/day.
export const resendEmail: Sender = {
  async send(m) {
    const key = process.env.RESEND_API_KEY;
    const from = process.env.EMAIL_FROM;
    if (!key || !from) throw new NotConfigured("RESEND_API_KEY and EMAIL_FROM are not set");
    const message = renderMessage(m.template, m.payload);
    const res = await postJson("https://api.resend.com/emails", { authorization: `Bearer ${key}` }, {
      from,
      to: [m.to],
      reply_to: process.env.EMAIL_REPLY_TO || undefined,
      subject: message.subject,
      text: message.text,
      html: emailHtml(message),
    });
    return { providerId: typeof res.id === "string" ? res.id : null };
  },
};

// SMS by MSG91 Flow. India requires each template to be DLT-registered; map our templates to MSG91 flow ids
// in MSG91_SMS_TEMPLATES. Variables are sent as var1, var2, … in the order renderMessage gives them.
export const msg91Sms: Sender = {
  async send(m) {
    const key = process.env.MSG91_AUTH_KEY;
    const flowId = templateIds("MSG91_SMS_TEMPLATES")[m.template];
    if (!key || !flowId) throw new NotConfigured(`No MSG91 SMS template for ${m.template}`);
    const vars = renderMessage(m.template, m.payload).vars;
    const recipient: Record<string, string> = { mobiles: `91${m.to}` };
    vars.forEach((v, i) => (recipient[`var${i + 1}`] = v));
    const res = await postJson("https://control.msg91.com/api/v5/flow", { authkey: key }, { template_id: flowId, short_url: "0", recipients: [recipient] });
    return { providerId: typeof res.message === "string" ? res.message : null };
  },
};

// WhatsApp by Meta's Cloud API (no middleman fee). Each template must be approved in WhatsApp Manager;
// map ours to approved template names in WHATSAPP_TEMPLATES.
export const metaWhatsApp: Sender = {
  async send(m) {
    const token = process.env.WHATSAPP_TOKEN;
    const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const name = templateIds("WHATSAPP_TEMPLATES")[m.template];
    if (!token || !phoneId || !name) throw new NotConfigured(`No WhatsApp template for ${m.template}`);
    const vars = renderMessage(m.template, m.payload).vars;
    const res = await postJson(`https://graph.facebook.com/v21.0/${phoneId}/messages`, { authorization: `Bearer ${token}` }, {
      messaging_product: "whatsapp",
      to: `91${m.to}`,
      type: "template",
      template: {
        name,
        language: { code: process.env.WHATSAPP_LANGUAGE || "en" },
        components: [{ type: "body", parameters: vars.map((text) => ({ type: "text", text })) }],
      },
    });
    const messages = res.messages as { id?: string }[] | undefined;
    return { providerId: messages?.[0]?.id ?? null };
  },
};

// Phone messages go by WhatsApp once it is set up, otherwise by SMS.
export function phoneChannel(): "whatsapp" | "sms" {
  return process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID ? "whatsapp" : "sms";
}

let override: Record<string, Sender> | undefined;

export function senderFor(channel: string): Sender {
  if (override) return override[channel] ?? { send: async () => Promise.reject(new NotConfigured(`No sender for ${channel}`)) };
  switch (channel) {
    case "email":
    case "admin":
      return resendEmail;
    case "sms":
      return msg91Sms;
    case "whatsapp":
      return metaWhatsApp;
    default:
      return { send: async () => Promise.reject(new NotConfigured(`Unknown channel ${channel}`)) };
  }
}

// Tests swap in fake senders.
export function setSenders(senders: Record<string, Sender> | undefined) {
  override = senders;
}
