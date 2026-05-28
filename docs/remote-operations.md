# Remote 端运维手册

> 日常运维、`ops.sh` 子命令、升级、撤销、灾备与切换 alarm preset。

## 日常运维清单

| 频率 | 任务 | 命令 |
|---|---|---|
| 每天 | 看 Dashboard，确认无 ALARM 状态 | Console / `aws cloudwatch describe-alarms --state-value ALARM` |
| 每周 | 看 Insights 查询 1（错误 top 10）发现新问题 | 见 remote-observability.md |
| 每周 | 看 `ops.sh list-users` 计 active 用户数 | `bash packages/remote/scripts/ops.sh list-users \| wc -l` |
| 每月 | 检查 SM secret 是否有 `ScheduledDeletion` 状态 | `aws secretsmanager list-secrets --include-planned-deletion` |
| 每月 | 看 ECR 镜像数量，超 10 个就清理老 tag | `aws ecr describe-images --repository-name quick-dingtalk-mcp` |
| 每季度 | dws CLI 升级 | 见下文「升级 dws 版本」 |
| 每季度 | 旋转 HMAC 主密钥 | SSM `put-parameter` 升 version + Lambda env 升 |
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

注意：被 `ops.sh revoke` 过的、还在 7 天软删窗口的 secret 不会列出。要看含计划删除的：

```bash
aws secretsmanager list-secrets --include-planned-deletion --region us-east-1 \
  --filters Key=name,Values=quick-dingtalk-mcp/users/
```

### `revoke <userId>`

```bash
bash packages/remote/scripts/ops.sh revoke u_5f23a8b1c4
```

交互确认后 `delete-secret`，默认带 7 天恢复窗口。要立即清：

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

直接 invoke `token-refresh-shim` Lambda，把所有 ding refresh_token 跑一遍。等价于 EventBridge 每 30 分钟的定时刷新。

什么时候手动跑：

- 大量用户报 503 Retry-After
- 修改了 ding 应用 scope 后想立即让所有用户的 token 带上新 scope（实际上 ding refresh 不会扩 scope，只能让用户走 IncrementalAuthUrl，但跑一下 refresh 会把已死 token 打 dead 状态便于排查）

### `logs <lambda>`

```bash
bash packages/remote/scripts/ops.sh logs token-refresh-shim
bash packages/remote/scripts/ops.sh logs mcp-middleware
bash packages/remote/scripts/ops.sh logs alarm-webhook
```

底层 `aws logs tail`，`--follow` 实时尾随。容器日志要单独：

```bash
aws logs tail /aws/agentcore/runtime/quick-dingtalk-mcp --follow --region us-east-1
```

## 升级 dws 版本

dws CLI 锁在 Dockerfile 的 `ARG DWS_VERSION=1.0.32`。升级流程：

1. `npm view @alicloud/dws-cli versions --json | tail -20` 看新版。
2. 改 `packages/remote/docker/Dockerfile` 的 `DWS_VERSION` ARG。
3. 同步改 `packages/local/server.mjs` 顶部锁版本注释（保持 Local/Remote 一致）。
4. `bash packages/remote/scripts/deploy.sh` 重新 build & push image，AgentCore Runtime 自动 redeploy（image digest 变化）。
5. 部署后跑 `bash packages/remote/scripts/test-e2e.sh` 验 38 工具白名单。
6. 进 Dashboard 板块 5 看 30 分钟内 `Tool.DwsError` 是否飙升，飙了就回滚（`git revert` + 再 deploy）。

详见 `.claude/skills/bump-dws-version.md`（如已配）。

## token 撤销 vs 删除 user

| 操作 | 立即生效？ | secret 何时实清 | 用户重连可恢复？ |
|---|---|---|---|
| `ops.sh revoke <uid>` | 是（secret 删了 verify 401） | 7 天软删窗口后 | 是（重走 AuthorizeUrl 即可） |
| `aws secretsmanager delete-secret --force-delete-without-recovery` | 是 | 立即 | 是 |
| `aws secretsmanager restore-secret` | 撤销 revoke | — | — |
| 旋转 HMAC 主密钥 + 升 version | 老 token grace 24h 后失效 | secret 不动 | 是 |
| teardown.sh 整 stack 删 | 是 | 整片清 | 否（DDB 没了） |

