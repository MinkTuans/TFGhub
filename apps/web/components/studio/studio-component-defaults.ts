import { v2ComponentRegistry } from "@indieforge/contracts";

/** Localized starting text for new components and explicit resets only. */
export function studioComponentDefaults(
  type: keyof typeof v2ComponentRegistry,
): Record<string, unknown> {
  const properties = structuredClone(
    v2ComponentRegistry[type].defaults(),
  ) as Record<string, unknown>;
  if (type === "InventoryItem") properties.displayName = "Vật phẩm";
  if (type === "UIButton") properties.label = "Nút";
  return properties;
}
