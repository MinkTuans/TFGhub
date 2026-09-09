"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

/** TFG destructive-action dialog: initial safe focus, Escape, and focus return. */
export function StudioConfirmation({
  title,
  children,
  disabled,
  onCancel,
  onConfirm,
}: {
  title: string;
  children: ReactNode;
  disabled?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const titleId = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const element = dialog.current!;
    if (element.showModal) element.showModal();
    else element.setAttribute("open", "");
    cancel.current?.focus();
    return () => {
      if (element.close) element.close();
      if (previous?.isConnected) previous.focus();
      else
        document
          .querySelector<HTMLButtonElement>('[aria-label="Hoàn tác"]')
          ?.focus();
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className="studio-confirmation"
      aria-labelledby={titleId}
      aria-modal="true"
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          onCancel();
        }
        if (event.key === "Tab") {
          const controls = [
            ...event.currentTarget.querySelectorAll<HTMLElement>(
              "button:not(:disabled), select:not(:disabled), input:not(:disabled)",
            ),
          ];
          const first = controls[0],
            last = controls.at(-1);
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last?.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first?.focus();
          }
        }
      }}
    >
      <h2 id={titleId}>{title}</h2>
      {children}
      <div className="studio-actions">
        <button ref={cancel} type="button" onClick={onCancel}>
          Hủy
        </button>
        <button type="button" disabled={disabled} onClick={onConfirm}>
          Xác nhận xóa
        </button>
      </div>
    </dialog>
  );
}
