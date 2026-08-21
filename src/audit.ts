// ABOUTME: Posts write-event notifications to a Slack incoming webhook for every preview and
// ABOUTME: confirmed write attempt. Metadata only (who, what, when, outcome), never payload values.
import type { AuditEvent } from "./database/tools";

export function formatAuditMessage(event: AuditEvent): string {
  const timestamp = new Date().toISOString();
  const operation = event.operationId ?? "unknown-operation";

  if (event.type === "preview") {
    if (event.outcome === "rejected") {
      return `:no_entry_sign: [${timestamp}] *${event.caller}* attempted \`${operation}\` → \`${event.url}\` and was denied`;
    }
    return `:eyes: [${timestamp}] *${event.caller}* previewed \`${operation}\` → \`${event.url}\``;
  }

  const icon = { success: ":white_check_mark:", failure: ":x:", rejected: ":no_entry_sign:" }[
    event.outcome ?? "failure"
  ];
  return `${icon} [${timestamp}] *${event.caller}* confirmed \`${operation}\` → \`${event.url}\` (${event.outcome})`;
}

export function createAuditNotifier(webhookUrl: string | undefined, fetchImpl: typeof fetch = fetch) {
  return async function notifyAudit(event: AuditEvent): Promise<void> {
    if (!webhookUrl) return;
    try {
      await fetchImpl(webhookUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: formatAuditMessage(event) }),
      });
    } catch (err) {
      console.error("notifyAudit: failed to post to Slack webhook", err);
    }
  };
}
