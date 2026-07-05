/**
 * Scripted LlmProvider for the assistant suite (008 03-research D9): each
 * scenario lists the exact LlmTurnResult sequence the "model" produces; the
 * fake records every complete() input so tests can assert what the service
 * actually sent (system, history, tools, tool results). No network, fully
 * deterministic.
 */
import type {
  LlmMessage,
  LlmProvider,
  LlmToolCall,
  LlmToolDefinition,
  LlmTurnResult,
  LlmUsage,
} from "@/server/llm/provider";

export interface FakeLlmCall {
  system: string;
  messages: LlmMessage[];
  tools: LlmToolDefinition[];
  maxTokens: number;
}

export function usage(inputTokens = 100, outputTokens = 20): LlmUsage {
  return { inputTokens, outputTokens };
}

export function reply(text: string, turnUsage: LlmUsage = usage()): LlmTurnResult {
  return { kind: "reply", text, usage: turnUsage };
}

export function toolCalls(calls: LlmToolCall[], turnUsage: LlmUsage = usage()): LlmTurnResult {
  return { kind: "tool_calls", calls, usage: turnUsage };
}

export class FakeLlmProvider implements LlmProvider {
  /** Every complete() input, deep-cloned at call time. */
  readonly calls: FakeLlmCall[] = [];
  private readonly script: LlmTurnResult[];

  constructor(script: LlmTurnResult[]) {
    this.script = [...script];
  }

  async complete(input: FakeLlmCall): Promise<LlmTurnResult> {
    this.calls.push(structuredClone(input));
    const next = this.script.shift();
    if (!next) {
      throw new Error(`FakeLlmProvider: script exhausted after ${this.calls.length} calls`);
    }
    return next;
  }
}
