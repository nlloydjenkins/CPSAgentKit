# Copilot Studio YAML Syntax Reference

Verified syntax patterns from hands-on editing of exported CPS agent components.

For external pattern examples and schema references, see `reference-library.md` and `reference-patterns.md`. Those files capture what is useful from `microsoft/skills-for-copilot-studio` without treating it as authoritative.

---

## conversationStarters

CPS requires each entry to have `title` and `text` properties. Plain strings produce `MissingRequiredProperty` compile errors.

```yaml
# Correct — object with title and text
conversationStarters:
  - title: Check ticket status
    text: What's the status of my ticket?
  - title: VPN help
    text: How do I connect to VPN from home?
```

```yaml
# WRONG — plain strings cause MissingRequiredProperty errors
conversationStarters:
  - "What's the status of my ticket?"
  - "How do I connect to VPN?"
```

---

## Topic File Structure

```yaml
mcs.metadata:
  componentName: TopicName
  description: Description used by orchestrator for routing.
kind: AdaptiveDialog
modelDescription: Description for generative orchestration routing. More important than triggerQueries.
beginDialog:
  kind: OnRecognizedIntent # or OnConversationStart, OnSystemRedirect
  id: main
  intent:
    displayName: Display Name
    includeInOnSelectIntent: false
    triggerQueries:
      - example query one
      - example query two
  actions:
    - kind: ...
```

## Trigger Types

```yaml
# User intent trigger
beginDialog:
  kind: OnRecognizedIntent
  id: main
  intent:
    displayName: Brand Edit
    includeInOnSelectIntent: false
    triggerQueries:
      - example phrase

# Conversation start (system topic)
beginDialog:
  kind: OnConversationStart
  id: main
  actions:
    - ...

# System redirect (e.g. Reset Conversation)
beginDialog:
  kind: OnSystemRedirect
  id: main
  actions:
    - ...
```

## SetVariable

```yaml
# Static value
- kind: SetVariable
  id: setVariable_abc123
  variable: Global.myVar
  value: "static string value"

# Power Fx expression (prefix with =)
- kind: SetVariable
  id: setVariable_abc456
  variable: Topic.myVar
  value: =System.Activity.Text

# Conditional expression
- kind: SetVariable
  id: setVariable_abc789
  variable: Topic.currentHtml
  value: =If(IsBlank(Topic.currentHtml), Global.baselineHtml, Topic.currentHtml)

# Set to blank
- kind: SetVariable
  id: setVariable_def123
  variable: Topic.myVar
  value: =Blank()
```

## Variable Scopes

```yaml
# Global - persists across topics in the conversation
variable: Global.baselineHtml

# Topic - scoped to the current topic execution
variable: Topic.currentHtml

# Local - scoped to a workflow execution (workflow YAML only)
variable: Local.LatestMessage
variable: Local.TotalIteration

# System - built-in read-only variables
value: =System.Activity.Text
value: =System.ConversationId
value: =System.LastMessageText
```

### Local Scope (Workflows)

`Local.*` variables exist only within workflow YAML files (`kind: workflow`). They are scoped to the current workflow execution — not shared across topics or other workflows. Use `Local.*` for all workflow-internal state: iteration counters, accumulated feedback, agent output buffers, routing flags.

## SendActivity

```yaml
# Simple string
- kind: SendActivity
  id: sendMessage_abc123
  activity: Plain text message here.

# With text and speak variants
- kind: SendActivity
  id: sendMessage_abc456
  activity:
    text:
      - Text shown in chat.
    speak:
      - Text used for speech output.
```

## InvokeAIBuilderModelAction (Prompt Tool)

```yaml
- kind: InvokeAIBuilderModelAction
  id: invokeAIBuilderModelAction_Abc123
  input:
    binding:
      paramName1: =Topic.Variable1
      paramName2: =Topic.Variable2
  output:
    binding:
      predictionOutput: Topic.PredictionOutput
  aIModelId: 377ba100-4197-432b-88b0-b79bc28234e1
```

### Input Bindings

