// Mirrors the values the database accepts. The backend validates them.
export const ROLES = ["customer", "intern", "employee", "manager", "hr", "admin"] as const;
export const CLASSIFICATIONS = ["public", "internal", "restricted"] as const;

export type Role = (typeof ROLES)[number];
export type Classification = (typeof CLASSIFICATIONS)[number];

export function label(value: string): string {
  return value === "hr" ? "HR" : value.charAt(0).toUpperCase() + value.slice(1);
}
