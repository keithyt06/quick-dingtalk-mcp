# Remote 端 AWS 部署指南

> 面向**部署 Remote 栈到 AWS 的管理员**。覆盖前置条件、首次部署(含鸡生蛋问题)、更新部署(重跑 `deploy.sh` 即可,幂等)、部署后验证与卸载。日常运维(ops.sh、撤销用户、告警)见 [remote-operations.md](./remote-operations.md)。

## 架构与资源清单

一次部署创建(全部固定在 **us-east-1**,因 AgentCore + CloudFront-scope WAF):

| 资源 | 创建方式 | 归属 |
|---|---|---|
| CloudFront + API Gateway + 3 个 Lambda(mcp-middleware / token-refresh-shim / alarm-webhook)+ DynamoDB(OAuthStateTable)+ SNS + 10 个 Alarm + Dashboard | CDK | `QdmRemoteOAuth` 栈 |
| 容器镜像(ARM64,内含 dws)+ Runtime IAM 角色 | CDK(`DockerImageAsset`,镜像推到 CDK bootstrap 共享 ECR) | `QdmRemoteRuntime` 栈 |
| WAF WebACL(可选) | CDK | `QdmRemoteWaf` 栈 |
| **AgentCore Runtime 本体** | deploy.sh 内嵌 boto3(`bedrock-agentcore-control`,**无 CFN 资源类型**) | 不在任何栈里 |
| SSM 参数 ×2(HMAC 主密钥、钉钉 AppSecret,SecureString) | deploy.sh 后置步骤 | 栈外 |
| DDB 记录 `client#quick`(Quick 向导预注册客户端) | deploy.sh 幂等 upsert | 栈外 |
| 用户 token secrets(`quick-dingtalk-mcp/users/<uid>`) | Lambda 运行时按需创建 | 栈外 |

> 「不在栈里」的资源意味着 `cdk destroy` 不会删它们——卸载时见文末。

## 前置条件

