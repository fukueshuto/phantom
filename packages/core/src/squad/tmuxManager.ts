import { type Result, err, ok } from "@aku11i/phantom-shared";
import { 
  type TmuxOptions, 
  type TmuxSuccess, 
  type TmuxSplitDirection,
  executeTmuxCommand,
  isInsideTmux,
  spawnProcess,
} from "@aku11i/phantom-process";
import type { ProcessError } from "@aku11i/phantom-process";
import type { Agent, SquadConfig } from "../config/validate.ts";

export interface PaneInfo {
  id: string;
  agentName: string;
  index: number;
}

export interface LayoutConfig {
  type: "auto" | "grid" | "main-vertical";
  agentCount: number;
}

export class TmuxSessionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TmuxSessionError";
  }
}

export class TmuxManager {
  private sessionName: string;
  private paneMapping: Map<string, PaneInfo> = new Map();
  private currentPaneIndex = 0;

  constructor(sessionName: string = "phantom-squad") {
    this.sessionName = sessionName;
  }

  /**
   * Tmux環境内かどうかを確認
   */
  async checkTmuxEnvironment(): Promise<Result<boolean, TmuxSessionError>> {
    try {
      const inTmux = await isInsideTmux();
      return ok(inTmux);
    } catch (error) {
      return err(new TmuxSessionError(`Failed to check tmux environment: ${error}`));
    }
  }

  /**
   * 指定されたレイアウト設定に基づいてTmuxセッションを作成
   */
  async createLayout(squadConfig: SquadConfig): Promise<Result<PaneInfo[], TmuxSessionError | ProcessError>> {
    const { agents, layout } = squadConfig;
    
    if (agents.length === 0) {
      return err(new TmuxSessionError("No agents specified in configuration"));
    }

    // まず新しいセッションを作成
    const createSessionResult = await this.createNewSession();
    if (!createSessionResult.ok) {
      return err(createSessionResult.error);
    }

    const panes: PaneInfo[] = [];
    const firstAgent = agents[0];
    const firstPane: PaneInfo = {
      id: "0", // 最初のペインはID 0
      agentName: firstAgent.name,
      index: 0,
    };
    
    this.paneMapping.set(firstAgent.name, firstPane);
    panes.push(firstPane);
    this.currentPaneIndex = 1;

    // 残りのエージェント用にペインを分割
    for (let i = 1; i < agents.length; i++) {
      const agent = agents[i];
      const paneResult = await this.createPane(agent, layout, i, agents.length);
      
      if (!paneResult.ok) {
        return err(paneResult.error);
      }

      const pane = paneResult.value;
      this.paneMapping.set(agent.name, pane);
      panes.push(pane);
    }

    // レイアウトを適用
    const layoutResult = await this.applyLayout(layout, agents.length);
    if (!layoutResult.ok) {
      return err(layoutResult.error);
    }

    return ok(panes);
  }

  /**
   * 新しいTmuxセッションを作成
   */
  private async createNewSession(): Promise<Result<TmuxSuccess, ProcessError>> {
    return await spawnProcess({
      command: "tmux",
      args: ["new-session", "-d", "-s", this.sessionName, "bash"],
    });
  }

  /**
   * 新しいTmuxウィンドウを作成
   */
  private async createNewWindow(agentName: string): Promise<Result<TmuxSuccess, ProcessError>> {
    const options: TmuxOptions = {
      direction: "new",
      command: "bash", // デフォルトシェル
      windowName: agentName,
    };

    return await executeTmuxCommand(options);
  }

  /**
   * レイアウトに基づいて新しいペインを作成
   */
  private async createPane(
    agent: Agent, 
    layout: string, 
    index: number, 
    totalAgents: number
  ): Promise<Result<PaneInfo, ProcessError>> {
    const direction = this.getSplitDirection(layout, index, totalAgents);
    
    let tmuxArgs: string[];
    
    switch (direction) {
      case "vertical":
        tmuxArgs = ["split-window", "-v", "-t", this.sessionName, "bash"];
        break;
      case "horizontal":
        tmuxArgs = ["split-window", "-h", "-t", this.sessionName, "bash"];
        break;
      default:
        tmuxArgs = ["split-window", "-v", "-t", this.sessionName, "bash"];
    }

    const result = await spawnProcess({
      command: "tmux",
      args: tmuxArgs,
    });

    if (!result.ok) {
      return err(result.error);
    }

    const paneInfo: PaneInfo = {
      id: this.currentPaneIndex.toString(),
      agentName: agent.name,
      index: this.currentPaneIndex,
    };

    this.currentPaneIndex++;
    return ok(paneInfo);
  }

