/**
 * エージェント間通信ツールの実装
 * Task 2.4: エージェント間通信ツール(send_message)の実装
 */

import { type Result, err, ok } from "@aku11i/phantom-shared";
import type { TmuxManager } from "./tmuxManager.ts";
import type { ProcessError } from "@aku11i/phantom-process";
import { TmuxSessionError } from "./tmuxManager.ts";

/**
 * エージェントツールのエラー
 */
export class AgentToolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentToolError";
  }
}

/**
 * メッセージ送信結果
 */
export interface SendMessageResult {
  targetAgent: string;
  message: string;
  timestamp: Date;
  success: boolean;
}

/**
 * ツール実行結果
 */
export interface ToolExecutionResult<T = any> {
  toolName: string;
  parameters: Record<string, any>;
  result: T;
  timestamp: Date;
}

/**
 * エージェントツールのファクトリークラス
 * Managerエージェントが使用する内部ツールを提供
 */
export class AgentToolFactory {
  private tmuxManager: TmuxManager;
  private availableAgents: Set<string> = new Set();

  constructor(tmuxManager: TmuxManager) {
    this.tmuxManager = tmuxManager;
    this.updateAvailableAgents();
  }

  /**
   * 利用可能なエージェント一覧を更新
   * TmuxManagerのペインマッピングから取得
   */
  private updateAvailableAgents(): void {
    const panes = this.tmuxManager.getAllPanes();
    this.availableAgents.clear();
    
    for (const pane of panes) {
      this.availableAgents.add(pane.agentName);
    }
  }

  /**
   * 指定されたエージェントにメッセージを送信
   * claude-squadのsend-agent機能のTypeScript移植版
   * 
   * @param agentName 送信先エージェント名
   * @param message 送信するメッセージ
   * @returns 送信結果
   */
  async sendMessage(
    agentName: string, 
    message: string
  ): Promise<Result<SendMessageResult, AgentToolError | TmuxSessionError | ProcessError>> {
    // エージェント名のバリデーション
    if (!agentName || typeof agentName !== 'string') {
      return err(new AgentToolError("Agent name must be a non-empty string"));
    }

    // メッセージのバリデーション
    if (!message || typeof message !== 'string') {
      return err(new AgentToolError("Message must be a non-empty string"));
    }

    // 利用可能なエージェント一覧を更新
    this.updateAvailableAgents();

    // 対象エージェントの存在確認
    if (!this.availableAgents.has(agentName)) {
      const availableList = Array.from(this.availableAgents).join(", ");
      return err(new AgentToolError(
        `Agent "${agentName}" not found. Available agents: ${availableList}`
      ));
    }

    // エージェントのペイン情報を取得
    const paneInfo = this.tmuxManager.getPaneByAgentName(agentName);
    if (!paneInfo) {
      return err(new AgentToolError(
        `Pane information for agent "${agentName}" not found`
      ));
    }

    // メッセージの前処理（特殊文字のエスケープなど）
    const escapedMessage = this.escapeMessage(message);

    // TmuxManagerのsendKeysを使用してメッセージを送信
    const sendResult = await this.tmuxManager.sendKeys(paneInfo.id, escapedMessage);
    
    if (!sendResult.ok) {
      return err(sendResult.error);
    }

    // 送信結果を作成
    const result: SendMessageResult = {
      targetAgent: agentName,
      message: message,
      timestamp: new Date(),
      success: true,
    };

    return ok(result);
  }

  /**
   * メッセージ内の特殊文字をエスケープ
   * Tmuxのsend-keysで安全に送信できるように変換
   */
  private escapeMessage(message: string): string {
    // シングルクォートで囲んでbashで実行
    // 改行文字は実際の改行として送信されるように処理
    return message
      .replace(/'/g, "'\"'\"'") // シングルクォートをエスケープ
      .replace(/\n/g, "\\n");   // 改行文字をエスケープ
  }

  /**
   * 利用可能なエージェント一覧を取得
   */
  getAvailableAgents(): string[] {
    this.updateAvailableAgents();
    return Array.from(this.availableAgents);
  }

  /**
   * ツールの使用方法を取得（デバッグ用）
   */
  getToolUsage(): string {
    const agents = this.getAvailableAgents();
    return `
Available tool: send_message

Usage:
  send_message(agentName: string, message: string)

Parameters:
  - agentName: Target agent name (must be one of: ${agents.join(", ")})
  - message: Message to send to the agent

Example:
  await sendMessage("researcher", "Please analyze the current codebase and provide a summary");
  await sendMessage("tester", "Run unit tests for the authentication module");

Available agents: ${agents.join(", ")}
`;
  }

  /**
   * 全てのツールのリストを取得
   */
  getAvailableTools(): string[] {
    return ["send_message"];
  }

  /**
   * ツールの実行（汎用インターフェース）
   */
  async executeTool(
    toolName: string, 
    parameters: Record<string, any>
  ): Promise<Result<ToolExecutionResult, AgentToolError>> {
    switch (toolName) {
      case "send_message":
        const { agentName, message } = parameters;
        const result = await this.sendMessage(agentName, message);
        
        if (!result.ok) {
          return err(new AgentToolError(`send_message failed: ${result.error.message}`));
        }

        return ok({
          toolName: "send_message",
          parameters: { agentName, message },
          result: result.value,
          timestamp: new Date(),
        });

      default:
        return err(new AgentToolError(`Unknown tool: ${toolName}`));
    }
  }
}

/**
 * エージェントツールファクトリーのインスタンスを作成
 */
export function createAgentToolFactory(tmuxManager: TmuxManager): AgentToolFactory {
  return new AgentToolFactory(tmuxManager);
}