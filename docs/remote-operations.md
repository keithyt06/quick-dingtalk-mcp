# Remote 端运维手册

> 状态：骨架（Plan 2 T22 填实）

## 常规操作

| 场景 | 命令 |
|---|---|
| 查 stack 状态 | `bash packages/remote/scripts/ops.sh status` |
| 列已注册用户 | `bash packages/remote/scripts/ops.sh list-users` |
| 撤销某用户 | `bash packages/remote/scripts/ops.sh revoke <userId>` |
| 强制刷新 token | `bash packages/remote/scripts/ops.sh refresh` |
| 尾随 Lambda 日志 | `bash packages/remote/scripts/ops.sh logs <lambda>` |

## 升级 dws 版本

见 `.claude/skills/bump-dws-version.md`。

## 销毁

```
bash packages/remote/scripts/teardown.sh
```

注意 SM secret 默认 7 天软删除，ECR 镜像不会自动清。

[TODO: T22 — 详细 runbook + screenshot]