  /**
   * レイアウトとインデックスに基づいて分割方向を決定
   */
  private getSplitDirection(layout: string, index: number, totalAgents: number): TmuxSplitDirection {
    switch (layout) {
      case "grid":
        // グリッドレイアウト: 交互に水平・垂直分割
        return index % 2 === 1 ? "horizontal" : "vertical";
        
      case "main-vertical":
        // メイン垂直レイアウト: 最初は垂直、その後は水平
        return index === 1 ? "vertical" : "horizontal";
        
      case "auto":
      default:
        // 自動レイアウト: エージェント数に基づいて最適化
        if (totalAgents <= 2) {
          return "vertical";
        } else if (totalAgents <= 4) {
          return index % 2 === 1 ? "vertical" : "horizontal";
        } else {
          // 5つ以上の場合はグリッド風に配置
          return index % 3 === 1 ? "vertical" : "horizontal";
        }
    }
  }

  /**
   * 最終的なレイアウトを適用
   */
  private async applyLayout(layout: string, agentCount: number): Promise<Result<TmuxSuccess, ProcessError>> {
    let tmuxLayout: string;

    switch (layout) {
      case "grid":
        tmuxLayout = "tiled";
        break;
      case "main-vertical":
        tmuxLayout = "main-vertical";
        break;
      case "auto":
      default:
        // エージェント数に基づいて最適なレイアウトを選択
        if (agentCount <= 2) {
          tmuxLayout = "even-horizontal";
        } else if (agentCount <= 4) {
          tmuxLayout = "tiled";
        } else {
          tmuxLayout = "tiled";
        }
        break;
    }

    // tmux select-layout コマンドを実行
    return await spawnProcess({
      command: "tmux",
      args: ["select-layout", "-t", this.sessionName, tmuxLayout],
    });
  }

  /**
   * 特定のペインにキーストロークを送信
   */
  async sendKeys(paneId: string, keys: string): Promise<Result<TmuxSuccess, ProcessError | TmuxSessionError>> {
    // ペインIDの検証
    const paneInfo = Array.from(this.paneMapping.values()).find(pane => pane.id === paneId);
    if (!paneInfo) {
      return err(new TmuxSessionError(`Pane with ID ${paneId} not found`));
    }

    return await spawnProcess({
      command: "tmux",
      args: ["send-keys", "-t", `${this.sessionName}:${paneId}`, keys, "Enter"],
    });
  }

  /**
   * エージェント名からペイン情報を取得
   */
  getPaneByAgentName(agentName: string): PaneInfo | undefined {
    return this.paneMapping.get(agentName);
  }

  /**
   * 全てのペイン情報を取得
   */
  getAllPanes(): PaneInfo[] {
    return Array.from(this.paneMapping.values());
  }

  /**
   * セッション名を取得
   */
  getSessionName(): string {
    return this.sessionName;
  }

  /**
   * 既存セッションにアタッチ可能かチェック
   */
  async checkExistingSession(): Promise<Result<boolean, ProcessError>> {
    const result = await spawnProcess({
      command: "tmux",
      args: ["has-session", "-t", this.sessionName],
    });
    
    // has-sessionは存在する場合exit code 0、存在しない場合非0を返す
    return ok(result.ok);
  }

  /**
   * 既存セッションにアタッチ
   */
  async attachToSession(): Promise<Result<TmuxSuccess, ProcessError>> {
    return await spawnProcess({
      command: "tmux",
      args: ["attach-session", "-t", this.sessionName],
    });
  }

  /**
   * セッションを終了
   */
  async killSession(): Promise<Result<TmuxSuccess, ProcessError>> {
    const result = await spawnProcess({
      command: "tmux",
      args: ["kill-session", "-t", this.sessionName],
    });
    
    // セッション終了後はペインマッピングをクリア
    if (result.ok) {
      this.paneMapping.clear();
      this.currentPaneIndex = 0;
    }

    return result;
  }
}