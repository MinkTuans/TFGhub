"use client";

import { useId, useState } from "react";

export function PasswordField({ name, label, autoComplete, disabled, describedBy }: {
  name: string;
  label: string;
  autoComplete: "new-password" | "current-password";
  disabled?: boolean;
  describedBy?: string;
}) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  const target = name === "confirmPassword" ? "mật khẩu xác nhận" : "mật khẩu";
  return (
    <div className="password-field">
      <label htmlFor={id}>{label}</label>
      <div className="password-field__control">
        <input id={id} name={name} type={visible ? "text" : "password"}
          minLength={8} maxLength={128} autoComplete={autoComplete}
          aria-describedby={describedBy} disabled={disabled} required />
        <button type="button" className="button-ghost" disabled={disabled}
          aria-label={`${visible ? "Ẩn" : "Hiện"} ${target}`} aria-controls={id}
          aria-pressed={visible} onClick={() => setVisible(!visible)}>
          {visible ? "Ẩn" : "Hiện"}
        </button>
      </div>
    </div>
  );
}
