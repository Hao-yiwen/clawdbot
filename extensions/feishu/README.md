# Clawdbot Feishu 插件

Feishu (飞书/Lark) 频道插件，使用 WebSocket 长连接模式接收消息。

## 功能特点

- **WebSocket 长连接**: 使用飞书官方 Node.js SDK 的 WSClient，无需公网 IP 或 ngrok
- **私聊和群聊**: 支持与机器人私聊以及在群组中 @机器人
- **消息分块**: 自动将长消息分割成多条发送
- **多账户支持**: 支持配置多个飞书应用

## 功能实现状态

### Channel Capabilities

| 能力 | 状态 | 说明 |
|------|------|------|
| `chatTypes: direct` | ✅ 已实现 | 私聊消息 |
| `chatTypes: group` | ✅ 已实现 | 群聊消息 |
| `chatTypes: thread` | ❌ 未实现 | 消息话题/线程 |
| `reactions` | ❌ 未实现 | 消息表情回复 |
| `threads` | ❌ 未实现 | 话题/线程支持 |
| `media` | ❌ 未实现 | 图片/文件/视频消息 |
| `nativeCommands` | ❌ 未实现 | 原生斜杠命令 |
| `blockStreaming` | ✅ 已实现 | 阻塞式流式响应 |
| `polls` | ❌ 未实现 | 投票功能 |
| `edit` | ❌ 未实现 | 编辑已发送消息 |
| `unsend` | ❌ 未实现 | 撤回消息 |
| `reply` | ❌ 未实现 | 引用回复 |
| `effects` | ❌ 未实现 | 消息特效 |
| `groupManagement` | ❌ 未实现 | 群组管理 |

### Plugin Adapters

| 适配器 | 状态 | 说明 |
|--------|------|------|
| `config` | ✅ 已实现 | 账户配置管理 |
| `setup` | ✅ 已实现 | 账户设置向导 |
| `pairing` | ✅ 已实现 | 用户配对验证 |
| `security` | ✅ 已实现 | DM 策略和权限控制 |
| `groups` | ✅ 已实现 | 群组 @提及检测 |
| `messaging` | ✅ 已实现 | 消息目标解析 |
| `outbound` | ✅ 已实现 | 消息发送和分块 |
| `status` | ✅ 已实现 | 连接状态探测 |
| `gateway` | ✅ 已实现 | WebSocket 长连接 |
| `directory` | ⚠️ 部分实现 | 用户/群组目录（返回空） |
| `auth` | ❌ 未实现 | 登录/登出流程 |
| `elevated` | ❌ 未实现 | 提升权限操作 |
| `commands` | ❌ 未实现 | 原生命令处理 |
| `streaming` | ❌ 未实现 | 流式响应 |
| `threading` | ❌ 未实现 | 话题/线程管理 |
| `mentions` | ❌ 未实现 | @提及文本清理 |
| `agentPrompt` | ❌ 未实现 | Agent 提示词定制 |
| `resolver` | ❌ 未实现 | 用户/群组解析 |
| `actions` | ❌ 未实现 | 消息动作按钮 |
| `heartbeat` | ❌ 未实现 | 心跳检测 |
| `agentTools` | ❌ 未实现 | Agent 专用工具 |

### 消息类型支持

| 消息类型 | 接收 | 发送 | 说明 |
|----------|------|------|------|
| 文本消息 | ✅ | ✅ | 纯文本消息 |
| 富文本消息 (post) | ✅ | ❌ | 可接收，发送时转为纯文本 |
| 图片消息 | ❌ | ❌ | 需要实现 media 能力 |
| 文件消息 | ❌ | ❌ | 需要实现 media 能力 |
| 音频消息 | ❌ | ❌ | 需要实现 media 能力 |
| 视频消息 | ❌ | ❌ | 需要实现 media 能力 |
| 卡片消息 | ❌ | ❌ | 飞书交互式卡片 |
| 表情消息 | ❌ | ❌ | 表情贴纸 |

### 待实现功能优先级

**高优先级：**
1. 消息引用回复 (`reply`) - 支持回复特定消息
2. 图片消息 (`media`) - 发送和接收图片
3. 话题/线程 (`threads`) - 消息话题支持

**中优先级：**
4. 表情回复 (`reactions`) - 对消息添加表情
5. 卡片消息 - 飞书交互式卡片
6. 文件消息 - 发送和接收文件

**低优先级：**
7. 编辑消息 (`edit`)
8. 撤回消息 (`unsend`)
9. 原生命令 (`nativeCommands`)

## 前置要求

