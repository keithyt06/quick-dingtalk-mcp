import { test } from "node:test";
import assert from "node:assert/strict";
import { App } from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { OAuthStack } from "../lib/oauth-stack.ts";
import { WafStack } from "../lib/waf-stack.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const configRoot = join(__dirname, "..", "..", "..", "..", "config");
const i18n = JSON.parse(readFileSync(join(configRoot, "i18n.json"), "utf8"));
const alarmThresholds = JSON.parse(readFileSync(join(configRoot, "alarm-thresholds.json"), "utf8"));

test("OAuthStack synthesizes with expected resource counts", () => {
  const app = new App();
  const stack = new OAuthStack(app, "TestOAuth", {
    env: { account: "111122223333", region: "us-east-1" },
    alarmPreset: "standard",
    alarmWebhookUrl: "",
    alarmThresholds,
    i18n,
    dingtalkAppId: "fake",
  });
  const t = Template.fromStack(stack);
  t.resourceCountIs("AWS::DynamoDB::Table", 1);
  t.resourceCountIs("AWS::Lambda::Function", 2);
  t.resourceCountIs("AWS::ApiGatewayV2::Api", 1);
  t.resourceCountIs("AWS::CloudFront::Distribution", 1);
  t.resourceCountIs("AWS::SSM::Parameter", 2);
  t.resourceCountIs("AWS::SNS::Topic", 1);
  t.resourceCountIs("AWS::CloudWatch::Alarm", 10);
  t.resourceCountIs("AWS::CloudWatch::Dashboard", 1);
  // review #10: open DCR endpoint must be throttled at the API GW stage.
  t.hasResourceProperties("AWS::ApiGatewayV2::Stage", {
    RouteSettings: {
      "POST /register": { ThrottlingRateLimit: 1, ThrottlingBurstLimit: 10 },
    },
  });
  // deploy.sh upserts client#quick by table name — the output must exist.
  t.hasOutput("OAuthStateTableName", {});
  // Alarm periods must come from config/alarm-thresholds.json (standard:
  // refresh_failure_users period_seconds=1800, api_gw_5xx 60), not the CDK
  // 300s default — `.with({ period })` was missing and the field was dead.
  t.hasResourceProperties("AWS::CloudWatch::Alarm", {
    AlarmName: "qdm-remote-RefreshFailureUsers",
    Period: 1800,
  });
  t.hasResourceProperties("AWS::CloudWatch::Alarm", {
    AlarmName: "qdm-remote-ApiGw5xxPersistent",
    Period: 60,
  });
});

test("OAuthStack with alarm webhook URL → 3 Lambdas", () => {
  const app = new App();
  const stack = new OAuthStack(app, "TestOAuthWebhook", {
    env: { account: "111122223333", region: "us-east-1" },
    alarmPreset: "standard",
    alarmWebhookUrl: "https://oapi.dingtalk.com/robot/send?access_token=fake",
    alarmThresholds,
    i18n,
    dingtalkAppId: "fake",
  });
  const t = Template.fromStack(stack);
  t.resourceCountIs("AWS::Lambda::Function", 3);
});

test("WafStack synthesizes a CLOUDFRONT-scope WebACL", () => {
  const app = new App();
  const stack = new WafStack(app, "TestWaf", { env: { account: "111122223333", region: "us-east-1" } });
  const t = Template.fromStack(stack);
  t.hasResourceProperties("AWS::WAFv2::WebACL", { Scope: "CLOUDFRONT" });
});

test("WafStack rejects non-us-east-1 region", () => {
  const app = new App();
  assert.throws(() => new WafStack(app, "TestWaf", { env: { account: "111122223333", region: "us-west-2" } }), /us-east-1/);
});
