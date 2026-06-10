# Remote 端运维手册

> 面向**部署并维护 Remote 栈的管理员**。日常运维、`ops.sh` 子命令、升级、撤销、灾备与切换 alarm preset。

## 日常运维清单

| 频率 | 任务 | 命令 |
|---|---|---|
| 每天 | 看 Dashboard（`qdm-remote`），确认无 ALARM 状态 | Console / `aws cloudwatch describe-alarms --state-value ALARM` |
| 每周 | 跑 Insights 错误查询发现新问题 | 见 remote-observability.md |
| 每周 | 看 `ops.sh list-users` 计 active 用户数 | `bash packages/remote/scripts/ops.sh list-users \| wc -l` |
| 每月 | 检查 SM secret 是否有 `ScheduledDeletion` 状态 | `aws secretsmanager list-secrets --include-planned-deletion` |
| 每季度 | dws CLI 升级 | 见下文「升级 dws 版本」 |
| 按需 | 旋转 HMAC 主密钥（怀疑泄露时） | 见下文「token 撤销 vs 删除 user」表注 |
| 半年 | 灾备演练（恢复 DDB + SM 到测试 region） | 见下文「灾备」 |

## ops.sh 子命令完整 reference

### `status`

```bash
bash packages/remote/scripts/ops.sh status
```

输出三个 stack 状态表：

```
StackName               StackStatus
QdmRemoteOAuth          UPDATE_COMPLETE
QdmRemoteRuntime        UPDATE_COMPLETE
QdmRemoteWaf            CREATE_COMPLETE
```

底层：`aws cloudformation describe-stacks --query 'Stacks[?starts_with(StackName,QdmRemote)]'`。

### `list-users`

```bash
bash packages/remote/scripts/ops.sh list-users
```

列出所有已注册的 userId（即 SM secret name 去掉前缀）：

```
u_5f23a8b1c4
u_8b7c1d2e3f
u_a1b2c3d4e5
```

底层：`aws secretsmanager list-secrets --filters Key=name,Values=quick-dingtalk-mcp/users/`。

注意：被 `ops.sh revoke` 过的、还在软删窗口（默认 30 天）的 secret 不会列出。要看含计划删除的：

```bash
aws secretsmanager list-secrets --include-planned-deletion --region us-east-1 \
  --filters Key=name,Values=quick-dingtalk-mcp/users/
```

### `revoke <userId>`

```bash
bash packages/remote/scripts/ops.sh revoke u_5f23a8b1c4
```

交互确认后 `delete-secret`，默认带 30 天恢复窗口（AWS 默认值；ops.sh 未传 `--recovery-window-in-days`，可传 7-30 缩短）。要立即清：

```bash
aws secretsmanager delete-secret \
  --secret-id quick-dingtalk-mcp/users/u_5f23a8b1c4 \
  --force-delete-without-recovery --region us-east-1
```

revoke 之后该用户的 mcpToken 在下次 verify 时找不到 secret，自动 401。`/authorize` 重新跑可以让用户回来；secret name 一致会被新 PUT 覆盖（如果还在软删窗口要先 `restore-secret`）。

### `refresh`

```bash
bash packages/remote/scripts/ops.sh refresh
```

直接 invoke `token-refresh-shim` Lambda，遍历所有用户、给临过期（剩余 < 60 分钟）的钉钉 access_token 续期。等价于 EventBridge 每 30 分钟的定时刷新。

什么时候手动跑：

- 大量用户报 503 Retry-After
- 排查授权问题时：跑一遍能把已失效（钉钉 4xx 拒绝）的用户标成 `needs_reauth`，便于定位是谁需要重新授权

### `logs <lambda>`

```bash
bash packages/remote/scripts/ops.sh logs token-refresh-shim
bash packages/remote/scripts/ops.sh logs mcp-middleware
bash packages/remote/scripts/ops.sh logs alarm-webhook
```

底层 `aws logs tail`，`--follow` 实时尾随。容器日志要单独（runtime-id 形如 `qdm_remote-XXXXXXXXXX`，可在 AgentCore 控制台或 `deploy.sh` 输出里找到）：

