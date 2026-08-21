// ABOUTME: Tests the Slack audit notifier: metadata only, never payload field values.
// ABOUTME: Covers preview, confirmed success/failure/rejected, and the no-op-when-unconfigured path.
import { describe, it, expect, vi } from "vitest";
import { createAuditNotifier, formatAuditMessage } from "./audit";

describe("formatAuditMessage", () => {
  it("formats a preview event", () => {
    const msg = formatAuditMessage({ type: "preview", operationId: "updateWorkOrder", caller: "owner", url: "/work_orders/42" });
    expect(msg).toContain("owner");
    expect(msg).toContain("updateWorkOrder");
    expect(msg).toContain("/work_orders/42");
  });

  it("formats a rejected preview event distinctly from a normal preview and a confirmed-rejected event", () => {
    const previewMsg = formatAuditMessage({ type: "preview", operationId: "updateWorkOrder", caller: "owner", url: "/work_orders/42" });
    const rejectedPreviewMsg = formatAuditMessage({
      type: "preview",
      operationId: "updateWorkOrder",
      caller: "owner",
      url: "/work_orders/42",
      outcome: "rejected",
    });
    const confirmedRejectedMsg = formatAuditMessage({
      type: "confirmed",
      operationId: "updateWorkOrder",
      caller: "owner",
      url: "/work_orders/42",
      outcome: "rejected",
    });

    expect(rejectedPreviewMsg).toContain("owner");
    expect(rejectedPreviewMsg).toContain("updateWorkOrder");
    expect(rejectedPreviewMsg).toContain("denied");
    expect(rejectedPreviewMsg).not.toContain("previewed");
    expect(rejectedPreviewMsg).not.toEqual(previewMsg);
    expect(rejectedPreviewMsg).not.toEqual(confirmedRejectedMsg);
  });

  it("formats a confirmed success event", () => {
    const msg = formatAuditMessage({ type: "confirmed", caller: "admin", url: "/bills/9", outcome: "success" });
    expect(msg).toContain("admin");
    expect(msg).toContain("success");
  });

  it("formats a confirmed failure event", () => {
    const msg = formatAuditMessage({ type: "confirmed", caller: "admin", url: "/bills/9", outcome: "failure" });
    expect(msg).toContain("failure");
  });

  it("formats a confirmed rejected event distinctly from failure", () => {
    const msg = formatAuditMessage({
      type: "confirmed",
      operationId: "deleteTenant",
      caller: "owner",
      url: "/tenants/7",
      outcome: "rejected",
    });
    expect(msg).toContain("owner");
    expect(msg).toContain("deleteTenant");
    expect(msg).toContain("rejected");
    expect(msg).not.toContain("failure");
  });
});

describe("createAuditNotifier", () => {
  it("posts the formatted message to the webhook URL", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("ok"));
    const notify = createAuditNotifier("https://hooks.slack.com/services/T/B/X", fetchImpl);

    await notify({ type: "preview", operationId: "updateWorkOrder", caller: "owner", url: "/work_orders/42" });

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://hooks.slack.com/services/T/B/X",
      expect.objectContaining({ method: "POST" })
    );
    const body = JSON.parse((fetchImpl.mock.calls[0][1] as RequestInit).body as string);
    expect(body.text).toContain("updateWorkOrder");
  });

  it("is a no-op when no webhook URL is configured", async () => {
    const fetchImpl = vi.fn();
    const notify = createAuditNotifier(undefined, fetchImpl);

    await notify({ type: "preview", operationId: "x", caller: "owner", url: "/x" });

    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("does not throw when the webhook fetch fails, and logs the failure", async () => {
    const fetchError = new Error("network down");
    const fetchImpl = vi.fn().mockRejectedValue(fetchError);
    const notify = createAuditNotifier("https://hooks.slack.com/services/T/B/X", fetchImpl);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      notify({ type: "confirmed", operationId: "updateWorkOrder", caller: "owner", url: "/work_orders/42", outcome: "success" })
    ).resolves.toBeUndefined();

    expect(consoleError).toHaveBeenCalledWith("notifyAudit: failed to post to Slack webhook", fetchError);
    consoleError.mockRestore();
  });

  it("never includes payload field values, only metadata", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("ok"));
    const notify = createAuditNotifier("https://hooks.slack.com/services/T/B/X", fetchImpl);

    await notify({ type: "confirmed", operationId: "updateWorkOrder", caller: "owner", url: "/work_orders/42", outcome: "success" });

    const body = JSON.parse((fetchImpl.mock.calls[0][1] as RequestInit).body as string);
    expect(body.text).not.toContain("body");
    expect(Object.keys(body)).toEqual(["text"]);
  });
});
