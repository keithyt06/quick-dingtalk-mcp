# Remote 端 FAQ

> 状态：骨架（Plan 2 T22 填实）

## Q：Local 和 Remote 能同时用吗？
A：能。Local stdio + Remote HTTPS 是两条独立链路，共用同一份 shared catalog。

## Q：要钉钉企业账号才能用吗？
A：[TODO T22]

## Q：用户 token 存在哪？泄露怎么办？
A：[TODO T22]

## Q：Region 为什么锁 us-east-1？
A：AgentCore Runtime 当前仅在 us-east-1 GA，且 CloudFront WAF 必须 us-east-1。Plan 3 视 AgentCore 推广再开多 region。

## Q：可以自部署吗？
A：[TODO T22]

[TODO: T22 — 至少 15 个常见 Q]
