"use client";

import type { ComponentProps } from "react";

// A submit button that asks first. For actions that can't be undone (cancel, reject).
export function ConfirmButton({ message, ...props }: ComponentProps<"button"> & { message: string }) {
  return (
    <button
      {...props}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
        props.onClick?.(e);
      }}
    />
  );
}
