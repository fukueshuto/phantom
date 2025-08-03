/**
 * Squad機能に関連する型定義
 */

import type { Agent, SquadConfig } from "../config/validate.ts";

// TmuxManagerから再エクスポート
export type { PaneInfo, LayoutConfig } from "./tmuxManager.ts";

/**
 * レイアウト種別の定義
 */
export type LayoutType = "auto" | "grid" | "main-vertical";

/**
 * エージェント実行状態
 */
export interface AgentStatus {
  name: string;
  paneId: string;
  status: "starting" | "running" | "stopped" | "error";
  lastActivity?: Date;
}

/**
 * Squad実行コンテキスト
 */
export interface SquadContext {
  sessionName: string;
  config: SquadConfig;
  agents: AgentStatus[];
  startTime: Date;
}

/**
 * ペイン配置情報
 */
export interface PaneLayout {
  paneId: string;
  agentName: string;
  position: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

/**
 * Tmuxセッション情報
 */
export interface TmuxSessionInfo {
  name: string;
  created: Date;
  lastAttached?: Date;
  paneCount: number;
  windowCount: number;
}

// 設定から再エクスポート
export type { Agent, SquadConfig };

// オーケストレーターから再エクスポート
export type { 
  OrchestratorConfig, 
  SetupTeamResult,
  OrchestratorError,
  WorktreeSetupError,
  TmuxSetupError,
  AgentLaunchError,
} from "./orchestrator.ts";