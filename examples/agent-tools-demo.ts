/**
 * AgentToolFactoryのデモンストレーション
 * Task 2.4: エージェント間通信ツール(send_message)の使用例
 */

import { TmuxManager, AgentToolFactory, createAgentToolFactory } from "@aku11i/phantom-core";
import type { SquadConfig } from "@aku11i/phantom-core";

/**
 * AgentToolFactoryのデモンストレーション
 */
async function demonstrateAgentTools() {
  console.log("=== Agent Tools Demo ===\n");

  // 1. TmuxManagerのセットアップ
  const tmuxManager = new TmuxManager("agent-tools-demo");
  
  // サンプル設定
  const squadConfig: SquadConfig = {
    agents: [
      { name: "manager", prompt: "prompts/manager.md", worktree: false },
      { name: "researcher", prompt: "prompts/researcher.md", worktree: true },
      { name: "tester", prompt: "prompts/tester.md", worktree: false },
    ],
    layout: "auto"
  };

  try {
    // 2. Tmuxレイアウトを作成（実際の使用では必要）
    console.log("Setting up Tmux layout...");
    const layoutResult = await tmuxManager.createLayout(squadConfig);
    
    if (!layoutResult.ok) {
      console.error("Failed to create layout:", layoutResult.error.message);
      return;
    }

    console.log("Created panes for agents:", layoutResult.value.map(p => p.agentName).join(", "));
    console.log();

    // 3. AgentToolFactoryを作成
    const toolFactory = createAgentToolFactory(tmuxManager);

    // 4. 利用可能なエージェントを確認
    console.log("Available agents:");
    const availableAgents = toolFactory.getAvailableAgents();
    availableAgents.forEach(agent => console.log(`  - ${agent}`));
    console.log();

    // 5. ツールの使用方法を表示
    console.log("Tool usage:");
    console.log(toolFactory.getToolUsage());

    // 6. メッセージ送信のデモンストレーション
    console.log("=== Message Sending Demo ===\n");

    // Managerからresearcherへの指示
    console.log("Manager → Researcher:");
    const researchResult = await toolFactory.sendMessage(
      "researcher",
      "Please analyze the current codebase structure and identify key components for testing"
    );

    if (researchResult.ok) {
      console.log("✅ Message sent successfully");
      console.log(`  Target: ${researchResult.value.targetAgent}`);
      console.log(`  Time: ${researchResult.value.timestamp.toISOString()}`);
      console.log(`  Message: "${researchResult.value.message}"`);
    } else {
      console.error("❌ Failed to send message:", researchResult.error.message);
    }
    console.log();

    // Managerからtesterへの指示
    console.log("Manager → Tester:");
    const testResult = await toolFactory.sendMessage(
      "tester",
      "Run unit tests for the squad communication tools and report results"
    );

    if (testResult.ok) {
      console.log("✅ Message sent successfully");
      console.log(`  Target: ${testResult.value.targetAgent}`);
      console.log(`  Time: ${testResult.value.timestamp.toISOString()}`);
      console.log(`  Message: "${testResult.value.message}"`);
    } else {
      console.error("❌ Failed to send message:", testResult.error.message);
    }
    console.log();

    // 7. エラーハンドリングのデモ
    console.log("=== Error Handling Demo ===\n");

    // 存在しないエージェントへの送信
    console.log("Attempting to send to non-existent agent:");
    const errorResult = await toolFactory.sendMessage("nonexistent", "Hello!");
    
    if (!errorResult.ok) {
      console.log("❌ Expected error:", errorResult.error.message);
    }
    console.log();

    // 8. 汎用ツール実行インターフェースのデモ
    console.log("=== Generic Tool Execution Demo ===\n");

    const genericResult = await toolFactory.executeTool("send_message", {
      agentName: "researcher",
      message: "This message was sent using the generic tool execution interface"
    });

    if (genericResult.ok) {
      console.log("✅ Generic tool execution successful");
      console.log(`  Tool: ${genericResult.value.toolName}`);
      console.log(`  Parameters:`, genericResult.value.parameters);
      console.log(`  Result: ${genericResult.value.result.targetAgent} received message`);
    } else {
      console.error("❌ Generic tool execution failed:", genericResult.error.message);
    }

  } catch (error) {
    console.error("Demo failed:", error);
  } finally {
    // 9. クリーンアップ
    console.log("\n=== Cleanup ===");
    const killResult = await tmuxManager.killSession();
    if (killResult.ok) {
      console.log("✅ Tmux session cleaned up");
    } else {
      console.log("⚠️ Failed to cleanup session (may not exist)");
    }
  }
}

/**
 * 実際のプロダクション使用例
 * Managerエージェントがプロンプトから呼び出すパターン
 */
function exampleManagerPromptUsage() {
  console.log("\n=== Manager Agent Usage Example ===\n");
  
  const examplePrompt = `
# Manager Agent Prompt

You are the Manager agent in a collaborative AI squad. You have access to the following tools:

## send_message Tool

Use this tool to send instructions to other agents in your squad.

**Syntax:** \`send_message(agentName: string, message: string)\`

**Available agents:** researcher, tester, developer

**Examples:**
- \`send_message("researcher", "Please analyze the user requirements and create a technical specification")\`
- \`send_message("tester", "Run integration tests on the authentication module")\`
- \`send_message("developer", "Implement the user registration feature based on the specification")\`

## Your Task

Coordinate the team to complete the current project milestone. Break down tasks and assign them to appropriate agents.

## Implementation in Code

When implementing this in a Claude session, the \`send_message\` function would be available as:

\`\`\`typescript
// This function would be injected into the Manager agent's context
async function send_message(agentName: string, message: string) {
  // Implementation details handled by AgentToolFactory
  const result = await agentToolFactory.sendMessage(agentName, message);
  
  if (result.ok) {
    return {
      success: true,
      target: result.value.targetAgent,
      message: result.value.message,
      timestamp: result.value.timestamp
    };
  } else {
    throw new Error(\`Failed to send message: \${result.error.message}\`);
  }
}
\`\`\`
`;
  
  console.log(examplePrompt);
}

// デモを実行
if (import.meta.main) {
  await demonstrateAgentTools();
  exampleManagerPromptUsage();
}