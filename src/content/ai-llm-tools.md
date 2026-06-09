The agent loop is not magic — it's a `while` loop: model emits a tool call, your code runs it, you append the result as a new message, the model sees it and decides what to do next.

## The core

**Tool schema.** You describe tools in JSON Schema (OpenAI function-calling format). The model never actually calls your code — it emits a structured object (`tool_calls[i].function.name` + `arguments`) and you run the actual function. This is a critical distinction: the model is producing structured text, not executing anything.

**The loop.** The canonical agentic loop:
1. Append the current user message to conversation history.
2. Call the model. If `finish_reason == "tool_calls"`, execute each tool.
3. Append `role: "tool"` results back to history.
4. Call the model again. Repeat until `finish_reason == "stop"`.

**Recovery.** Tools fail. A tool result should always include a `status` field. If a tool fails, append the error as the tool result and let the model decide to retry, use a fallback, or surface the error to the user. Do not silently swallow failures or the model will hallucinate a result.

**Multi-tool parallelism.** Some models emit multiple tool calls in a single response (parallel function calling). You must run them, collect all results, and append them all before calling the model again.

```python
import json
from groq import Groq

client = Groq()

# Tool definitions (schema only — model never touches Python)
TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "get_weather",
            "description": "Get current weather for a city.",
            "parameters": {
                "type": "object",
                "properties": {
                    "city": {"type": "string", "description": "City name"},
                },
                "required": ["city"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "set_reminder",
            "description": "Set a reminder.",
            "parameters": {
                "type": "object",
                "properties": {
                    "task": {"type": "string"},
                    "iso_time": {"type": "string"},
                },
                "required": ["task", "iso_time"],
            },
        },
    },
]

def run_tool(name: str, args: dict) -> str:
    """Dispatch to real implementations."""
    if name == "get_weather":
        return json.dumps({"city": args["city"], "temp_c": 31, "condition": "sunny"})
    if name == "set_reminder":
        return json.dumps({"status": "ok", "reminder_id": "rem_42"})
    return json.dumps({"error": f"unknown tool: {name}"})

def agent(user_input: str) -> str:
    history = [
        {"role": "system", "content": "You are JARVIS, a helpful voice assistant."},
        {"role": "user", "content": user_input},
    ]
    for _ in range(10):  # max iterations — safety valve
        resp = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=history,
            tools=TOOLS,
            tool_choice="auto",
        )
        msg = resp.choices[0].message
        history.append(msg)  # always append the assistant turn

        if resp.choices[0].finish_reason == "stop":
            return msg.content

        # Execute all tool calls in this turn
        for tc in msg.tool_calls or []:
            result = run_tool(tc.function.name, json.loads(tc.function.arguments))
            history.append({
                "role": "tool",
                "tool_call_id": tc.id,
                "content": result,
            })

    return "Agent hit iteration limit."

print(agent("What's the weather in Hyderabad and remind me to take umbrella at 8am"))
```

## In your project

JARVIS runs ~20 tools: weather, reminders, web search, calendar, code execution, TTS, file operations, and more. Each is a JSON schema + a Python/Node function. The 10-iteration cap is a production guard — without it, a confused model can loop indefinitely, burning API quota.

## Tradeoffs & pitfalls

- **Appending raw `msg` objects.** Always append the full assistant message object (including `tool_calls`) before appending tool results — providers require the conversation to be coherent or will return a 400.
- **Argument hallucination.** The model can produce plausible-but-invalid arguments (e.g., a date format your API doesn't accept). Validate args before calling external services.
- **Unbounded loops.** Without a max-iteration guard, a model that can't resolve a task will loop until context fills or budget runs out.
- **Tool result size.** A tool that returns 50KB of JSON will consume thousands of tokens. Truncate or summarise tool outputs before appending them.

## Top-1% insight

The model's "reasoning" about which tool to call is entirely a function of the tool descriptions — not the names. A vague description like `"search"` gives the model nothing to disambiguate. Write tool descriptions as if you're writing them for a junior developer who has no other documentation: include what the tool does, what it does not do, expected input format, and when to prefer it over similar tools. The ~20-tool JARVIS setup only works reliably because each tool schema is precisely scoped.
