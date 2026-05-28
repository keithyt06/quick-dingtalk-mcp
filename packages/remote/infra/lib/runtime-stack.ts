import { Stack, StackProps, CfnOutput, CfnResource } from "aws-cdk-lib";
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

export class RuntimeStack extends Stack {
  public readonly imageUri: string;
  public readonly runtimeRoleArn: string;

  constructor(scope: Construct, id: string, props: RuntimeStackProps) {
    super(scope, id, props);

    // --- Docker image asset ---
    // Build context: packages/ (so Dockerfile can COPY remote/docker + shared)
    const image = new ecr_assets.DockerImageAsset(this, "Image", {
      directory: join(__dirname, "..", "..", ".."),
      file: "remote/docker/Dockerfile",
      platform: ecr_assets.Platform.LINUX_AMD64,
      buildArgs: {
        DWS_VERSION: "1.0.32",
      },
    });
    this.imageUri = image.imageUri;

    // --- IAM role for AgentCore Runtime ---
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

    // --- AgentCore Runtime ---
    // L1 CFN resource (no CDK L2 yet for AgentCore as of writing).
    // CFN resource type name is inferred from public docs; Plan 3 verifies
    // and updates if the GA name differs.
    const runtime = new CfnResource(this, "Runtime", {
      type: "AWS::BedrockAgentCore::AgentRuntime",
      properties: {
        Name: "qdm-remote",
        RoleArn: runtimeRole.roleArn,
        ContainerImageUri: image.imageUri,
        EnvironmentVariables: {
          OAUTH_BASE_URL: props.oauthBaseUrl,
          INJECT_STRATEGY: "d2",
          MAX_CONCURRENT: "10",
          PORT: "8000",
        },
        NetworkMode: "PUBLIC",
        Port: 8000,
      },
    });

    new CfnOutput(this, "ImageUri", { value: image.imageUri });
    new CfnOutput(this, "RuntimeRoleArn", { value: runtimeRole.roleArn });
    new CfnOutput(this, "RuntimeId", { value: runtime.ref });
  }
}