- Each key under `input.binding` must match an input parameter name defined in the prompt tool
- Values use `=Expression` syntax (Power Fx)
- Empty inputs: `input: {}`

### Output Bindings

- `predictionOutput: Topic.PredictionOutput` is the safe universal output binding
- Target variable has NO `=` prefix (it is a variable reference, not an expression)
- Named output bindings (e.g. `imageOutput: Topic.imageOutput`) require the action node's metadata to be in sync with the prompt tool's output schema - this is refreshed only when the action node is deleted and re-added in the portal

## Parsing Prompt JSON Output

When the prompt returns JSON as a single text response via `predictionOutput`:

```yaml
# Serialize the Record to JSON text, re-parse as UntypedObject, extract property
- kind: SetVariable
  id: setVariable_parseField
  variable: Topic.myField
  value: =Text(ParseJSON(JSON(Topic.PredictionOutput)).myField)
```

### What does NOT work

```yaml
# Direct property access on the Record - "Identifier not recognized"
value: =Topic.PredictionOutput.myField

# ParseJSON directly on the Record - "Invalid argument type (Record)"
value: =Text(ParseJSON(Topic.PredictionOutput).myField)

# Text() directly on the Record - "Expected text or number"
value: =Text(Topic.PredictionOutput)
```

### Working pattern

1. `JSON(Topic.PredictionOutput)` - serializes the Record to a JSON string
2. `ParseJSON(...)` - re-parses the string into an UntypedObject
3. `.myField` - property access works on UntypedObject
4. `Text(...)` - converts Untyped to String for assignment

## ClearAllVariables

```yaml
- kind: ClearAllVariables
  id: clearAllVariables_abc123
  variables: ConversationScopedVariables
```

## CancelAllDialogs

```yaml
- kind: CancelAllDialogs
  id: cancelAllDialogs_abc123
```

## Topic Input/Output Schema

Declared at the bottom of the topic file, outside of `beginDialog`:

```yaml
inputType:
  properties:
    paramName:
      displayName: paramName
      type: String

    anotherParam:
      displayName: anotherParam
      type: String

outputType:
  properties:
    outputField:
      displayName: outputField
      type: String
```

## Start Behavior (System Topics)

```yaml
startBehavior: UseLatestPublishedContentAndCancelOtherTopics
```

## Condition on Trigger (OnRecognizedIntent)

```yaml
beginDialog:
  kind: OnRecognizedIntent
  id: main
  condition: =Topic.someVar = "value"
```

Note: conditions on triggers can block re-entry. For iterative topics, avoid conditions or ensure the condition remains true across invocations.

## Action YAML Files (Tools/Connectors)

Only two fields are safe to edit:

```yaml
modelDisplayName: "Display Name"
modelDescription: "Description for orchestrator routing"
```

Everything else (`mcs.metadata`, `kind`, `action`, `inputs`, `outputs`, `outputMode`) is platform-generated and must not be modified.

Never use block scalar syntax (`>-` or `|`) for `modelDescription` - it breaks tools in CPS. Always use plain inline strings.

## String Encoding for HTML in YAML

HTML stored as a YAML quoted string value must use Unicode escapes:

```
\u003C  =  <
\u003E  =  >
\u0022  =  "
\u0027  =  '
\u0026  =  &
```

Example:

```yaml
value: "\\u003C!DOCTYPE html\\u003E \\u003Chtml\\u003E..."
```

Never use YAML block scalars (`|-`, `|`, `>-`, `>`) for large HTML values - they can break CPS parsing.

---

## Workflow YAML Structure

Workflows (`kind: workflow`) are a distinct CPS file type — they define multi-step, multi-agent orchestration logic in a single YAML file. Unlike topics (`kind: AdaptiveDialog`) which are triggered by the generative orchestrator, workflows define their own trigger and execute a linear-with-branches action sequence.

### Basic Structure

```yaml
kind: workflow
trigger:
  kind: OnConversationStart
  id: main_trigger
  actions:
    - kind: SetVariable
      id: init_state
      variable: Local.MyVar
      value: "initial value"
    # ... more actions

name: MyWorkflowName
```

