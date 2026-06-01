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
      ],
      resources: [
        this.userTokenSecretArnPrefix,
        `arn:aws:secretsmanager:${this.region}:${this.account}:secret:quick-dingtalk-mcp/*`,
      ],
    }));
    // ListSecrets is an account-level action that does NOT support
    // resource-level scoping — it MUST be granted on Resource "*", otherwise
    // every call is denied. The EventBridge refresh path lists all user secrets
    // to find near-expiry tokens, so without this the auto-refresh silently
    // fails and tokens expire (clients then get 503 token-near-expiry).
    this.tokenRefreshShim.addToRolePolicy(new iam.PolicyStatement({
      actions: ["secretsmanager:ListSecrets"],
      resources: ["*"],
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

    // OAUTH_BASE_URL is the public CloudFront URL — Lambda needs it to build
    // redirect_uri for DingTalk OAuth. Available only after distribution is
    // constructed, so we addEnvironment() after-the-fact.
    const oauthBaseUrl = `https://${this.distribution.distributionDomainName}`;
    this.tokenRefreshShim.addEnvironment("OAUTH_BASE_URL", oauthBaseUrl);
    this.mcpMiddleware.addEnvironment("OAUTH_BASE_URL", oauthBaseUrl);

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

  // T16: Dashboard 5 sections / 12 widgets + 10 Alarms.
  private _attachDashboardAndAlarms(thresholds: any, preset: string): void {
    const t = thresholds[preset] || thresholds.standard;
    const snsAction = new cwa.SnsAction(this.snsTopic);

    const COMPARISON_MAP: Record<string, cw.ComparisonOperator> = {
      GreaterThanThreshold: cw.ComparisonOperator.GREATER_THAN_THRESHOLD,
      GreaterThanOrEqualToThreshold: cw.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      LessThanThreshold: cw.ComparisonOperator.LESS_THAN_THRESHOLD,
      LessThanOrEqualToThreshold: cw.ComparisonOperator.LESS_THAN_OR_EQUAL_TO_THRESHOLD,
    };

    // Use absolute error count instead of error rate (errors/invocations).
    // CloudFormation rejects MathExpression with implicit IDs in some setups
    // (`Error in expression 'expr_1': Invalid syntax`). lark-mcp-on-agentcore
    // also uses metricErrors() — we follow the same simpler pattern.
    const lambdaErrors = (fn: lambda.Function): cw.IMetric => fn.metricErrors();

    const alarmDefs: Array<{ id: string; metric: cw.IMetric; key: string; description: string }> = [
      {
        id: "ApiGw5xxPersistent",
        metric: new cw.Metric({ namespace: "AWS/ApiGateway", metricName: "5XXError", statistic: "Sum" }),
        key: "api_gw_5xx_persistent",
        description: "API Gateway 5xx errors persistent",
      },
      {
        id: "MiddlewareErrorRate",
        metric: lambdaErrors(this.mcpMiddleware),
        key: "middleware_error_rate",
        description: "mcp-middleware error rate",
      },
      {
        id: "LambdaThrottle",
        metric: this.mcpMiddleware.metricThrottles(),
        key: "lambda_throttle",
        description: "Any Lambda throttle event",
      },
      {
        id: "RefreshFailureUsers",
        metric: new cw.Metric({ namespace: "QuickDingtalkMcp/Remote", metricName: "RefreshFailureUsers", statistic: "Sum" }),
        key: "refresh_failure_users",
        description: "EventBridge refresh failed users",
      },
      {
        id: "RuntimeInvocationFailure",
        metric: new cw.Metric({ namespace: "AWS/BedrockAgentCore", metricName: "InvocationErrors", statistic: "Sum" }),
        key: "runtime_invocation_failure",
        description: "AgentCore Runtime invocation failures",
      },
      {
        id: "Container5xx",
        metric: new cw.Metric({ namespace: "QuickDingtalkMcp/Runtime", metricName: "Container5xx", statistic: "Sum" }),
        key: "container_5xx",
        description: "Container 5xx (server.js)",
      },
      {
        id: "ServerBusyPersistent",
        metric: new cw.Metric({ namespace: "QuickDingtalkMcp/Runtime", metricName: "ServerBusy", statistic: "Sum" }),
        key: "server_busy_persistent",
        description: "Semaphore queue full",
      },
      {
        id: "SmThrottle",
        metric: new cw.Metric({ namespace: "AWS/SecretsManager", metricName: "ThrottledRequests", statistic: "Sum" }),
        key: "sm_throttle",
        description: "Secrets Manager throttle",
      },
      {
        id: "DdbThrottle",
        metric: new cw.Metric({ namespace: "AWS/DynamoDB", metricName: "ThrottledRequests", statistic: "Sum" }),
        key: "ddb_throttle",
        description: "DynamoDB throttle",
      },
      {
        id: "OAuthCallbackFailureRate",
        metric: lambdaErrors(this.tokenRefreshShim),
        key: "oauth_callback_failure_rate",
        description: "OAuth callback failure rate",
      },
    ];

    for (const def of alarmDefs) {
      const cfg = t[def.key];
      const comparison = COMPARISON_MAP[cfg.comparison] || cw.ComparisonOperator.GREATER_THAN_THRESHOLD;
      const alarm = new cw.Alarm(this, `Alarm${def.id}`, {
        alarmName: `qdm-remote-${def.id}`,
        metric: def.metric,
        threshold: cfg.threshold,
        evaluationPeriods: cfg.evaluation_periods,
        comparisonOperator: comparison,
        treatMissingData: cw.TreatMissingData.NOT_BREACHING,
        alarmDescription: def.description,
      });
      alarm.addAlarmAction(snsAction);
    }

    // ---- Dashboard (5 sections, 12 widgets) ----
    const dashboard = new cw.Dashboard(this, "Dashboard", { dashboardName: this.dashboardName });
    // Section 1: Ingress traffic
    dashboard.addWidgets(
      new cw.GraphWidget({
        title: "API GW 4xx/5xx", width: 12,
        left: [new cw.Metric({ namespace: "AWS/ApiGateway", metricName: "4XXError", statistic: "Sum" })],
        right: [new cw.Metric({ namespace: "AWS/ApiGateway", metricName: "5XXError", statistic: "Sum" })],
      }),
      new cw.GraphWidget({
        title: "API GW Latency p50/p99", width: 12,
        left: [
          new cw.Metric({ namespace: "AWS/ApiGateway", metricName: "Latency", statistic: "p50" }),
          new cw.Metric({ namespace: "AWS/ApiGateway", metricName: "Latency", statistic: "p99" }),
        ],
      }),
    );
    // Section 2: Lambda health
    dashboard.addWidgets(
      new cw.GraphWidget({
        title: "mcp-middleware errors / invocations", width: 12,
        left: [this.mcpMiddleware.metricErrors(), this.mcpMiddleware.metricInvocations()],
      }),
      new cw.GraphWidget({
        title: "mcp-middleware duration p99", width: 12,
        left: [this.mcpMiddleware.metricDuration({ statistic: "p99" })],
      }),
    );
    // Section 3: OAuth flow
    dashboard.addWidgets(
      new cw.GraphWidget({
        title: "token-refresh-shim errors", width: 12,
        left: [this.tokenRefreshShim.metricErrors(), this.tokenRefreshShim.metricInvocations()],
      }),
      new cw.GraphWidget({
        title: "Refresh failure users", width: 12,
        left: [new cw.Metric({ namespace: "QuickDingtalkMcp/Remote", metricName: "RefreshFailureUsers", statistic: "Sum" })],
      }),
    );
    // Section 4: Runtime container
    dashboard.addWidgets(
      new cw.GraphWidget({
        title: "AgentCore invocation count / errors", width: 12,
        left: [new cw.Metric({ namespace: "AWS/BedrockAgentCore", metricName: "InvocationCount", statistic: "Sum" })],
        right: [new cw.Metric({ namespace: "AWS/BedrockAgentCore", metricName: "InvocationErrors", statistic: "Sum" })],
      }),
      new cw.GraphWidget({
        title: "Container semaphore depth + busy", width: 12,
        left: [new cw.Metric({ namespace: "QuickDingtalkMcp/Runtime", metricName: "QueueDepth", statistic: "Average" })],
        right: [new cw.Metric({ namespace: "QuickDingtalkMcp/Runtime", metricName: "ServerBusy", statistic: "Sum" })],
      }),
    );
    // Section 5: Business errors
    dashboard.addWidgets(
      new cw.GraphWidget({
        title: "PAT triggers", width: 12,
        left: [new cw.Metric({ namespace: "QuickDingtalkMcp/Runtime", metricName: "PATTrigger", statistic: "Sum" })],
      }),
      new cw.GraphWidget({
        title: "dws non-zero exits", width: 12,
        left: [new cw.Metric({ namespace: "QuickDingtalkMcp/Runtime", metricName: "DwsNonZeroExit", statistic: "Sum" })],
      }),
    );
  }
}
