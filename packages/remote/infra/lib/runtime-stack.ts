import { Stack, StackProps, CfnOutput } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as ecr_assets from "aws-cdk-lib/aws-ecr-assets";
import * as iam from "aws-cdk-lib/aws-iam";
import * as agentcore from "aws-cdk-lib/aws-bedrockagentcore";
import * as ssm from "aws-cdk-lib/aws-ssm";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface RuntimeStackProps extends StackProps {
  oauthBaseUrl: string;
  userTokenSecretArnPrefix: string;
}

// RuntimeStack: ECR image + IAM role + the AgentCore Runtime itself
// (AWS::BedrockAgentCore::Runtime — the CFN resource type that didn't exist
// when this project started; the boto3 create-agent-runtime side-channel in
// deploy.sh is gone).
//
// The runtime's invoke ARN is published to SSM
// (/qdm-remote/agentcore-runtime-arn); mcp-middleware reads it at cold start
// and builds the invoke URL itself, so no post-deploy env patching is needed.
export class RuntimeStack extends Stack {
  public readonly imageUri: string;
  public readonly runtimeRoleArn: string;

  constructor(scope: Construct, id: string, props: RuntimeStackProps) {
    super(scope, id, props);

    // --- Docker image asset ---
    // Build context: packages/ (so Dockerfile can COPY remote/docker + shared)
    // ARM64 = Graviton, ~30% cheaper than AMD64 on Lambda/Fargate-class infra.
    const image = new ecr_assets.DockerImageAsset(this, "Image", {
      directory: join(__dirname, "..", "..", ".."),
      file: "remote/docker/Dockerfile",
      platform: ecr_assets.Platform.LINUX_ARM64,
      buildArgs: {
        DWS_VERSION: "1.0.32",
      },
    });
    this.imageUri = image.imageUri;

    // --- IAM role for AgentCore Runtime ---
    // Trust policy: bedrock-agentcore.amazonaws.com assumes this role at
    // runtime invocation time (post-create-agent-runtime via boto3).
    const runtimeRole = new iam.Role(this, "RuntimeRole", {
      assumedBy: new iam.ServicePrincipal("bedrock-agentcore.amazonaws.com"),
      description: "Role assumed by AgentCore Runtime for qdm-remote container",
    });
    runtimeRole.addToPolicy(new iam.PolicyStatement({
      actions: ["secretsmanager:GetSecretValue"],
      resources: [props.userTokenSecretArnPrefix],
    }));
    runtimeRole.addToPolicy(new iam.PolicyStatement({
      actions: ["logs:CreateLogStream", "logs:PutLogEvents", "logs:CreateLogGroup"],
      // AgentCore writes container logs to /aws/bedrock-agentcore/runtimes/
      // <runtime-id>-DEFAULT (observed live). The old `qdm-remote*` prefix
      // matched nothing — runtime-id is platform-generated, not our name.
      resources: [`arn:aws:logs:${this.region}:${this.account}:log-group:/aws/bedrock-agentcore/runtimes/*`],
    }));
    image.repository.grantPull(runtimeRole);
    this.runtimeRoleArn = runtimeRole.roleArn;

    // --- AgentCore Runtime ---
    const runtime = new agentcore.CfnRuntime(this, "Runtime", {
      agentRuntimeName: "qdm_remote",
      description: "quick-dingtalk-mcp Remote",
      agentRuntimeArtifact: { containerConfiguration: { containerUri: image.imageUri } },
      roleArn: runtimeRole.roleArn,
      networkConfiguration: { networkMode: "PUBLIC" },
      protocolConfiguration: "HTTP",
      environmentVariables: {
        OAUTH_BASE_URL: props.oauthBaseUrl,
        INJECT_STRATEGY: "d2", // dws auth login --token (verified live); d1 is a stub.
        MAX_CONCURRENT: "10",
        // AgentCore's HTTP contract health-checks and invokes 0.0.0.0:8080.
        // Any other port => every call returns 502 with no container logs.
        PORT: "8080",
        DINGTALK_DWS_AGENTCODE: "quick-dingtalk-mcp",
        DWS_DISABLE_KEYCHAIN: "1",
      },
      // AgentCore strips ALL inbound request headers by default. mcp-middleware
      // passes per-user identity via these custom headers; without the allowlist
      // the container never sees them and returns 401.
      requestHeaderConfiguration: {
        requestHeaderAllowlist: ["x-user-id", "x-user-access-token", "x-incr-auth-token"],
      },
    });

    // Published for mcp-middleware (OAuthStack), which builds the invoke URL
    // from this ARN at cold start. SSM parameters are regional, so multi-region
    // deployments in one account don't collide. Name must match
    // AGENTCORE_RUNTIME_ARN_PARAM in oauth-stack.ts.
    new ssm.StringParameter(this, "RuntimeArnParam", {
      parameterName: "/qdm-remote/agentcore-runtime-arn",
      stringValue: runtime.attrAgentRuntimeArn,
    });

    new CfnOutput(this, "ImageUri", { value: image.imageUri });
    new CfnOutput(this, "RuntimeRoleArn", { value: runtimeRole.roleArn });
    new CfnOutput(this, "AgentRuntimeArn", { value: runtime.attrAgentRuntimeArn });
  }
}