```bash
aws logs tail /aws/bedrock-agentcore/runtimes/<runtime-id>-DEFAULT --follow --region us-east-1
```

## 升级 dws 版本

dws CLI 锁在 Dockerfile 的 `ARG DWS_VERSION=1.0.32`，从 GitHub releases（`DingTalk-Real-AI/dingtalk-workspace-cli`）下载二进制。升级流程：

1. 看 [dws GitHub releases](https://github.com/DingTalk-Real-AI/dingtalk-workspace-cli/releases) 有无新版。
2. 改 `packages/remote/docker/Dockerfile` 的 `DWS_VERSION` ARG。
3. 本机升级 dws 后 `npm run build:catalog` 重新生成 catalog（CI 的 `check:dws` 会校验 catalog 版本与 dws 一致），提交 diff。
4. `bash packages/remote/scripts/deploy.sh` 重新 build & push image，AgentCore Runtime 自动 redeploy（image digest 变化）。
5. 部署后跑 `bash packages/remote/scripts/test-e2e.sh`（单测 + synth 干跑）并手工验一次真实调用。
6. 看 Dashboard `qdm-remote` 的「dws non-zero exits」30 分钟内是否飙升，飙了就回滚（`git revert` + 再 deploy）。

## token 撤销 vs 删除 user

| 操作 | 立即生效？ | secret 何时实清 | 用户重连可恢复？ |
|---|---|---|---|
| `ops.sh revoke <uid>` | 是（secret 删了 verify 401） | 软删窗口（默认 30 天）后 | 是（重走 AuthorizeUrl 即可） |
| `aws secretsmanager delete-secret --force-delete-without-recovery` | 是 | 立即 | 是 |
| `aws secretsmanager restore-secret` | 撤销 revoke | — | — |
| 旋转 HMAC 主密钥（覆写 SSM 参数） | 是（Lambda 拿到新 key 后，全部老 token 立即验签失败，**无 grace 期**） | secret 不动 | 是（全员重新授权） |
| teardown.sh 整 stack 删 | 是 | secret 默认保留（见「销毁与清理」） | 否（DDB 表删了，OAuth 客户端注册/refresh token 全失） |

> HMAC 主密钥在 SSM `/qdm-remote/QdmRemoteOAuth/hmac-key`（SecureString）。旋转 = `bash packages/remote/scripts/deploy.sh --rotate-hmac`（或手动 `aws ssm put-parameter --overwrite` 写入 `openssl rand -hex 32` 新值）。普通重跑 deploy.sh **不会**轮换密钥（幂等保留）。注意 Lambda 进程内缓存了 key，覆写后老实例直到回收前仍用旧 key——要立即生效需同时让 Lambda 冷启（如 `aws lambda update-function-configuration` 触发新版本）。旋转是全员登出操作，仅在怀疑主密钥泄露时使用。

## EventBridge 强制刷新

EventBridge rule（CDK 生成名，形如 `QdmRemoteOAuth-RefreshSchedule*`），`rate(30 minutes)`，target `token-refresh-shim`。先查实际规则名：

```bash
aws events list-rules --name-prefix QdmRemoteOAuth --region us-east-1 \
  --query 'Rules[].Name' --output text
```

临时停 / 临时改频率（生产不建议改频率）：

```bash
aws events disable-rule --name <上面查到的规则名> --region us-east-1
aws events put-rule --name <规则名> --schedule-expression "rate(15 minutes)" --region us-east-1
```

注意：钉钉侧 access_token 默认 7200s 有效，刷新 Lambda 在剩余 < 60 分钟时续期，30min 巡检足够。低于 5min 反而触发 ding 的频率限制。

## 销毁与清理

```bash
bash packages/remote/scripts/teardown.sh
```

teardown.sh 实际是依次 `npx cdk destroy QdmRemoteWaf / QdmRemoteRuntime / QdmRemoteOAuth --force`，带确认提示。

**它不会清的**：

| 资源 | 原因 | 手动清理 |
|---|---|---|
| **AgentCore Runtime（`qdm_remote`）** | 由 deploy.sh 经 boto3 创建，不在任何 CFN 栈里 | `aws bedrock-agentcore-control delete-agent-runtime --agent-runtime-id <id> --region us-east-1` |
| SM secrets（用户 token） | 由 Lambda 运行时创建，非 CFN 管理 | `aws secretsmanager delete-secret --force-delete-without-recovery` 逐个 |
| DDB 表 `OAuthStateTable` | `RemovalPolicy.RETAIN`（存有 OAuth 客户端注册 + refresh token） | 确认不再需要后控制台删除 |
| 容器镜像 | 存在 CDK bootstrap 的共享 ECR（`cdk-hnb659fds-container-assets-*`），**勿删整个 repo**（可能有其他项目镜像） | 按 image tag 逐个清理或交给 bootstrap lifecycle |
| CloudWatch Logs group | 不删保留分析 | `aws logs delete-log-group --log-group-name /aws/lambda/QdmRemoteOAuth-*` |

**完全清场脚本**：

```bash
# DANGER: 不可逆
aws secretsmanager list-secrets --filters Key=name,Values=quick-dingtalk-mcp/ --region us-east-1 \
  --query 'SecretList[].Name' --output text | xargs -n1 \
  aws secretsmanager delete-secret --force-delete-without-recovery --region us-east-1 --secret-id
aws logs describe-log-groups --log-group-name-prefix /aws/lambda/QdmRemote --region us-east-1 \
  --query 'logGroups[].logGroupName' --output text | xargs -n1 \
  aws logs delete-log-group --region us-east-1 --log-group-name
```

## 灾备 (DDB + SM snapshot)

DDB 只有一张表 `OAuthStateTable`（单表多前缀：`client#` 预注册客户端、`sess#`/`code#` 临时会话、`refresh#` refresh token、裸 state），已开 PITR（35 天）+ `RemovalPolicy.RETAIN`。SM 删除默认 RecoveryWindow 30 天。

**冷备份（每周）**：

```bash
# DDB → S3 export（表名先查：aws dynamodb list-tables | grep OAuthStateTable）
aws dynamodb export-table-to-point-in-time \
  --table-arn arn:aws:dynamodb:us-east-1:<acct>:table/<OAuthStateTable 实际表名> \
  --s3-bucket qdm-remote-backups --region us-east-1

# SM 全量导出（脚本，仅元数据 + 加密 blob）
for s in $(bash packages/remote/scripts/ops.sh list-users); do
  aws secretsmanager get-secret-value \
    --secret-id quick-dingtalk-mcp/users/$s --region us-east-1 \
    --query SecretString --output text > /tmp/sm-backup/$s.json
done
# 注：导出的明文必须立刻 GPG 加密 + 存离线介质，绝不入 git
```

**恢复演练**（建议半年一次）：

1. 在 dev account 跑一次 `bash packages/remote/scripts/deploy.sh` 全新部署
2. `aws dynamodb restore-table-to-point-in-time` 把 DDB 拉回到事故前时刻
3. 用上面备份的 SM blob 逐个 `create-secret` 重写
4. 跑 `test-e2e.sh` + 1 个测试用户真实调用验证

## 切换 alarm preset

```bash
cd packages/remote/infra
npx cdk deploy QdmRemoteOAuth --context alarmPreset=strict
```

三档（见 [remote-observability.md](./remote-observability.md#10-个-alarm三档-preset)）：

- `relaxed` — 开发期、刚上线、用户少；阈值高，不容易误报
- `standard`（默认） — 正常生产
- `strict` — 大用户量、对告警延迟敏感时

切 preset 不会重建 stack，只更新 10 个 alarm 的阈值与评估窗口。

## 升级到新版本

1. `git pull` 拿最新代码，看 release notes / commit log 是否有 breaking change
2. 有条件的话先在 dev account 整套 deploy + `test-e2e.sh` 验证
3. 若涉及 token/HMAC 变更，通知用户预期短暂 401，让他们留着浏览器准备 reauth
4. `bash packages/remote/scripts/deploy.sh`
5. 用 `ops.sh logs mcp-middleware` 跟看新部署
6. 看 Dashboard `qdm-remote` 各板块恢复正常
