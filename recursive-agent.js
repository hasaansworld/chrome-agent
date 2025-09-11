// Recursive Agent Implementation

async function runAutonomousAgent(initialMessage) {
  let stepCount = 0;
  const maxSteps = 20;

  addMessage(
    "system",
    `🤖 Starting autonomous agent for task: "${initialMessage}"`
  );

  // Start with the first action step
  await executeActionStep(initialMessage, stepCount, maxSteps);
}

async function executeActionStep(
  taskMessage,
  stepCount,
  maxSteps,
  lastActionResult = null
) {
  if (stepCount >= maxSteps) {
    addMessage(
      "system",
      `⚠️ Agent reached maximum steps (${maxSteps}), stopping for safety`
    );
    return;
  }

  stepCount++;

  try {
    // ALWAYS get fresh DOM before any action
    addMessage("system", "🔄 Getting fresh page state for action...");
    const elementsData = await getElementsFromTab(currentTabId);

    if (!elementsData || !elementsData.data || !elementsData.data.elements) {
      addMessage("system", "❌ Could not extract elements from the page");
      return;
    }

    // Build context message for action step
    let contextMessage;
    if (stepCount === 1) {
      contextMessage = `Task: ${taskMessage}. Analyze the current page state and determine what to do first.`;
    } else if (lastActionResult === "retry") {
      contextMessage = `Task: ${taskMessage}. The previous action verification failed. Analyze the current page state and try a different approach.`;
    } else {
      contextMessage = `Continue with task: ${taskMessage}. You have completed ${Math.floor(
        (stepCount - 1) / 2
      )} verified actions. Analyze the current page state and determine what to do next.`;
    }

    addMessage("user", contextMessage);
    conversationHistory.push({ role: "user", content: contextMessage });

    const selectedModel = modelSelector.value;
    const response = await callGroqAPI(
      contextMessage,
      elementsData.data.elements,
      conversationHistory,
      selectedModel
    );

    let jsonResponse;
    try {
      jsonResponse = JSON.parse(response);
    } catch (parseError) {
      addMessage(
        "system",
        `❌ Invalid JSON response: ${response.substring(0, 200)}...`
      );
      return;
    }

    conversationHistory.push({ role: "assistant", content: response });
    addMessage("assistant", jsonResponse.message || "No message provided");

    // Handle the action
    if (jsonResponse.action === "none") {
      addMessage("system", `🎯 Task completed: ${jsonResponse.message}`);
      return;
    }

    // Execute the action
    const actionSuccess = await executeAction(jsonResponse, currentTabId);
    if (!actionSuccess) {
      addMessage(
        "system",
        "❌ Action execution failed, trying different approach"
      );
      // Retry with same step count (don't increment)
      await executeActionStep(taskMessage, stepCount - 1, maxSteps, "retry");
      return;
    }

    // Wait for page updates
    addMessage("system", "🕰️ Waiting for page updates...");
    await new Promise((resolve) =>
      setTimeout(resolve, getActionDelay(jsonResponse.action))
    );

    // Now call verification step
    await executeVerificationStep(
      taskMessage,
      stepCount,
      maxSteps,
      jsonResponse
    );
  } catch (error) {
    console.error("Action step failed:", error);
    addMessage("system", `❌ Agent error: ${error.message}`);
    return;
  }
}

