import type { ResolvedFeishuAccount } from "../../accounts.js";
import type { FeishuEvent, FeishuMessageEvent } from "../../types.js";
import type { FeishuMonitorContext } from "../context.js";
import type { FeishuMessageHandler } from "../message-handler.js";
import {
  createFeishuMessageEventHandler,
  type FeishuMessageEventHandler,
} from "./messages.js";

export type FeishuEventHandlers = {
  message: FeishuMessageEventHandler;
  handleEvent: (event: FeishuEvent) => Promise<void>;
};

export function createFeishuEventHandlers(params: {
  ctx: FeishuMonitorContext;
  account: ResolvedFeishuAccount;
  messageHandler: FeishuMessageHandler;
}): FeishuEventHandlers {
  const { ctx, account, messageHandler } = params;

  const messageEventHandler = createFeishuMessageEventHandler({
    ctx,
    account,
    messageHandler,
  });

  const handleEvent = async (event: FeishuEvent) => {
    const eventType = event.header?.event_type;

    switch (eventType) {
      case "im.message.receive_v1":
        await messageEventHandler.handleMessageReceive(event as FeishuMessageEvent);
        break;

      case "im.message.reaction.created_v1":
        // TODO: Handle reaction added
        break;

      case "im.message.reaction.deleted_v1":
        // TODO: Handle reaction removed
        break;

      case "im.chat.member.bot.added_v1":
        // TODO: Handle bot added to chat
        break;

      case "im.chat.member.bot.deleted_v1":
        // TODO: Handle bot removed from chat
        break;

      default:
        // Unknown event type
        break;
    }
  };

  return {
    message: messageEventHandler,
    handleEvent,
  };
}

export { createFeishuMessageEventHandler } from "./messages.js";
export type { FeishuMessageEventHandler } from "./messages.js";
