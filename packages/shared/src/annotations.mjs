const DESTRUCTIVE_VERBS = [
  "send",
  "create",
  "recall",
  "update",
  "delete",
  "join",
  "complete",
  "mark-read",
  "send-card",
  "ding",
];
const READONLY_VERBS = [
  "list",
  "get",
  "search",
  "read",
  "list-topic-replies",
  "list-at-me",
  "get-self",
  "user-list",
  "attendee-list",
  "member-list",
];

export function annotationsFor(command) {
  const verb = command.path[command.path.length - 1].toLowerCase();
  if (
    DESTRUCTIVE_VERBS.some((v) => verb === v || verb.startsWith(v + "-"))
  ) {
    return { destructiveHint: true };
  }
  if (READONLY_VERBS.some((v) => verb === v || verb.startsWith(v + "-"))) {
    return { readOnlyHint: true };
  }
  return {};
}
