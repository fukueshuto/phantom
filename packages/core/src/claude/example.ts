/**
 * Example usage of ClaudeSessionManager
 * This demonstrates how to use the ClaudeSessionManager in practice
 */

import { ClaudeSessionManager } from "./session.ts";
import { tmpdir } from "node:os";
import { join } from "node:path";

async function demonstrateClaudeSessionManager() {
  // Create a session manager with a temporary directory
  const sessionManager = new ClaudeSessionManager({
    sessionDirectory: join(tmpdir(), "phantom-claude-sessions"),
    timeout: 10000,
  });

  console.log("=== Claude Session Manager Demo ===\n");

  // Example 1: Resume an existing session or start a new one
  console.log("1. Starting/resuming session 'my-project' with agent 'task-executor'");
  const result = await sessionManager.startOrResumeSession("my-project", "task-executor");
  
  if (result.ok) {
    console.log(`✅ Session ${result.value.isNew ? 'started' : 'resumed'}`);
    console.log(`   Session ID: ${result.value.sessionId}`);
    console.log(`   Command: ${result.value.commandString}`);
  } else {
    console.log(`❌ Failed: ${result.error.message}`);
  }

  console.log("\n" + "=".repeat(50) + "\n");

  // Example 2: List all sessions
  console.log("2. Listing all saved sessions");
  const listResult = await sessionManager.listSessions();
  
  if (listResult.ok) {
    console.log(`✅ Found ${listResult.value.length} sessions:`);
    listResult.value.forEach(name => console.log(`   - ${name}`));
  } else {
    console.log(`❌ Failed to list sessions: ${listResult.error.message}`);
  }

  console.log("\n" + "=".repeat(50) + "\n");

  // Example 3: Demonstrate session building
  console.log("3. Building command strings");
  const sessionId = "sess-demo123abc";
  
  const commandWithAgent = sessionManager.buildCommandString(sessionId, "quality-checker");
  const commandWithoutAgent = sessionManager.buildCommandString(sessionId);
  
  console.log(`✅ With agent: ${commandWithAgent}`);
  console.log(`✅ Without agent: ${commandWithoutAgent}`);

  console.log("\n" + "=".repeat(50) + "\n");

  // Example 4: Clean up
  console.log("4. Cleaning up demo session");
  const removeResult = await sessionManager.removeSession("my-project");
  
  if (removeResult.ok) {
    console.log("✅ Session removed successfully");
  } else {
    console.log(`❌ Failed to remove session: ${removeResult.error.message}`);
  }

  console.log("\n=== Demo completed ===");
}

// Run the demo if this file is executed directly
if (import.meta.url.endsWith(process.argv[1])) {
  demonstrateClaudeSessionManager().catch(console.error);
}