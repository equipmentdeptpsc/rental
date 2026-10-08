import type { ComponentPropsWithoutRef, MouseEvent } from "react";

type Props = ComponentPropsWithoutRef<"tr"> & { onOpen: () => void; selected?: boolean };

function isInteractiveTarget(target: EventTarget | null, row: EventTarget | null) {
  let element = target instanceof Element ? target : null;
  while (element && element !== row) {
    if (["A", "BUTTON", "INPUT", "SELECT", "TEXTAREA", "SUMMARY"].includes(element.tagName) ||
      element.hasAttribute("contenteditable") || element.hasAttribute("data-row-interactive") ||
      ["button", "link", "checkbox", "menuitem", "switch"].includes(element.getAttribute("role") ?? "")) return true;
    element = element.parentElement;
  }
  return false;
}

export default function InteractiveTableRow({ onOpen, selected, className = "", onClick, onKeyDown, ...props }: Props) {
  const open = (event: MouseEvent<HTMLTableRowElement>) => {
    onClick?.(event);
    if (!event.defaultPrevented && !isInteractiveTarget(event.target, event.currentTarget)) onOpen();
  };
  return <tr {...props} tabIndex={0} aria-selected={selected} onClick={open} onKeyDown={(event) => {
    onKeyDown?.(event);
    if (!event.defaultPrevented && event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault(); onOpen();
    }
  }} className={`cursor-pointer transition-colors hover:bg-amber-50/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 dark:hover:bg-amber-950/20 ${className} ${selected ? "!bg-blue-50/80 dark:!bg-blue-950/30" : ""}`} />;
}
