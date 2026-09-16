import type { ReactNode } from "react";
import { FeatureIcon, type FeatureIconName } from "./feature-icon";

export function EmptyState({ title, description, icon = "archive", children }: {
  title: string;
  description: string;
  icon?: FeatureIconName;
  children?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <FeatureIcon name={icon} />
      <h3>{title}</h3>
      <p>{description}</p>
      {children}
    </div>
  );
}
