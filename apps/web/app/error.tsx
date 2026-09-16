"use client";

import { ErrorRecovery, type ErrorRecoveryProps } from "../components/error-recovery";

export default function RouteError(props: ErrorRecoveryProps) {
  return <ErrorRecovery {...props} />;
}
