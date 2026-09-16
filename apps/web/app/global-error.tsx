"use client";

import { ErrorRecovery, type ErrorRecoveryProps } from "../components/error-recovery";
import "./globals.css";

export default function GlobalError(props: ErrorRecoveryProps) {
  return (
    <html lang="vi">
      <body>
        <title>Không thể tải trang | TFG</title>
        <ErrorRecovery {...props} />
      </body>
    </html>
  );
}