Key differences from topic YAML:

- Top-level `kind: workflow` (not `kind: AdaptiveDialog`)
- Trigger and actions live under `trigger:`, not `beginDialog:`
- Uses `Local.*` variable scope instead of `Topic.*`
- `name:` appears at the bottom of the file (after all actions)
- No `mcs.metadata`, `modelDescription`, or `triggerQueries`

### InvokeAzureAgent

Calls a child agent (Azure/CPS agent) and captures its response.

```yaml
# Standard call — suppress auto-send, capture messages
- kind: InvokeAzureAgent
  id: call_deepresearch
  agent:
    name: DeepResearch
  input:
    messages: =Local.LatestMessage
  output:
    autoSend: false
    messages: Local.LatestMessage
```

**Key properties:**

| Property          | Required | Description                                                                                       |
| ----------------- | -------- | ------------------------------------------------------------------------------------------------- |
| `agent.name`      | Yes      | Name of the child agent to invoke                                                                 |
| `input.messages`  | Yes      | Message(s) to send — typically a `=UserMessage(...)` expression or a variable containing messages |
| `output.autoSend` | No       | `false` = suppress automatic display to user. `true` (default) = agent response shown immediately |
| `output.messages` | Yes      | Variable to store the agent's response messages                                                   |
| `conversationId`  | No       | Pass `=System.ConversationId` to share conversation context                                       |

**autoSend patterns:**

```yaml
# Suppress output — process it before showing to user
output:
  autoSend: false
  messages: Local.LatestMessage

# Auto-send to user (default) — used for final presentation
output:
  messages: Local.LatestMessage
```

**Extracting text from agent response:**

```yaml
# After InvokeAzureAgent, extract the last message text
- kind: SetVariable
  id: store_result
  variable: Local.FinalResearch
  value: =Last(Local.LatestMessage).Text
```

`Last(Local.LatestMessage).Text` gets the text content of the most recent message in the message array. This is the standard pattern for extracting an agent's response.

### UserMessage()

Constructs a user message object for passing to agents. Used to build or rebuild context before calling an agent.

```yaml
# Simple — wrap user's last text input
value: =UserMessage(System.LastMessageText)

# Composed — build context from multiple variables
value: =UserMessage(Concatenate("PREVIOUS RESEARCH:\n\n", Local.FinalResearch, "\n\n--- FEEDBACK ---\n", Local.ReviewFeedback))
```

### GotoAction

Jumps to another action by its `id`. Enables loops and conditional branching within a workflow.

```yaml
- kind: GotoAction
  id: goto_loop_start
  actionId: check_review_mode
```

**Critical rules:**

- `actionId` must reference a valid `id` on another action in the same workflow
- Creates loops when jumping backward (e.g., iteration loops, retry patterns)
- No protection against infinite loops — always pair with an iteration counter and max-iteration check

**Loop pattern (iteration with max):**

```yaml
# Increment iteration counter
- kind: SetVariable
  id: inc_iteration
  variable: Local.TotalIteration
  value: =Local.TotalIteration+1

# Jump back to loop start
- kind: GotoAction
  id: goto_loop
  actionId: check_review_mode
```

### ConditionGroup

Multi-branch conditional. Evaluates conditions in order — first match wins. Optional `elseActions` for the fallback path.

```yaml
- kind: ConditionGroup
  id: evaluator_decision
  conditions:
    - id: if_complete
      condition: =!IsBlank(Find("COMPLETE", Upper(Last(Local.EvaluatorMessages).Text)))
      actions:
        - kind: GotoAction
          id: goto_presenter
          actionId: call_boardpresenter
    - id: if_max_iterations
      condition: =Local.TotalIteration = 4
      actions:
        - kind: GotoAction
          id: goto_presenter_max
          actionId: call_boardpresenter
    - id: if_can_continue
      condition: =Local.TotalIteration < 4
      actions:
        - kind: SetVariable
          id: inc_iteration
          variable: Local.TotalIteration
          value: =Local.TotalIteration+1
        - kind: GotoAction
          id: goto_loop
          actionId: check_review_mode
  elseActions:
    - kind: GotoAction
      id: goto_fallback
      actionId: call_boardpresenter
```

