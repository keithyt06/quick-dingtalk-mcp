import { Stack, StackProps, CfnOutput } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as ecr_assets from "aws-cdk-lib/aws-ecr-assets";
import * as iam from "aws-cdk-lib/aws-iam";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface RuntimeStackProps extends StackProps {
  oauthBaseUrl: string;
  userTokenSecretArnPrefix: string;
}

// RuntimeStack: ECR image + IAM role for AgentCore Runtime.
//
// IMPORTANT: AWS::BedrockAgentCore::AgentRuntime CloudFormation resource type
// does NOT exist (as of 2026-05). The AgentCore Runtime itself must be created
// via boto3 / aws-cli `bedrock-agentcore-control:create-agent-runtime` post-CDK.
// See packages/remote/scripts/deploy.sh — it reads CFN outputs ImageUri +
// RuntimeRoleArn from this stack, then calls boto3 to create the runtime.
//
// Reference pattern: ddpie/lark-mcp-on-agentcore uses the same split.
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
      resources: [`arn:aws:logs:${this.region}:${this.account}:log-group:/aws/bedrock-agentcore/qdm-remote*`],
    }));
    image.repository.grantPull(runtimeRole);
    this.runtimeRoleArn = runtimeRole.roleArn;

    // --- Outputs consumed by deploy.sh ---
    // deploy.sh reads these and calls boto3 bedrock-agentcore-control.create_agent_runtime
    // to actually wire up the runtime. See packages/remote/scripts/deploy.sh
    // "create_agent_runtime" section.
    new CfnOutput(this, "ImageUri", { value: image.imageUri });
    new CfnOutput(this, "RuntimeRoleArn", { value: runtimeRole.roleArn });
    new CfnOutput(this, "OAuthBaseUrlEcho", {
      value: props.oauthBaseUrl,
      description: "Echoed for deploy.sh to pass into AgentCore Runtime EnvironmentVariables.OAUTH_BASE_URL",
    });
  }
}
