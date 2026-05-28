import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

const fetchCalls: any[] = [];
let fetchImpl: (url: string, init?: any) => Promise<Response> = async () => new Response("ok", { status: 200 });
(globalThis as any).fetch = (url: string, init?: any) => { fetchCalls.push({ url, init }); return fetchImpl(url, init); };

beforeEach(() => { fetchCalls.length = 0; });

function snsEvent(message: any): any {
  return { Records: [{ Sns: { Message: JSON.stringify(message) } }] };
}

test("no webhook URL → returns sent=0, doesn't throw", async () => {
  delete process.env.DINGTALK_WEBHOOK_URL;
  const { handler } = await import("./index.ts");
  const r = await handler(snsEvent({ AlarmName: "test", NewStateValue: "ALARM", NewStateReason: "x" }), {} as any);
  assert.equal(r.sent, 0);
  assert.equal(fetchCalls.length, 0);
});

test("with webhook URL → posts markdown card", async () => {
  process.env.DINGTALK_WEBHOOK_URL = "https://oapi.dingtalk.com/robot/send?access_token=fake";
  const mod = await import(`./index.ts?cache=${Date.now()}`); // bust module cache
  const r = await mod.handler(snsEvent({
    AlarmName: "MiddlewareErrorRate",
    NewStateValue: "ALARM",
    NewStateReason: "Threshold crossed: 0.07 > 0.05",
    Trigger: { MetricName: "Errors", Namespace: "AWS/Lambda", Threshold: 0.05, Statistic: "Average" },
  }), {} as any);
  assert.equal(r.sent, 1);
  assert.equal(fetchCalls.length, 1);
  const body = JSON.parse(fetchCalls[0].init.body);
  assert.equal(body.msgtype, "markdown");
  assert.match(body.markdown.text, /MiddlewareErrorRate/);
});

test("with webhook URL but webhook 5xx → sent=0, doesn't throw", async () => {
  process.env.DINGTALK_WEBHOOK_URL = "https://oapi.dingtalk.com/robot/send?access_token=fake";
  fetchImpl = async () => new Response("oops", { status: 500 });
  const mod = await import(`./index.ts?cache=${Date.now() + 1}`);
  const r = await mod.handler(snsEvent({ AlarmName: "x", NewStateValue: "ALARM", NewStateReason: "y" }), {} as any);
  assert.equal(r.sent, 0);
});