**Condition patterns:**

```yaml
# Check if variable is blank
condition: =IsBlank(Local.MyVar)
condition: =!IsBlank(Local.MyVar)

# String contains (case-insensitive via Upper)
condition: =!IsBlank(Find("COMPLETE", Upper(Last(Local.EvaluatorMessages).Text)))
condition: =!IsBlank(Find("DONE", Upper(Local.UserFeedbackText)))

# Numeric comparison
condition: =Local.TotalIteration = 4
condition: =Local.TotalIteration < 4
condition: =Local.RefinerIteration = 3
```

**Nesting:** ConditionGroups can be nested inside other ConditionGroup's `actions` or `elseActions`.

### Question

Prompts the user for input and stores the response in a variable.

```yaml
- kind: Question
  id: ask_user_feedback
  variable: Local.UserFeedbackText
  entity: StringPrebuiltEntity
  skipQuestionMode: SkipOnFirstExecutionIfVariableHasValue
  prompt: "Would you like to refine this research? Type 'done' to finish."
```

| Property           | Description                                                                                   |
| ------------------ | --------------------------------------------------------------------------------------------- |
| `variable`         | Where to store the user's response                                                            |
| `entity`           | Entity type for parsing — `StringPrebuiltEntity` for free text                                |
| `skipQuestionMode` | `SkipOnFirstExecutionIfVariableHasValue` = skip if variable already has a value on first pass |
| `prompt`           | The text shown to the user                                                                    |

### SendActivity (in workflows)

```yaml
# Variable interpolation with curly braces
- kind: SendActivity
  id: send_output
  activity: "{Local.FinalResearch}"

# Static text
- kind: SendActivity
  id: send_notice
  activity: "Conducting fresh research based on your feedback..."

# Markdown in prompts
- kind: SendActivity
  id: send_formatted
  activity: "---\n\n**Would you like to refine?**\nType 'done' to finish."
```

**Variable interpolation:** Use `{Local.VarName}` inside the activity string to inject variable values. This is different from Power Fx expressions — no `=` prefix, just curly braces.

---

## Workflow Patterns

### Sequential Agent Pipeline

Call agents in order, passing output of each to the next:

```yaml
# Agent A
- kind: InvokeAzureAgent
  id: call_agent_a
  agent:
    name: AgentA
  input:
    messages: =Local.LatestMessage
  output:
    autoSend: false
    messages: Local.LatestMessage

# Store A's output
- kind: SetVariable
  id: store_a_output
  variable: Local.ResultA
  value: =Last(Local.LatestMessage).Text

# Agent B receives A's output
- kind: InvokeAzureAgent
  id: call_agent_b
  agent:
    name: AgentB
  input:
    messages: =Local.LatestMessage
  output:
    autoSend: false
    messages: Local.LatestMessage
```

### Iterative Refinement Loop

Loop through review agents with an evaluator deciding when to stop:

```yaml
# Initialize
- kind: SetVariable
  id: init_iteration
  variable: Local.TotalIteration
  value: 1

# --- LOOP START (GotoAction target) ---
- kind: InvokeAzureAgent
  id: call_reviewer
  agent:
    name: Reviewer
  input:
    messages: =Local.LatestMessage
  output:
    autoSend: false
    messages: Local.LatestMessage

- kind: InvokeAzureAgent
  id: call_evaluator
  agent:
    name: Evaluator
  input:
    messages: =Local.EvaluatorInput
  output:
    autoSend: false
    messages: Local.EvaluatorMessages

# Decision: continue or stop
- kind: ConditionGroup
  id: eval_decision
  conditions:
    - id: if_complete
      condition: =!IsBlank(Find("COMPLETE", Upper(Last(Local.EvaluatorMessages).Text)))
      actions:
        - kind: GotoAction
          id: goto_done
          actionId: final_output
    - id: if_max
      condition: =Local.TotalIteration = 4
      actions:
        - kind: GotoAction
          id: goto_done_max
          actionId: final_output
    - id: if_continue
      condition: =Local.TotalIteration < 4
      actions:
        - kind: SetVariable
          id: inc
          variable: Local.TotalIteration
          value: =Local.TotalIteration+1
        - kind: GotoAction
          id: goto_loop
          actionId: call_reviewer
```

