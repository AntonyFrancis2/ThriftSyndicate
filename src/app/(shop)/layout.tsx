import { Marquee } from "@/components/marquee";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export default function ShopLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <Marquee items={["New drop every Friday", "One piece. One owner. Yours next.", "Ships from our 2 stores", "No returns. No regrets. Check the measurements."]} />
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </>
  );
}