1. 在[飞书开放平台](https://open.feishu.cn/)创建企业自建应用
2. 获取 App ID 和 App Secret
3. 启用机器人能力
4. 配置所需权限

## 飞书应用配置

### 1. 创建应用

1. 登录[飞书开放平台](https://open.feishu.cn/)
2. 点击「创建企业自建应用」
3. 填写应用名称和描述

### 2. 添加机器人能力

1. 进入应用详情页
2. 点击「添加应用能力」
3. 选择「机器人」

### 3. 配置权限

在「权限管理」中申请以下权限：

**消息相关：**
- `im:message` - 获取与发送单聊、群组消息
- `im:message:send_as_bot` - 以应用身份发送消息
- `im:chat:readonly` - 获取群组信息

**用户相关（可选）：**
- `contact:user.base:readonly` - 获取用户基本信息

### 4. 发布应用

1. 在「版本管理与发布」中创建版本
2. 提交审核并发布
3. 管理员审批通过后即可使用

## 安装配置

### 方式 1: 交互式向导（推荐）

运行 setup 命令，选择 Feishu：

```bash
clawdbot setup
```

向导会引导你：
1. 输入 App ID
2. 输入 App Secret
3. 配置 DM 策略
4. 设置 allowFrom（如需要）

### 方式 2: 配置文件

在 `~/.clawdbot/clawdbot.json` 中添加飞书配置：

```json
{
  "channels": {
    "feishu": {
      "appId": "cli_xxxxxx",
      "appSecret": "your-app-secret",
      "dm": {
        "enabled": true,
        "policy": "open"
      },
      "groupPolicy": "open",
      "requireMention": true
    }
  }
}
```

### 环境变量（可选）

也可以通过环境变量配置（仅支持 default 账户）：

```bash
export FEISHU_APP_ID="cli_xxxxxx"
export FEISHU_APP_SECRET="your-app-secret"
```

## 配置选项

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `appId` | string | - | 飞书应用 App ID |
| `appSecret` | string | - | 飞书应用 App Secret |
| `enabled` | boolean | true | 是否启用 |
| `requireMention` | boolean | true | 群聊中是否需要 @机器人 |
| `groupPolicy` | string | "allowlist" | 群聊策略: "open", "allowlist", "disabled" |
| `dm.enabled` | boolean | true | 是否启用私聊 |
| `dm.policy` | string | "pairing" | 私聊策略: "open", "pairing", "disabled" |
| `dm.allowFrom` | array | [] | 允许的用户 ID 列表 |
| `historyLimit` | number | 5 | 历史消息数量限制 |
| `textChunkLimit` | number | 4000 | 单条消息字符限制 |

### 群聊策略说明

- `open`: 群组中任何成员都可以触发机器人
- `allowlist`: 仅允许配置的群组和用户
- `disabled`: 禁用群聊功能

### 私聊策略说明

- `open`: 任何人都可以私聊机器人
- `pairing`: 需要配对验证
- `disabled`: 禁用私聊功能

## 多账户配置

支持配置多个飞书应用：

```json
{
  "channels": {
    "feishu": {
      "appId": "cli_default",
      "appSecret": "default-secret",
      "accounts": {
        "work": {
          "appId": "cli_work",
          "appSecret": "work-secret",
          "name": "工作机器人"
        },
        "support": {
          "appId": "cli_support",
          "appSecret": "support-secret",
          "name": "客服机器人"
        }
      }
    }
  }
}
```

## 运行

启动 gateway 后，WebSocket 客户端会自动连接到飞书服务器：

```bash
clawdbot gateway run
```

## 工作原理

```
┌─────────────┐     WebSocket      ┌─────────────────┐
│   飞书服务器  │ ◄──────────────────► │  Clawdbot 网关   │
└─────────────┘    长连接(出站)       └─────────────────┘
       │                                    │
       │  用户发送消息                        │  处理消息
       ▼                                    ▼
┌─────────────┐                      ┌─────────────────┐
│   飞书客户端  │                      │   AI Agent     │
└─────────────┘                      └─────────────────┘
```

1. Gateway 启动时创建 WebSocket 客户端
2. 使用 App ID/Secret 获取 token 并建立长连接
3. 飞书服务器通过 WebSocket 推送消息事件
4. 消息经过 Monitor Provider 处理后分发给 Agent
5. Agent 响应通过 HTTP API 发送回飞书

## 故障排除

### 连接失败

1. 检查 App ID 和 App Secret 是否正确
2. 确认应用已发布且有机器人能力
3. 检查网络是否能访问 `open.feishu.cn`

### 消息不回复

1. 检查 `dm.enabled` 和 `groupPolicy` 配置
2. 群聊中确认 `requireMention` 设置
3. 查看 gateway 日志确认消息是否收到

### 权限问题

1. 确认已申请必要的 API 权限
2. 检查应用是否已发布并通过审批
3. 确认用户/群组在应用可见范围内

## 开发

```bash
# 安装依赖
pnpm install

# 构建
pnpm build

# 测试
pnpm test
```

## 依赖

- `@larksuiteoapi/node-sdk` - 飞书官方 Node.js SDK

## License

MIT
