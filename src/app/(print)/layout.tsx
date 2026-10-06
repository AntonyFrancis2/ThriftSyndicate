// Bare layout for printable documents (invoice, packing slip).
export default function PrintLayout({ children }: LayoutProps<"/">) {
  return <main className="mx-auto w-full max-w-[800px] bg-paper p-8 print:p-0">{children}</main>;
}