## EventBridge 强制刷新

EventBridge rule `QdmRemoteOAuth-RefreshSchedule`，cron `rate(30 minutes)`，target `token-refresh-shim`。

临时停：

```bash
aws events disable-rule --name QdmRemoteOAuth-RefreshSchedule --region us-east-1
```

临时改频率（生产不建议）：

```bash
aws events put-rule --name QdmRemoteOAuth-RefreshSchedule \
  --schedule-expression "rate(15 minutes)" --region us-east-1
```

注意：钉钉侧 access_token 默认 7200s 有效，30min 刷新足够。低于 5min 反而触发 ding 的频率限制。

## 销毁与清理

```bash
bash packages/remote/scripts/teardown.sh
```

teardown.sh 实际是 `npx cdk destroy QdmRemoteWaf QdmRemoteRuntime QdmRemoteOAuth --force` 带几个保护检查。

**它不会清的**：

| 资源 | 原因 | 手动清理 |
|---|---|---|
| SM secrets（用户 token） | 默认 `RemovalPolicy.RETAIN` | `aws secretsmanager delete-secret --force-delete-without-recovery` 逐个 |
| ECR repository + images | 防误删 | `aws ecr delete-repository --repository-name quick-dingtalk-mcp --force` |
| CloudWatch Logs group | 不删保留分析 | `aws logs delete-log-group --log-group-name /aws/lambda/QdmRemoteOAuth-*` |
| KMS CMK（如果用了自定义） | 默认 PendingDeletion 30 天 | 控制台 schedule deletion |
| DDB tables 备份 (PITR) | 即使表删了 PITR 留 35 天 | 自然过期 |

**完全清场脚本**：

```bash
# DANGER: 不可逆
aws secretsmanager list-secrets --filters Key=name,Values=quick-dingtalk-mcp/ --region us-east-1 \
  --query 'SecretList[].Name' --output text | xargs -n1 \
  aws secretsmanager delete-secret --force-delete-without-recovery --region us-east-1 --secret-id
aws ecr delete-repository --repository-name quick-dingtalk-mcp --force --region us-east-1
aws logs describe-log-groups --log-group-name-prefix /aws/lambda/QdmRemote --region us-east-1 \
  --query 'logGroups[].logGroupName' --output text | xargs -n1 \
  aws logs delete-log-group --region us-east-1 --log-group-name
```

## 灾备 (DDB + SM snapshot)

DDB 表（OAuth state、user mapping、audit log）默认开 PITR（35 天）。SM 默认 RecoveryWindow 7 天。

**冷备份（每周）**：

```bash
# DDB → S3 export
aws dynamodb export-table-to-point-in-time \
  --table-arn arn:aws:dynamodb:us-east-1:<acct>:table/QdmRemoteOAuth-Users \
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

1. 在 dev account 跑 `bash packages/remote/scripts/deploy.sh --context env=disaster-recovery`
2. `aws dynamodb restore-table-from-backup` 把 DDB 拉回到事故前 5min
3. 用上面备份的 SM blob 逐个 `create-secret` 重写
4. 跑 `test-e2e.sh` 验最少 1 个测试用户能调通

## 切换 alarm preset

```bash
cd packages/remote/infra
npx cdk deploy QdmRemoteOAuth --context alarmPreset=strict
```

三档（见 [remote-observability.md](./remote-observability.md#10-alarms-详细表3-preset-阈值)）：

- `relaxed` — 开发期、刚上线、用户少；阈值高，不容易报错
- `standard`（默认） — 100 用户量级
- `strict` — > 500 用户、需要 PagerDuty 寻呼时

切 preset 不会重建 stack，只更新 10 个 alarm 的 `threshold` 字段。

## 升级到下一个 minor 版本（v0.2 → v0.3）

预先要做的（如果是 breaking 升级）：

1. 看 `CHANGELOG.md` 的 `## 0.3.0 — Breaking changes`
2. dev account 先跑 `--context env=staging` 验
3. 通知用户预期 5 分钟内会有 401，让他们留着浏览器准备 reauth
4. `git pull && bash packages/remote/scripts/deploy.sh`
5. 用 `ops.sh logs mcp-middleware` 跟看新部署
6. 看 Dashboard 5 个板块全部恢复绿
