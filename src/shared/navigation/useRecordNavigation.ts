import type { HTMLAttributes, MouseEvent as ReactMouseEvent, KeyboardEvent as ReactKeyboardEvent } from "react";
import { useNavigate } from "react-router-dom";

const interactive = "a, button, input, select, textarea, summary, [contenteditable], [role='button'], [role='link'], [role='checkbox'], [role='menuitem']";

export function isInteractiveRecordChild(target: EventTarget | null, container: HTMLElement): boolean {
  if (!(target instanceof Element)) return false;
  const control = target.closest(interactive);
  return Boolean(control && control !== container && container.contains(control));
}

export function useRecordNavigation() {
  const navigate = useNavigate();
  return (to: string, label: string): Pick<HTMLAttributes<HTMLElement>, "role" | "tabIndex" | "aria-label" | "onClick" | "onKeyDown"> => ({
    role: "link",
    tabIndex: 0,
    "aria-label": label,
    onClick: (event: ReactMouseEvent<HTMLElement>) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || isInteractiveRecordChild(event.target, event.currentTarget)) return;
      navigate(to);
    },
    onKeyDown: (event: ReactKeyboardEvent<HTMLElement>) => {
      if ((event.key !== "Enter" && event.key !== " ") || event.defaultPrevented || isInteractiveRecordChild(event.target, event.currentTarget)) return;
      event.preventDefault();
      navigate(to);
    },
  });
}
