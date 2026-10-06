// Serve Cloudinary photos resized and in the best format for the browser. Other URLs pass through unchanged.
export function photoUrl(url: string, width: number): string {
  const marker = "/image/upload/";
  if (!url.includes("res.cloudinary.com") || !url.includes(marker)) return url;
  return url.replace(marker, `${marker}f_auto,q_auto,c_limit,w_${width}/`);
}
