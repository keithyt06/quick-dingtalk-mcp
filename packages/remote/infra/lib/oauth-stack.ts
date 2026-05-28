import { Stack, StackProps, Duration, RemovalPolicy, CfnOutput } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as ddb from "aws-cdk-lib/aws-dynamodb";
import * as ssm from "aws-cdk-lib/aws-ssm";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as apigw from "aws-cdk-lib/aws-apigatewayv2";
import * as integrations from "aws-cdk-lib/aws-apigatewayv2-integrations";
import * as cf from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as iam from "aws-cdk-lib/aws-iam";
import * as events from "aws-cdk-lib/aws-events";
import * as targets from "aws-cdk-lib/aws-events-targets";
import * as sns from "aws-cdk-lib/aws-sns";
import * as snsSubs from "aws-cdk-lib/aws-sns-subscriptions";
import * as cw from "aws-cdk-lib/aws-cloudwatch";
import * as cwa from "aws-cdk-lib/aws-cloudwatch-actions";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface OAuthStackProps extends StackProps {
  alarmPreset: string;
  alarmWebhookUrl: string;
  alarmThresholds: any;
  i18n: any;
  dingtalkAppId: string;
}

export class OAuthStack extends Stack {
  public readonly userTokenSecretArnPrefix: string;
  public readonly tokenRefreshShim: lambda.Function;
  public readonly mcpMiddleware: lambda.Function;
  public readonly snsTopic: sns.Topic;
  public readonly dashboardName: string;
  public readonly httpApi: apigw.HttpApi;
  public readonly distribution: cf.Distribution;

