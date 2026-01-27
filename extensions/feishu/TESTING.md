# 飞书扩展测试指南

## 前置准备

### 1. 创建飞书应用

1. 登录 [飞书开放平台](https://open.feishu.cn/app)
2. 点击「创建企业自建应用」
3. 填写应用名称和描述
4. 获取凭证：
   - **App ID**: `cli_xxxxxxxxxx`
   - **App Secret**: `xxxxxxxxxxxxxxxx`

### 2. 配置应用能力

在应用详情页：

1. **添加机器人能力**
   - 应用能力 → 添加应用能力 → 机器人

2. **配置权限**（权限管理 → 申请权限）
   ```
   # 必需权限
   im:message                    # 获取与发送单聊、群组消息
   im:message:send_as_bot        # 以应用身份发送消息
   im:chat                       # 获取群组信息
   im:chat:readonly              # 获取用户或机器人所在的群列表
   contact:user.base:readonly    # 获取用户基本信息

   # 可选权限（完整功能）
   im:message:readonly           # 读取消息
   im:resource                   # 获取消息中的资源文件
   im:chat.member:readonly       # 获取群成员
   ```

3. **配置事件订阅**
   - 事件订阅 → 添加事件
   - 订阅 `im.message.receive_v1`（接收消息）
   - 请求地址：`https://your-domain.com/feishu/webhook`

4. **（可选）配置加密**
   - 事件订阅 → 加密策略
   - 获取 **Encrypt Key** 和 **Verification Token**

5. **发布应用**
   - 版本管理与发布 → 创建版本 → 申请发布

### 3. 本地配置

创建或编辑 `~/.clawdbot/config.yaml`：

```yaml
channels:
  feishu:
    enabled: true
    appId: "cli_xxxxxxxxxx"          # 替换为你的 App ID
    appSecret: "xxxxxxxxxxxxxxxx"     # 替换为你的 App Secret

    # 可选：事件加密
    # encryptKey: "xxxxxxxx"
    # verificationToken: "xxxxxxxx"

    # Webhook 路径（默认 /feishu/webhook）
    webhookPath: "/feishu/webhook"

    # DM 策略
    dm:
      enabled: true
      policy: open                    # open | pairing | disabled
      # allowFrom:
      #   - "ou_xxxx"                 # 允许的用户 open_id

    # 群组策略
    groupPolicy: open                 # open | allowlist | disabled
    requireMention: true              # 群聊是否需要 @机器人

    # 群组配置（allowlist 模式）
    # groups:
    #   "oc_xxxxx":                   # 群组 chat_id
    #     requireMention: false
    #     users: ["ou_user1"]
```

或使用环境变量：

```bash
export FEISHU_APP_ID="cli_xxxxxxxxxx"
export FEISHU_APP_SECRET="xxxxxxxxxxxxxxxx"
# export FEISHU_ENCRYPT_KEY="xxxxxxxx"
# export FEISHU_VERIFICATION_TOKEN="xxxxxxxx"
```

---

## 测试方法

### 方法一：本地开发测试（使用 ngrok）

1. **启动 ngrok 隧道**
   ```bash
   ngrok http 18789
   ```
   获取公网 URL，如：`https://abc123.ngrok.io`

2. **配置飞书事件订阅**
   - 将请求地址设置为：`https://abc123.ngrok.io/feishu/webhook`

3. **启动 gateway**
   ```bash
   pnpm clawdbot gateway run --port 18789
   ```

4. **验证 URL**
   - 在飞书开放平台点击「验证」
   - 应该返回成功

5. **测试消息**
   - 在飞书中找到机器人，发送消息
   - 查看 gateway 日志

### 方法二：单元测试

```bash
# 运行飞书扩展测试
pnpm test extensions/feishu

# 运行特定测试文件
pnpm test extensions/feishu/src/format.test.ts
pnpm test extensions/feishu/src/targets.test.ts
```

### 方法三：API 直接测试

使用 curl 测试各 API：

```bash
# 获取 tenant_access_token
curl -X POST "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal" \
  -H "Content-Type: application/json" \
  -d '{
    "app_id": "cli_xxxxxxxxxx",
    "app_secret": "xxxxxxxxxxxxxxxx"
  }'

# 获取 bot 信息（健康检查）
curl "https://open.feishu.cn/open-apis/bot/v3/info" \
  -H "Authorization: Bearer t-xxxxxxxx"

# 发送消息
curl -X POST "https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=open_id" \
  -H "Authorization: Bearer t-xxxxxxxx" \
  -H "Content-Type: application/json" \
  -d '{
    "receive_id": "ou_xxxxxxxx",
    "msg_type": "text",
    "content": "{\"text\":\"Hello from API test\"}"
  }'
```

---

## 功能验证清单

### P0 核心功能

- [ ] **URL 验证**
  - 飞书开放平台点击「验证」按钮
  - 预期：返回 challenge 成功

- [ ] **接收私聊消息**
  - 在飞书中私聊机器人
  - 预期：gateway 日志显示收到消息

- [ ] **接收群聊消息**
  - 在群组中 @机器人
  - 预期：gateway 日志显示收到消息

- [ ] **发送文本消息**
  - 机器人回复纯文本
  - 预期：用户收到文本消息

- [ ] **发送富文本消息**
  - 机器人回复包含代码块的消息
  - 预期：用户收到格式化的富文本

- [ ] **消息去重**
  - 快速发送多条相同消息
  - 预期：不会重复处理

- [ ] **消息防抖**
  - 快速连续发送多条消息
  - 预期：合并为一条处理

### P1 重要功能

- [ ] **线程回复**
  - 在已有消息上回复
  - 预期：机器人在同一线程回复

- [ ] **用户解析**
  ```typescript
  import { resolveFeishuUserAllowlist } from "@clawdbot/feishu";
  const results = await resolveFeishuUserAllowlist({
    account,
    entries: ["user@example.com", "ou_xxxxx"],
  });
  ```

- [ ] **群组解析**
  ```typescript
  import { resolveFeishuChatAllowlist } from "@clawdbot/feishu";
  const results = await resolveFeishuChatAllowlist({
    account,
    entries: ["oc_xxxxx", "群组名称"],
  });
  ```

- [ ] **读取消息历史**
  ```typescript
  import { readFeishuMessages } from "@clawdbot/feishu";
  const history = await readFeishuMessages({
    account,
    chatId: "oc_xxxxx",
    limit: 10,
  });
  ```

- [ ] **删除消息**
  ```typescript
  import { deleteFeishuMessage } from "@clawdbot/feishu";
  await deleteFeishuMessage({
    account,
    messageId: "om_xxxxx",
  });
  ```

### P2 增强功能

- [ ] **上传图片**
  ```typescript
  import { uploadFeishuImage } from "@clawdbot/feishu";
  const { imageKey } = await uploadFeishuImage({
    account,
    buffer: imageBuffer,
  });
  ```

- [ ] **下载文件**
  ```typescript
  import { downloadFeishuFile } from "@clawdbot/feishu";
  const { buffer, filename } = await downloadFeishuFile({
    account,
    messageId: "om_xxxxx",
    fileKey: "file_xxxxx",
    type: "file",
  });
  ```

- [ ] **列出群成员**
  ```typescript
  import { listFeishuChatMembers } from "@clawdbot/feishu";
  const { members } = await listFeishuChatMembers({
    account,
    chatId: "oc_xxxxx",
  });
  ```

- [ ] **表情反应**
  ```typescript
  import { addFeishuReaction } from "@clawdbot/feishu";
  await addFeishuReaction({
    account,
    messageId: "om_xxxxx",
    emojiType: "SMILE",
  });
  ```

---

## 测试脚本示例

创建 `extensions/feishu/test-manual.ts`：

```typescript
import {
  resolveFeishuAccount,
  sendMessageFeishu,
  probeFeishu,
  getFeishuUserInfo,
  listFeishuBotChats,
} from "./index.js";

async function main() {
  // 从环境变量或配置文件加载配置
  const account = resolveFeishuAccount({
    cfg: {
      channels: {
        feishu: {
          enabled: true,
          appId: process.env.FEISHU_APP_ID!,
          appSecret: process.env.FEISHU_APP_SECRET!,
        },
      },
    },
  });

  console.log("=== 健康检查 ===");
  const probe = await probeFeishu(account);
  console.log("Probe result:", probe);

  if (!probe.ok) {
    console.error("健康检查失败，请检查配置");
    return;
  }

  console.log("\n=== 获取机器人所在群组 ===");
  const { chats } = await listFeishuBotChats({ account, limit: 5 });
  console.log("Chats:", chats.map((c) => ({ id: c.chat_id, name: c.name })));

  // 如果有测试用户 ID，可以测试发送消息
  const testUserId = process.env.FEISHU_TEST_USER_ID;
  if (testUserId) {
    console.log("\n=== 发送测试消息 ===");
    const result = await sendMessageFeishu(testUserId, "Hello from test script!", {
      account,
    });
    console.log("Send result:", result);
  }
}

main().catch(console.error);
```

运行：

```bash
FEISHU_APP_ID=xxx FEISHU_APP_SECRET=xxx bun extensions/feishu/test-manual.ts
```

---

## 常见问题

### 1. URL 验证失败

**原因**：飞书无法访问你的 webhook URL

**解决**：
- 确保 ngrok 隧道正常运行
- 检查 gateway 是否启动
- 确认 webhookPath 配置正确

### 2. 收不到消息

**原因**：事件订阅未生效

**解决**：
- 确认已订阅 `im.message.receive_v1` 事件
- 确认应用已发布
- 确认机器人已添加到对话/群组

### 3. Token 获取失败

**原因**：App ID 或 App Secret 错误

**解决**：
- 重新复制 App ID 和 App Secret
- 确认没有多余的空格

### 4. 权限不足

**原因**：未申请必要权限

**解决**：
- 在权限管理中申请所需权限
- 重新发布应用版本

### 5. 消息签名验证失败

**原因**：Encrypt Key 配置错误

**解决**：
- 确认 encryptKey 与飞书后台一致
- 如果不需要加密，可以不配置 encryptKey

---

## 调试技巧

### 启用详细日志

```bash
CLAWDBOT_VERBOSE=1 pnpm clawdbot gateway run
```

### 查看 webhook 请求

在 ngrok 控制台（http://127.0.0.1:4040）查看所有请求详情。

### 测试事件解密

```typescript
import { decryptEvent, verifyEventSignature } from "@clawdbot/feishu";

// 验证签名
const valid = verifyEventSignature({
  timestamp: "1234567890",
  nonce: "abc",
  encryptKey: "your-key",
  body: '{"encrypt":"..."}',
  signature: "xxx",
});

// 解密事件
const decrypted = decryptEvent({
  encrypt: "encrypted-string",
  encryptKey: "your-key",
});
```
