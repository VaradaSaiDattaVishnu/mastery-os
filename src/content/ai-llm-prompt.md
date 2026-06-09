The model doesn't understand intent — it continues a pattern. The system prompt, examples, and output format are the pattern you impose.

## The core

**System prompt.** The system message establishes persona, constraints, and context before the user ever speaks. It's the highest-authority text in the conversation; models are trained to give it more weight. Keep it concise and factual — verbose system prompts dilute signal.

**Few-shot examples.** Showing input→output pairs before the real query is far more reliable than describing the format in prose. Three examples beat three paragraphs of instruction because the model is a pattern-matcher, and examples are the pattern.

**Structured output.** Instruct the model to respond in JSON (or XML) and parse it programmatically. Most providers offer a `response_format: { type: "json_object" }` flag that forces well-formed JSON, or you can use tool-calling with a schema as a zero-hallucination structure enforcer.

**Guardrails.** Hard constraints belong in the system prompt, not in user messages the model might override. Role-playing injection ("ignore previous instructions") is less effective against a well-structured system prompt with explicit boundaries.

```python
from groq import Groq
import json

client = Groq()

SYSTEM = """You are JARVIS, a voice assistant. Respond with JSON only.
Schema: {"intent": string, "entities": object, "confidence": float}
Rules:
- intent must be one of: ["weather", "reminder", "search", "unknown"]
- confidence is 0.0–1.0
- never add prose outside the JSON object"""

FEW_SHOT = [
    {"role": "user", "content": "What's the weather in Hyderabad tomorrow?"},
    {"role": "assistant", "content": '{"intent":"weather","entities":{"city":"Hyderabad","when":"tomorrow"},"confidence":0.97}'},
    {"role": "user", "content": "Remind me to call mom at 6pm"},
    {"role": "assistant", "content": '{"intent":"reminder","entities":{"task":"call mom","time":"18:00"},"confidence":0.95}'},
]

def classify(user_input: str) -> dict:
    messages = [{"role": "system", "content": SYSTEM}] + FEW_SHOT
    messages.append({"role": "user", "content": user_input})
    resp = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=messages,
        temperature=0.0,
        response_format={"type": "json_object"},
    )
    return json.loads(resp.choices[0].message.content)

result = classify("Set an alarm for 7am")
print(result)  # {"intent": "reminder", "entities": {...}, "confidence": 0.91}
```

## In your project

JARVIS's ~20-tool loop depends on the model outputting a valid tool call schema. A well-structured system prompt that lists available tools with their signatures and constraints is what makes the model reliably emit a `tool_calls` array rather than prose. Without it, tool selection degrades under multi-turn pressure.

## Tradeoffs & pitfalls

- **Prompt injection.** User-supplied content can attempt to override system instructions. Sanitize or escape user data before interpolating it into prompts. Never trust user messages to stay in their lane.
- **Over-long system prompts.** Past ~2k tokens, instructions start competing with each other. A focused 400-token system prompt outperforms a 4k manifesto.
- **Few-shot label bias.** If your examples all have "confidence > 0.9", the model will skew high across the board. Balance your examples to cover the full output range.
- **JSON parsing failures.** Even with `json_object` mode, always wrap `json.loads()` in a try/except and have a fallback parse or retry.

## Top-1% insight

The most powerful prompting lever isn't wording — it's **position**. Models exhibit recency bias: instructions at the end of the system prompt or at the start of the final user message carry disproportionate weight compared to instructions buried in the middle. In a long multi-turn JARVIS conversation, restating the core constraint ("respond only with a tool call or a final answer, never both simultaneously") as a user-turn reminder just before the model responds is worth 10x more than writing it eloquently in the system prompt and hoping it persists.
