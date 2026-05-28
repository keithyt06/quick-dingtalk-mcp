import type { SNSEvent, Context } from "aws-lambda";
import { log } from "../shared/log.ts";

const WEBHOOK_URL = process.env.DINGTALK_WEBHOOK_URL || "";
const DASHBOARD_URL = process.env.CLOUDWATCH_DASHBOARD_URL || "";

type AlarmPayload = {
  AlarmName: string;
  NewStateValue: string;
  NewStateReason: string;
  Trigger?: {
    MetricName?: string;
    Namespace?: string;
    Threshold?: number;
    Statistic?: string;
  };
};

function renderMarkdown(alarm: AlarmPayload): string {
  const lines = [
    `### [quick-dingtalk-mcp] 告警: ${alarm.AlarmName}`,
    `- 状态：${alarm.NewStateValue}`,
    alarm.Trigger?.MetricName ? `- 指标：${alarm.Trigger.Namespace}/${alarm.Trigger.MetricName}` : null,
    alarm.Trigger?.Threshold != null ? `- 阈值：${alarm.Trigger.Statistic} ${alarm.Trigger.Threshold}` : null,
    `- 原因：${alarm.NewStateReason}`,
    DASHBOARD_URL ? `- [查看 Dashboard](${DASHBOARD_URL})` : null,
  ].filter((l): l is string => !!l);
  return lines.join("\n");
}

export const handler = async (event: SNSEvent, _ctx: Context): Promise<{ ok: boolean; sent: number }> => {
  if (!WEBHOOK_URL) {
    log.warn("DINGTALK_WEBHOOK_URL not set, skipping");
    return { ok: true, sent: 0 };
  }
  let sent = 0;
  for (const rec of event.Records) {
    let payload: AlarmPayload;
    try { payload = JSON.parse(rec.Sns.Message); }
    catch (e: any) {
      log.error("malformed SNS message", { err: e.message });
      continue;
    }
    const text = renderMarkdown(payload);
    const body = JSON.stringify({ msgtype: "markdown", markdown: { title: payload.AlarmName, text } });
    try {
      const r = await fetch(WEBHOOK_URL, { method: "POST", headers: { "content-type": "application/json" }, body });
      if (!r.ok) log.error("webhook non-2xx", { status: r.status });
      else sent++;
    } catch (e: any) {
      log.error("webhook fetch failed", { err: e.message });
    }
  }
  return { ok: true, sent };
};
