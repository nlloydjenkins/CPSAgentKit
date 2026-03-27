# Copilot Studio YAML Syntax Reference

Verified syntax patterns from hands-on editing of exported CPS agent components.

---

## Topic File Structure

```yaml
mcs.metadata:
  componentName: TopicName
  description: Description used by orchestrator for routing.
kind: AdaptiveDialog
modelDescription: Description for generative orchestration routing. More important than triggerQueries.
beginDialog:
  kind: OnRecognizedIntent       # or OnConversationStart, OnSystemRedirect
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

# System - built-in read-only variables
value: =System.Activity.Text
```

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