  constructor(scope: Construct, id: string, props: OAuthStackProps) {
    super(scope, id, props);

    // --- DynamoDB (OAuth state, 5min TTL) ---
    const stateTable = new ddb.Table(this, "OAuthStateTable", {
      partitionKey: { name: "state", type: ddb.AttributeType.STRING },
      timeToLiveAttribute: "ttl",
      billingMode: ddb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.DESTROY,
      pointInTimeRecovery: false,
    });

    // --- SSM HMAC key (auto-generated; rotated manually) ---
    const hmacKey = new ssm.StringParameter(this, "HmacKeyParam", {
      parameterName: `/qdm-remote/${id}/hmac-key`,
      stringValue: "REPLACE_AT_DEPLOY", // deploy.sh post-step writes a real 64-hex value
      description: "HMAC-SHA256 signing key for MCP + incrAuth tokens",
    });

    const dingtalkAppSecretParam = new ssm.StringParameter(this, "DingtalkAppSecretParam", {
      parameterName: `/qdm-remote/${id}/dingtalk-app-secret`,
      stringValue: "REPLACE_AT_DEPLOY",
      description: "DingTalk Open Platform AppSecret (deploy.sh prompts and writes)",
    });

    // --- Secrets Manager namespace (per-user secrets created on demand) ---
    this.userTokenSecretArnPrefix = `arn:aws:secretsmanager:${this.region}:${this.account}:secret:quick-dingtalk-mcp/users/*`;

    // --- Lambdas ---
    const lambdaCommonEnv: Record<string, string> = {
      OAUTH_STATE_TABLE: stateTable.tableName,
      HMAC_KEY_PARAM: hmacKey.parameterName,
      DINGTALK_APP_ID: props.dingtalkAppId,
      DINGTALK_APP_SECRET_PARAM: dingtalkAppSecretParam.parameterName,
      LOG_LEVEL: "info",
    };

    this.tokenRefreshShim = new lambda.Function(this, "TokenRefreshShim", {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "index.handler",
      code: lambda.Code.fromAsset(join(__dirname, "..", "..", "dist", "token-refresh-shim")),
      memorySize: 512,
      timeout: Duration.seconds(10),
      environment: lambdaCommonEnv,
    });
    stateTable.grantReadWriteData(this.tokenRefreshShim);
    hmacKey.grantRead(this.tokenRefreshShim);
    dingtalkAppSecretParam.grantRead(this.tokenRefreshShim);
    this.tokenRefreshShim.addToRolePolicy(new iam.PolicyStatement({
      actions: [
        "secretsmanager:GetSecretValue",
        "secretsmanager:PutSecretValue",
        "secretsmanager:CreateSecret",
        "secretsmanager:DeleteSecret",
        "secretsmanager:ListSecrets",
      ],
      resources: [
        this.userTokenSecretArnPrefix,
        `arn:aws:secretsmanager:${this.region}:${this.account}:secret:quick-dingtalk-mcp/*`,
      ],
    }));

    this.mcpMiddleware = new lambda.Function(this, "McpMiddleware", {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "index.handler",
      code: lambda.Code.fromAsset(join(__dirname, "..", "..", "dist", "mcp-middleware")),
      memorySize: 1024,
      timeout: Duration.seconds(28),
      environment: {
        ...lambdaCommonEnv,
        AGENTCORE_RUNTIME_URL: "REPLACE_AT_DEPLOY", // updated post-RuntimeStack
        UPSTREAM_TIMEOUT_MS: "25000",
      },
    });
    hmacKey.grantRead(this.mcpMiddleware);
    this.mcpMiddleware.addToRolePolicy(new iam.PolicyStatement({
      actions: ["secretsmanager:GetSecretValue"],
      resources: [this.userTokenSecretArnPrefix],
    }));
    this.mcpMiddleware.addToRolePolicy(new iam.PolicyStatement({
      actions: ["bedrock-agentcore:InvokeAgentRuntime"],
      resources: ["*"], // restricted post-RuntimeStack via runtime-stack.ts policy update
    }));

    // --- API Gateway HTTP API ---
    this.httpApi = new apigw.HttpApi(this, "OAuthApi", {
      apiName: "qdm-remote-oauth",
      corsPreflight: {
        allowMethods: [apigw.CorsHttpMethod.GET, apigw.CorsHttpMethod.POST],
        allowOrigins: ["*"],
        allowHeaders: ["authorization", "content-type"],
      },
    });
    this.httpApi.addRoutes({
      path: "/authorize",
      methods: [apigw.HttpMethod.GET],
      integration: new integrations.HttpLambdaIntegration("AuthorizeInt", this.tokenRefreshShim),
    });
    this.httpApi.addRoutes({
      path: "/callback",
      methods: [apigw.HttpMethod.GET],
      integration: new integrations.HttpLambdaIntegration("CallbackInt", this.tokenRefreshShim),
    });
    this.httpApi.addRoutes({
      path: "/mcp",
      methods: [apigw.HttpMethod.POST],
      integration: new integrations.HttpLambdaIntegration("McpInt", this.mcpMiddleware),
    });

    // --- CloudFront in front of API Gateway ---
    this.distribution = new cf.Distribution(this, "Distribution", {
      defaultBehavior: {
        origin: new origins.HttpOrigin(`${this.httpApi.apiId}.execute-api.${this.region}.amazonaws.com`),
        viewerProtocolPolicy: cf.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cf.AllowedMethods.ALLOW_ALL,
        cachePolicy: cf.CachePolicy.CACHING_DISABLED, // no-store; per-user content
        originRequestPolicy: cf.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
      },
      priceClass: cf.PriceClass.PRICE_CLASS_100,
    });

    // --- EventBridge schedule: refresh every 30min ---
    new events.Rule(this, "RefreshSchedule", {
      schedule: events.Schedule.rate(Duration.minutes(30)),
      targets: [new targets.LambdaFunction(this.tokenRefreshShim)],
    });

    // --- SNS topic + alarm-webhook Lambda (conditional) ---
    this.snsTopic = new sns.Topic(this, "AlarmSns", { displayName: "qdm-remote-alarms" });

    if (props.alarmWebhookUrl) {
      const alarmFn = new lambda.Function(this, "AlarmWebhook", {
        runtime: lambda.Runtime.NODEJS_20_X,
        handler: "index.handler",
        code: lambda.Code.fromAsset(join(__dirname, "..", "..", "dist", "alarm-webhook")),
        memorySize: 256,
        timeout: Duration.seconds(10),
        environment: {
          DINGTALK_WEBHOOK_URL: props.alarmWebhookUrl,
          CLOUDWATCH_DASHBOARD_URL: `https://console.aws.amazon.com/cloudwatch/home?region=${this.region}#dashboards:name=qdm-remote`,
          LOG_LEVEL: "info",
        },
      });
      this.snsTopic.addSubscription(new snsSubs.LambdaSubscription(alarmFn));
    }

    new CfnOutput(this, "OAuthBaseUrl", { value: `https://${this.distribution.distributionDomainName}` });
    new CfnOutput(this, "ApiId", { value: this.httpApi.apiId });
    new CfnOutput(this, "DistributionId", { value: this.distribution.distributionId });
    new CfnOutput(this, "TokenRefreshShimArn", { value: this.tokenRefreshShim.functionArn });
    new CfnOutput(this, "McpMiddlewareArn", { value: this.mcpMiddleware.functionArn });
    new CfnOutput(this, "SnsTopicArn", { value: this.snsTopic.topicArn });

    this.dashboardName = "qdm-remote";
    this._attachDashboardAndAlarms(props.alarmThresholds, props.alarmPreset);
  }

  // T16 fills this in (Dashboard + 10 alarms).
  private _attachDashboardAndAlarms(_thresholds: any, _preset: string): void {
    void _thresholds; void _preset;
  }
}
