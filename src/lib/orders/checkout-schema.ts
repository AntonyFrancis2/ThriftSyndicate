import { z } from "zod";

// Shared by the checkout form and the checkout API. Prices are never accepted from the browser (PRD §8.2).
export const addressSchema = z.object({
  line1: z.string().trim().min(3, "Enter your address"),
  line2: z.string().trim().max(200).default(""),
  city: z.string().trim().min(2, "Enter your city"),
  state: z.string().trim().min(2, "Enter your state"),
  pincode: z.string().trim().regex(/^[1-9][0-9]{5}$/, "Enter a valid 6-digit PIN code"),
});

export const checkoutSchema = z
  .object({
    items: z
      .array(z.object({ variantId: z.string().min(1), quantity: z.number().int().min(1).max(10) }))
      .min(1, "Your bag is empty")
      .max(30),
    contact: z.object({
      name: z.string().trim().min(2, "Enter your name").max(100),
      phone: z
        .string()
        .trim()
        // Accept "98765 43210", "+91 98765 43210", "919876543210" or "09876543210".
        .transform((v) => v.replace(/[\s-]/g, "").replace(/^(\+91|91(?=\d{10}$)|0(?=\d{10}$))/, ""))
        .pipe(z.string().regex(/^[6-9][0-9]{9}$/, "Enter a valid 10-digit mobile number")),
      email: z.email("Enter a valid email"),
      marketingConsent: z.boolean().default(false),
    }),
    deliveryType: z.enum(["HOME", "PICKUP"]),
    address: addressSchema.optional(),
    note: z.string().trim().max(500).default(""),
    // BR1: must be explicitly ticked.
    finalSaleAccepted: z.literal(true, { error: "Please confirm you understand all sales are final" }),
  })
  .refine((v) => v.deliveryType === "PICKUP" || v.address, {
    message: "Enter a delivery address",
    path: ["address"],
  });

export type CheckoutInput = z.input<typeof checkoutSchema>;
export type ValidCheckout = z.output<typeof checkoutSchema>;
