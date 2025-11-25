"""
Quick smoke test for LLM streaming with fallback.

Run this to verify local → OpenAI fallback works:
  python test_streaming_smoke.py
"""

import asyncio
import sys
import os

# Add app to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "app"))

from app.utils.llm_stream import stream_llm_tokens_with_fallback


async def main():
    messages = [
        {"role": "system", "content": "You are a helpful assistant."},
        {"role": "user", "content": "Say hello in exactly 3 words."},
    ]

    print("🔧 Testing LLM streaming with local-first + fallback...\n")
    print("Messages:", messages)
    print("\n--- Streaming tokens ---")

    token_count = 0
    full_response = ""

    try:
        async for event in stream_llm_tokens_with_fallback(
            messages=messages,
            model="gpt-oss:20b",
            temperature=0.2,
            top_p=0.9,
        ):
            if event.get("type") == "token":
                text = event["data"]["text"]
                full_response += text
                print(text, end="", flush=True)
                token_count += 1

        print("\n\n✅ Streaming completed successfully!")
        print(f"📊 Total tokens: {token_count}")
        print(f"📝 Full response: {full_response}")

    except Exception as e:
        print(f"\n\n❌ Streaming failed: {e}")
        raise


if __name__ == "__main__":
    asyncio.run(main())