- **AWS**:具备 `us-east-1` 管理员权限的凭证;账号已做过 CDK bootstrap(没做过则先 `npx cdk bootstrap aws://<account>/us-east-1`)。
- **本机**:Node ≥ 22.6、Docker(构建 ARM64 镜像,需 buildx)、AWS CLI、git、jq、python3 + boto3(≥1.39,需含 `bedrock-agentcore-control`;系统 boto3 过旧时建议独立 venv)。
- **钉钉应用**:在 [钉钉开放平台](https://open.dingtalk.com/) 建一个企业内部应用,拿到 **AppKey/AppSecret**,并开通网页应用的登录权限(scope `openid corpid`)。回调地址要填 CloudFront 域名——首次部署前还没有,见下面的两段式流程。

## 首次部署(两段式,解决鸡生蛋)

回调地址依赖 CloudFront 域名,域名又来自部署——所以先只部署网关拿域名,注册回调后再全量部署。

### 第 1 段:只部署网关,拿域名

```bash
curl -fsSL https://raw.githubusercontent.com/keithyt06/quick-dingtalk-mcp/main/packages/remote/scripts/install.sh | bash
cd ~/.quick-dingtalk-mcp
bash packages/remote/scripts/deploy.sh --only-oauth
```

`--only-oauth` 跳过交互提问,用占位符部署 `QdmRemoteOAuth`,结束时打印 CloudFront 域名和后续步骤清单。

### 第 2 段:注册回调、全量部署

1. 去钉钉开放平台,把 `https://<CloudFront域名>/callback` 加进应用的回调地址。
2. 全量部署,交互输入 AppKey 和 AppSecret(其余提问可一路回车:告警 webhook 留空、alarm preset 默认 standard、WAF 默认不开):

   ```bash
   bash packages/remote/scripts/deploy.sh
   ```

deploy.sh 全量模式依次做:部署 OAuthStack → 首次生成 HMAC 主密钥、写入 AppSecret 到 SSM(均幂等,重跑不覆盖,见下文「更新部署」)→ 幂等 upsert `client#quick`(回调白名单默认 us-east-1 QuickSight,可用 `QUICK_REDIRECT_URIS=<逗号分隔>` 覆盖)→ 部署 RuntimeStack(本地构建 ARM64 镜像并推 ECR)→ boto3 创建/更新 AgentCore Runtime(`PORT=8080`、`INJECT_STRATEGY=d2`、自定义请求头白名单)→ 把 Runtime 的 invoke URL 回填进 mcp-middleware 的 `AGENTCORE_RUNTIME_URL` 环境变量 → 打印授权 URL 和 MCP 端点。

结束后把打印的 **授权 URL**(`https://<域名>/authorize`)和 **MCP 端点**(`https://<域名>/mcp`)发给团队成员,成员自助接入见 [remote-新人首配-oauth.md](./remote-新人首配-oauth.md)。

## 更新部署(day-2,改了代码之后)

**重跑 `deploy.sh` 即可——它是幂等的**:

```bash
git -C ~/.quick-dingtalk-mcp pull
bash packages/remote/scripts/deploy.sh
```

- **HMAC 主密钥保留不动**(只在首次部署时生成一次),已发放的用户 token 全部继续有效。怀疑密钥泄露需要主动轮换时才加 `--rotate-hmac`(⚠️ 全员登出)。
- **AppSecret 留空直接回车 = 沿用 SSM 里已存的值**;AppKey 提示符会带出现网在用的值作默认。所有提问都可用环境变量预填(`DINGTALK_APP_ID` / `DINGTALK_APP_SECRET` / `ALARM_WEBHOOK` / `PRESET` / `ENABLE_WAF`),做到完全无交互:

  ```bash
  DINGTALK_APP_ID=<AppKey> ALARM_WEBHOOK= PRESET=standard ENABLE_WAF=N \
    bash packages/remote/scripts/deploy.sh
  ```

- `client#quick` 预注册是幂等 upsert;镜像重建、AgentCore Runtime 更新(`PORT=8080`、请求头白名单)、mcp-middleware 的 invoke URL 回填,deploy.sh 全部自动处理。

只改了 Lambda 想跳过镜像构建提速?可以单独 `cd packages/remote && npm run build:lambda && cd infra && AWS_REGION=us-east-1 npx cdk deploy QdmRemoteOAuth -c dingtalkAppId=<AppKey> -c alarmPreset=standard -c alarmWebhookUrl="" --require-approval never`——CFN 就地更新,不碰 SSM 与用户。但拿不准就重跑 deploy.sh,不会更糟。

### 部署前自检

```bash
npm run test:all        # 123 个测试(需 Node ≥ 22.6)
npm run remote:synth    # CDK 模板能合成
```

## 部署后验证(冒烟)

```bash
B=https://<CloudFront域名>
curl -s -o /dev/null -w "%{http_code}\n" $B/.well-known/oauth-authorization-server   # 200
curl -s -o /dev/null -w "%{http_code} -> %{redirect_url}\n" \
  "$B/authorize?client_id=quick&redirect_uri=https%3A%2F%2Fus-east-1.quicksight.aws.amazon.com%2Fsn%2Foauthcallback&response_type=code&code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM&code_challenge_method=S256&scope=openid"
#   → 302 跳 login.dingtalk.com(说明网关、client#quick 预注册、钉钉应用配置都对)
curl -s -D - -o /dev/null -X POST $B/mcp -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize"}' | grep -iE "^HTTP|www-authenticate"
#   → 401 + WWW-Authenticate: Bearer resource_metadata=...(Quick 自动授权发现依赖这个头)
```

容器侧:`aws logs tail /aws/bedrock-agentcore/runtimes/<runtime-id>-DEFAULT --region us-east-1 --since 10m` 应看到 `listening on :8080`。最后用一个真实账号走完 [新人首配](./remote-新人首配-oauth.md) 调一次 `get_self`,端到端确认。

## 卸载

```bash
bash packages/remote/scripts/teardown.sh
```

按 Runtime → OAuth → WAF 的顺序 destroy 三个栈。**栈外资源需手动清理**:AgentCore Runtime 本体(`aws bedrock-agentcore-control delete-agent-runtime`)、用户 token secrets(默认 30 天恢复期,`delete-secret --force-delete-without-recovery` 立即删)、SSM 两个参数、CDK bootstrap ECR 里的镜像(**不要删整个 repo**,它被账号内其他 CDK 应用共享)。OAuthStateTable 是 `RETAIN`,destroy 后表保留,确认不要后手动删。
