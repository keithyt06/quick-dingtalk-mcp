import { Stack, StackProps, CfnOutput } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as wafv2 from "aws-cdk-lib/aws-wafv2";

export class WafStack extends Stack {
  public readonly webAclArn: string;

  constructor(scope: Construct, id: string, props: StackProps) {
    super(scope, id, props);

    if (this.region !== "us-east-1") {
      throw new Error("WafStack must deploy in us-east-1 (CloudFront-scope WebACL).");
    }

    const acl = new wafv2.CfnWebACL(this, "Acl", {
      name: "qdm-remote-cf-acl",
      scope: "CLOUDFRONT",
      defaultAction: { allow: {} },
      visibilityConfig: { cloudWatchMetricsEnabled: true, metricName: "qdm-remote-cf-acl", sampledRequestsEnabled: true },
      rules: [
        {
          name: "rate-limit-per-ip",
          priority: 0,
          action: { block: {} },
          statement: {
            rateBasedStatement: {
              limit: 1000,
              aggregateKeyType: "IP",
            },
          },
          visibilityConfig: { cloudWatchMetricsEnabled: true, metricName: "rate-limit", sampledRequestsEnabled: true },
        },
        {
          name: "AWSManagedRulesCommonRuleSet",
          priority: 10,
          overrideAction: { none: {} },
          statement: {
            managedRuleGroupStatement: { vendorName: "AWS", name: "AWSManagedRulesCommonRuleSet" },
          },
          visibilityConfig: { cloudWatchMetricsEnabled: true, metricName: "managed-common", sampledRequestsEnabled: true },
        },
      ],
    });

    this.webAclArn = acl.attrArn;
    new CfnOutput(this, "WebAclArn", { value: this.webAclArn });
    new CfnOutput(this, "AssociationHint", {
      value: "Manually associate this WebACL with the CloudFront Distribution from OAuthStack — CDK cross-stack association across regions requires custom resources (Plan 3).",
    });
  }
}
