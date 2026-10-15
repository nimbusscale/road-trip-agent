// A change that breaks a rule, refused (domain model section 1). The message is written
// for the agent, which reads it as the tool's error and explains it to the user. Example:
// "A trip is at most 14 days long."
export class RuleError extends Error {
  override name = "RuleError";
}