async function executeVerificationStep(
  taskMessage,
  stepCount,
  maxSteps,
  lastAction
) {
  try {
    // ALWAYS get fresh DOM before verification
    addMessage("system", "🔄 Getting fresh page state for verification...");
    const elementsData = await getElementsFromTab(currentTabId);

    if (!elementsData || !elementsData.data || !elementsData.data.elements) {
      addMessage("system", "❌ Could not extract elements for verification");
      return;
    }

    // Build verification context message
    const contextMessage = `VERIFICATION STEP: You just executed: ${JSON.stringify(
      lastAction
    )}.

IMPORTANT: Look ONLY at the current DOM elements to verify if the action worked.

For CLICK actions, check if:
- New elements appeared (modals, pages, forms, buttons, content)
- Page navigation occurred
- UI state changed (buttons enabled/disabled, content updated)

For TEXT ENTRY actions, check if:
- The text appears in the target input field
- Form validation messages appeared
- Auto-complete or suggestions showed up

For SCROLL actions, check if:
- New content became visible
- Page position changed

For PRESS ENTER actions, check if:
- Form was submitted or search executed
- New page loaded or content appeared
- Navigation occurred

Respond with JSON in this format:
{
  "action": "verified" | "retry",
  "message": "Detailed explanation of what you observed",
  "nextAction": {
    "action": "click" | "enterText" | "scrollY" | "pressEnter" | "none",
    "elementIndex": 123,
    "text": "text to enter", 
    "amount": 100,
    "message": "What this next action will accomplish"
  }
}

If verification PASSED, suggest the next logical action in nextAction.
If verification FAILED, set action to "retry" and suggest a different approach in nextAction.`;

    addMessage("user", contextMessage);
    conversationHistory.push({ role: "user", content: contextMessage });

    const selectedModel = modelSelector.value;
    const response = await callGroqAPI(
      contextMessage,
      elementsData.data.elements,
      conversationHistory,
      selectedModel
    );

    let jsonResponse;
    try {
      jsonResponse = JSON.parse(response);
    } catch (parseError) {
      addMessage(
        "system",
        `❌ Invalid verification JSON response: ${response.substring(
          0,
          200
        )}...`
      );
      return;
    }

    conversationHistory.push({ role: "assistant", content: response });
    addMessage(
      "assistant",
      jsonResponse.message || "No verification message provided"
    );

    // Handle verification result
    if (jsonResponse.action === "verified") {
      addMessage("system", `✅ Verification passed: ${jsonResponse.message}`);

      // Execute the suggested next action
      if (
        jsonResponse.nextAction &&
        jsonResponse.nextAction.action !== "none"
      ) {
        // Call next action step recursively
        await executeNextAction(
          taskMessage,
          stepCount,
          maxSteps,
          jsonResponse.nextAction
        );
      } else {
        addMessage(
          "system",
          `🎯 Task completed: ${
            jsonResponse.nextAction?.message || "No further actions needed"
          }`
        );
      }
    } else if (jsonResponse.action === "retry") {
      addMessage("system", `⚠️ Verification failed`);

      // Try the suggested retry action
      if (jsonResponse.nextAction) {
        await executeNextAction(
          taskMessage,
          stepCount - 1,
          maxSteps,
          jsonResponse.nextAction,
          "retry"
        );
      } else {
        addMessage("system", "❌ No retry action suggested, stopping");
      }
    } else {
      addMessage("system", "❌ Invalid verification response");
    }
  } catch (error) {
    console.error("Verification step failed:", error);
    addMessage("system", `❌ Verification error: ${error.message}`);
  }
}

async function executeNextAction(
  taskMessage,
  stepCount,
  maxSteps,
  actionData,
  context = null
) {
  try {
    // Execute the action
    const actionSuccess = await executeAction(actionData, currentTabId);
    if (!actionSuccess) {
      addMessage(
        "system",
        "❌ Next action execution failed, trying different approach"
      );
      // Go back to action step to try something different
      await executeActionStep(taskMessage, stepCount, maxSteps, "retry");
      return;
    }

    // Wait for page updates
    addMessage("system", "🕰️ Waiting for page updates...");
    await new Promise((resolve) =>
      setTimeout(resolve, getActionDelay(actionData.action))
    );

    // Now call verification for this action
    await executeVerificationStep(
      taskMessage,
      stepCount + 1,
      maxSteps,
      actionData
    );
  } catch (error) {
    console.error("Next action failed:", error);
    addMessage("system", `❌ Next action error: ${error.message}`);
  }
}
