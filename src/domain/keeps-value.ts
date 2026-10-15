import { RuleError } from "./rule-error.js";

// The rule behind {keepsValue} (domain model section 1): a property starts empty, and
// can't be emptied once it has a value. Its setter runs one of these. The constructor
// lets a stored empty value through, and runs the same function on any other.
// `what` names the property for the agent, such as "The trip brief's focus".

export function keptValue<T>(value: T | null, what: string): T {
  if (value === null) {
    throw emptiedError(what);
  }
  return value;
}

// Text that is only spaces counts as empty.
export function keptText(value: string | null, what: string): string {
  if (value === null || value.trim() === "") {
    throw emptiedError(what);
  }
  return value;
}

// For a constructor: a stored empty value is where the property starts, so it passes.
// Any other value runs the rule its setter runs.
export function startingValue<T>(
  value: T | null,
  rule: (value: T) => T,
): T | null {
  return value === null ? null : rule(value);
}

function emptiedError(what: string): RuleError {
  return new RuleError(
    `${what} can't be empty. Once it has a value, it can be changed but not emptied.`,
  );
}
