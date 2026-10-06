import { createHash } from "node:crypto";

// Product photos go straight from the admin's browser to Cloudinary (free tier: 25 credits/month),
// so large files never pass through our server. The server only signs each upload.
export interface UploadTicket {
  url: string;
  fields: Record<string, string>;
}

export const PHOTO_FOLDER = "thriftsyndicate/products";
const ALLOWED_FORMATS = "jpg,jpeg,png,webp,heic";

export function uploadsConfigured() {
  return Boolean(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET);
}

// Cloudinary's signature: SHA-1 of the signed params sorted by name, joined as k=v&k=v, followed by the API secret.
export function cloudinarySignature(params: Record<string, string>, apiSecret: string): string {
  const toSign = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");
  return createHash("sha1").update(toSign + apiSecret).digest("hex");
}

export function photoUploadTicket(now = new Date()): UploadTicket | null {
  const { CLOUDINARY_CLOUD_NAME: cloud, CLOUDINARY_API_KEY: apiKey, CLOUDINARY_API_SECRET: secret } = process.env;
  if (!cloud || !apiKey || !secret) return null;
  const signed = { allowed_formats: ALLOWED_FORMATS, folder: PHOTO_FOLDER, timestamp: String(Math.floor(now.getTime() / 1000)) };
  return {
    url: `https://api.cloudinary.com/v1_1/${cloud}/image/upload`,
    fields: { ...signed, api_key: apiKey, signature: cloudinarySignature(signed, secret) },
  };
}
