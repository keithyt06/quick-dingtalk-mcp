# 外部群成员 openDingTalkId 支持

## 背景

基于代码中的注释提示（chat.go:100），对于外部群成员无法获取 userId 的场景，钉钉提供了 openDingTalkId 作为替代标识。

## 核心机制

- 获取外部群成员信息的正确路径是调用 `dws chat group members list` 接口
- 外部成员会返回 `openDingTalkId` 而非 `userId`，因为外部成员不在企业通讯录中，钉钉出于隐私保护不直接暴露其 userId

## 使用方式

发消息给外部成员时用 `--open-dingtalk-id` 参数代替 `--user` 即可。
