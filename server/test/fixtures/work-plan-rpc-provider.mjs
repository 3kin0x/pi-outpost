import { createAssistantMessageEventStream } from "@earendil-works/pi-ai/compat";

const usage = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

function message(model, content, stopReason) {
  return {
    role: "assistant",
    content,
    api: model.api,
    provider: model.provider,
    model: model.id,
    usage,
    stopReason,
    timestamp: Date.now(),
  };
}

function streamWorkPlan(model, context) {
  const stream = createAssistantMessageEventStream();
  queueMicrotask(() => {
    const afterTool = context.messages.at(-1)?.role === "toolResult";
    if (afterTool) {
      const output = message(model, [{ type: "text", text: "Plan updated." }], "stop");
      stream.push({ type: "start", partial: output });
      stream.push({ type: "text_start", contentIndex: 0, partial: output });
      stream.push({ type: "text_end", contentIndex: 0, content: "Plan updated.", partial: output });
      stream.push({ type: "done", reason: "stop", message: output });
    } else {
      const toolCall = {
        type: "toolCall",
        id: "real-rpc-work-plan",
        name: "work_plan",
        arguments: {
          action: "replace",
          plan: {
            version: 1,
            id: "rpc-release",
            title: "RPC release",
            updatedAt: "2026-08-23T00:00:00.000Z",
            tasks: [{ id: "verify", title: "Verify RPC", status: "done", dependsOn: [], resources: [] }],
          },
        },
      };
      const output = message(model, [toolCall], "toolUse");
      stream.push({ type: "start", partial: output });
      stream.push({ type: "toolcall_start", contentIndex: 0, partial: output });
      stream.push({ type: "toolcall_end", contentIndex: 0, toolCall, partial: output });
      stream.push({ type: "done", reason: "toolUse", message: output });
    }
    stream.end();
  });
  return stream;
}

export default function (pi) {
  pi.registerProvider("work-plan-test", {
    baseUrl: "http://127.0.0.1",
    apiKey: "test",
    api: "work-plan-test-api",
    models: [{
      id: "work-plan-test",
      name: "Work Plan Test",
      reasoning: false,
      input: ["text"],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 16_000,
      maxTokens: 1_000,
    }],
    streamSimple: streamWorkPlan,
  });
}
