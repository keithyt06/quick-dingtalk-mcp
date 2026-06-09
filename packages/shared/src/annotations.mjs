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
  // An irreversible verb is always destructive — checking it here guarantees
  // IRREVERSIBLE_VERBS ⊆ destructive-annotated by construction, so the
  // destructiveHint flag can never disagree with the confirmation prefix
  // toolDescription() adds (the two are derived, not two hand-synced lists).
  if (
    isIrreversible(command) ||
    DESTRUCTIVE_VERBS.some((v) => verb === v || verb.startsWith(v + "-"))
  ) {
    return { destructiveHint: true };
  }
  if (READONLY_VERBS.some((v) => verb === v || verb.startsWith(v + "-"))) {
    return { readOnlyHint: true };
  }
  return {};
}

// Irreversible verbs — these can't be undone (delete a record, recall a message,
// quit a group), so the AI host must confirm with the user *before* calling.
// A plain destructiveHint:true flag is too weak — most hosts don't surface it —
// so toolDescription() also injects the requirement into the tool description,
// which is what actually reaches the model on every call. annotationsFor()
// treats every verb here as destructive too, so the two signals stay in sync.
const IRREVERSIBLE_VERBS = [
  "delete",
  "remove",
  "revoke",
  "reject",
  "recall",
  "quit",
  "cancel",
  "disband",
];

const CONFIRM_PREFIX =
  "⚠️【不可逆操作，调用前必须确认】此操作不可撤销。调用前必须先向用户说明：" +
  "(1) 将要执行的具体操作；(2) 影响的对象与范围；(3) 该操作不可逆。" +
  "获得用户明确确认后才能调用。\n";

export function isIrreversible(command) {
  const verb = command.path[command.path.length - 1].toLowerCase();
  return IRREVERSIBLE_VERBS.some((v) => verb === v || verb.startsWith(v + "-"));
}

// Returns the tool description, prefixed with a mandatory-confirmation notice
// when the command is irreversible. Both Local and Remote build their tool list
// through this so the warning stays consistent across transports.
export function toolDescription(command) {
  return isIrreversible(command)
    ? CONFIRM_PREFIX + command.description
    : command.description;
}
