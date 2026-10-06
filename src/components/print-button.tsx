"use client";

export function PrintButton() {
  return (
    <button onClick={() => window.print()} className="btn btn-secondary mb-6 print:hidden">
      Print / save as PDF
    </button>
  );
}