### Accumulating Feedback Across Agents

Collect feedback from multiple review agents into a single variable:

```yaml
# After first reviewer
- kind: SetVariable
  id: store_bias_feedback
  variable: Local.ReviewFeedback
  value: '=Concatenate("BIASCHECK: ", Last(Local.LatestMessage).Text)'

# After second reviewer — append with separator
- kind: SetVariable
  id: store_drift_feedback
  variable: Local.ReviewFeedback
  value: '=Concatenate(Local.ReviewFeedback, " | DATADRIFT: ", Last(Local.LatestMessage).Text)'

# After third reviewer — append again
- kind: SetVariable
  id: store_quality_feedback
  variable: Local.ReviewFeedback
  value: '=Concatenate(Local.ReviewFeedback, " | QUALITYREVIEW: ", Last(Local.LatestMessage).Text)'
```

### User Feedback Loop

Ask the user for input, then branch on their response:

```yaml
- kind: Question
  id: ask_feedback
  variable: Local.UserFeedbackText
  entity: StringPrebuiltEntity
  prompt: "Type 'done' to finish, or provide feedback to continue."

- kind: ConditionGroup
  id: feedback_check
  conditions:
    - id: if_done
      condition: =!IsBlank(Find("DONE", Upper(Local.UserFeedbackText)))
      actions:
        - kind: SendActivity
          id: send_done
          activity: "Complete. Thank you."
  elseActions:
    - kind: SetVariable
      id: store_feedback
      variable: Local.CurrentFeedback
      value: =Local.UserFeedbackText
    - kind: SetVariable
      id: reset_feedback_var
      variable: Local.UserFeedbackText
      value: ""
    - kind: GotoAction
      id: goto_refine
      actionId: call_refiner
```

### Targeted Review with Evaluator Context

On iteration 2+, prepend evaluator feedback to focus review agents on specific issues:

```yaml
- kind: ConditionGroup
  id: check_review_mode
  conditions:
    - id: if_targeted
      condition: =!IsBlank(Local.EvaluatorText)
      actions:
        - kind: SetVariable
          id: build_targeted_input
          variable: Local.LatestMessage
          value: =UserMessage(Concatenate("TARGETED REVIEW MODE — Iteration ", Text(Local.TotalIteration), " of 4\n\nEVALUATOR FEEDBACK:\n", Local.EvaluatorText, "\n\n--- RESEARCH CONTENT ---\n\n", Local.FinalResearch))
```

### Clarification Sub-Loop (Bounded)

Allow an agent to ask clarifying questions with a max round limit and forced decision fallback:

