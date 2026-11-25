// Only these fixed messages are shown; text from the URL is never displayed.
export const ERROR_MESSAGES = {
  name_taken: "An organization with that name already exists",
  already_member: "That person already belongs to an organization",
  own_membership: "You cannot change or remove your own membership",
  invalid: "Check the values. A user ID looks like auth0|abc123",
  not_found: "That item no longer exists",
  forbidden: "You are not allowed to do that",
  expired: "Your session ended. Sign in again",
  unavailable: "The change could not be confirmed. Check the list before trying again",
} as const;

export type ErrorCode = keyof typeof ERROR_MESSAGES;

export function errorMessage(code: unknown): string | null {
  if (code === undefined) return null;
  return typeof code === "string" && Object.hasOwn(ERROR_MESSAGES, code)
    ? ERROR_MESSAGES[code as ErrorCode]
    : ERROR_MESSAGES.unavailable;
}
