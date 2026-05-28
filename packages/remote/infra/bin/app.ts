import { App, Tags } from "aws-cdk-lib";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { OAuthStack } from "../lib/oauth-stack.ts";
import { RuntimeStack } from "../lib/runtime-stack.ts";
import { WafStack } from "../lib/waf-stack.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));

const region = process.env.CDK_DEFAULT_REGION || "us-east-1";
const account = process.env.CDK_DEFAULT_ACCOUNT;
const env = { account, region };

const app = new App();

const ctx = {
  alarmPreset: app.node.tryGetContext("alarmPreset") || "standard",
  alarmWebhookUrl: app.node.tryGetContext("alarmWebhookUrl") || "",
  enableWaf: app.node.tryGetContext("enableWaf") === "true",
  dingtalkAppId: app.node.tryGetContext("dingtalkAppId") || "PLACEHOLDER_APP_ID",
  oauthBaseUrl: app.node.tryGetContext("oauthBaseUrl") || "",
};

const configRoot = join(__dirname, "..", "..", "..", "..", "config");
const i18n = JSON.parse(readFileSync(join(configRoot, "i18n.json"), "utf8"));
const alarmThresholds = JSON.parse(readFileSync(join(configRoot, "alarm-thresholds.json"), "utf8"));
const oauthScopes = JSON.parse(readFileSync(join(configRoot, "oauth-scopes.json"), "utf8"));
void oauthScopes; // currently used only by deploy.sh; kept loaded for future stack consumption

const oauthStack = new OAuthStack(app, "QdmRemoteOAuth", {
  env,
  alarmPreset: ctx.alarmPreset,
  alarmWebhookUrl: ctx.alarmWebhookUrl,
  alarmThresholds,
  i18n,
  dingtalkAppId: ctx.dingtalkAppId,
});

const runtimeStack = new RuntimeStack(app, "QdmRemoteRuntime", {
  env,
  oauthBaseUrl: ctx.oauthBaseUrl,
  userTokenSecretArnPrefix: oauthStack.userTokenSecretArnPrefix,
});
runtimeStack.addDependency(oauthStack);

if (ctx.enableWaf) {
  // WAFStack must be in us-east-1 for CloudFront-scope ACLs.
  new WafStack(app, "QdmRemoteWaf", { env: { account, region: "us-east-1" } });
}

Tags.of(app).add("project", "quick-dingtalk-mcp");
Tags.of(app).add("plan", "v0.2-plan2");