```yaml
# Initialize clarification counter
- kind: SetVariable
  id: reset_refiner_iteration
  variable: Local.RefinerIteration
  value: 1

# Call agent
- kind: InvokeAzureAgent
  id: call_refiner
  agent:
    name: PromptRefiner
  input:
    messages: =Local.LatestMessage
  output:
    autoSend: false
    messages: Local.LatestMessage

# Check if agent made a decision or is asking questions
- kind: ConditionGroup
  id: refiner_check
  conditions:
    - id: if_decided
      condition: =!IsBlank(Find("FULL_RESEARCH", Upper(Local.RefinerText)))
      actions:
        # Route to full research
        - kind: GotoAction
          id: goto_research
          actionId: call_deepresearch
  elseActions:
    # Agent asking questions — check if max rounds reached
    - kind: ConditionGroup
      id: max_check
      conditions:
        - id: if_at_max
          condition: =Local.RefinerIteration = 3
          actions:
            # Force decision on next call
            - kind: SetVariable
              id: force_decision_input
              variable: Local.LatestMessage
              value: '=UserMessage(Concatenate("FINAL ROUND - You MUST now provide your routing decision. Do not ask further questions.\n\n", Local.CurrentFeedback))'
            - kind: SetVariable
              id: inc_forced
              variable: Local.RefinerIteration
              value: =Local.RefinerIteration+1
            - kind: GotoAction
              id: goto_forced
              actionId: call_refiner
      elseActions:
        # Show questions, get answers, loop back
        - kind: SendActivity
          id: show_questions
          activity: "{Local.RefinerText}"
        - kind: Question
          id: ask_clarification
          variable: Local.UserClarification
          entity: StringPrebuiltEntity
          prompt: "Please provide your answers:"
        - kind: SetVariable
          id: append_context
          variable: Local.CurrentFeedback
          value: =Concatenate(Local.CurrentFeedback, "\n\nASKED:\n", Local.RefinerText, "\n\nANSWERED:\n", Local.UserClarification)
        - kind: SetVariable
          id: inc_refiner
          variable: Local.RefinerIteration
          value: =Local.RefinerIteration+1
        - kind: GotoAction
          id: goto_refiner_loop
          actionId: call_refiner
```

---

## Workflow vs Topic: When to Use Which

| Use Case                           | Use Topic          | Use Workflow |
| ---------------------------------- | ------------------ | ------------ |
| Single intent with tool calls      | Yes                | No           |
| Generative orchestration routing   | Yes                | No           |
| Fixed multi-agent pipeline         | No                 | Yes          |
| Iterative loops with evaluator     | No                 | Yes          |
| User feedback loops with branching | Possible (fragile) | Yes          |
| Bounded clarification sub-loops    | No                 | Yes          |
| Deterministic control flow         | No                 | Yes          |

Workflows give you explicit control flow (sequential execution, `GotoAction` loops, nested `ConditionGroup` branching) that is impossible to achieve reliably with generative orchestration's AI-driven routing. Use workflows when the execution order matters and you need guaranteed loop termination.

---

## General Learnings

- Descriptions drive routing in generative orchestration, not trigger phrases. Always write specific descriptions with explicit inclusions and exclusions.

- The `predictionOutput` binding is the only reliable output binding for `InvokeAIBuilderModelAction`. Named output bindings require portal-side metadata refresh (delete and re-add the action node) and are fragile.

- To extract structured data from a prompt tool, have the prompt return JSON as its text response, capture it via `predictionOutput`, then use the `JSON() -> ParseJSON() -> .property -> Text()` chain to extract fields.

- `Topic.PredictionOutput` is typed as a Record in Power Fx, not Text. You cannot call `Text()` or `ParseJSON()` directly on it. You must serialize it first with `JSON()`.

- Power Fx expressions in YAML are prefixed with `=`. Variable assignment targets (e.g. in output bindings) are NOT prefixed with `=`.

- Input binding parameter names must exactly match the parameter names defined in the prompt tool. If the prompt tool requires inputs, every topic that calls it must supply them - `input: {}` will produce compile errors.

- When a prompt tool's input/output schema changes, existing action nodes in topics become stale. Input bindings can sometimes be updated locally. Output bindings typically require deleting and re-adding the action node in the portal, then syncing the YAML.

- Removing an action node from a topic (and handling the logic differently) is a valid workaround when you cannot satisfy the action's required inputs in a particular topic context.

- Large string values (like full HTML documents) work as single-line quoted YAML strings with Unicode escapes, but they make files very large and hard to maintain. Consider referencing shared state via Global variables set once in one topic rather than duplicating across multiple topics.

- CPS compile errors appear in VS Code via the CPS extension's diagnostics. Always check errors after editing YAML - the error messages are generally accurate and point to the exact line.

- The CPS YAML export is the source of truth for what field names and structures are valid. When in doubt, make changes in the portal, sync, and inspect the generated YAML to learn the correct syntax.
