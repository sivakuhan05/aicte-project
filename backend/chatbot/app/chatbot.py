from __future__ import annotations

import os
from datetime import datetime
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, List, Optional

from dotenv import load_dotenv
from llama_index.core import Settings, StorageContext, load_index_from_storage
from llama_index.embeddings.huggingface import HuggingFaceEmbedding
from llama_index.llms.ollama import Ollama

CHATBOT_ROOT = Path(__file__).resolve().parent.parent
REPO_ROOT = CHATBOT_ROOT.parent.parent
STORAGE_DIR = CHATBOT_ROOT / "storage"

load_dotenv(REPO_ROOT / ".env")

DEFAULT_MODEL = os.getenv("CHATBOT_MODEL", "llama3")
RAG_KEYWORDS = {"exam", "event", "events", "hackathon", "fest", "schedule", "date", "club", "location"}
DETAIL_KEYWORDS = {
    "detail",
    "details",
    "detailed",
    "explain",
    "explanation",
    "elaborate",
    "full",
    "fully",
    "more info",
    "more information",
    "tell me more",
    "in depth",
    "step by step",
    "complete list",
    "all of them",
}


def normalize_history(history: Optional[List[Dict[str, Any]]]) -> List[Dict[str, str]]:
    normalized: List[Dict[str, str]] = []
    for item in history or []:
        if not isinstance(item, dict):
            continue

        role = str(item.get("role") or "").strip().lower()
        content = str(item.get("content") or "").strip()
        if role not in {"user", "assistant"} or not content:
            continue

        normalized.append({"role": role, "content": content})
    return normalized[-8:]


def format_history(history: List[Dict[str, str]]) -> str:
    if not history:
        return "No prior conversation."

    lines = []
    for item in history:
        speaker = "User" if item["role"] == "user" else "Assistant"
        lines.append(f"{speaker}: {item['content']}")
    return "\n".join(lines)


def should_use_rag(question: str) -> bool:
    lowered = question.lower()
    return any(keyword in lowered for keyword in RAG_KEYWORDS)


def wants_detailed_answer(question: str) -> bool:
    lowered = question.lower()
    return any(keyword in lowered for keyword in DETAIL_KEYWORDS)


class EventChatbot:
    def __init__(self) -> None:
        if not STORAGE_DIR.exists():
            try:
                from backend.chatbot.app.ingest import build_storage_from_mongo
            except ModuleNotFoundError:
                from chatbot.app.ingest import build_storage_from_mongo

            build_storage_from_mongo()

        Settings.embed_model = HuggingFaceEmbedding(model_name="BAAI/bge-small-en")
        self.llm = Ollama(model=DEFAULT_MODEL)
        Settings.llm = self.llm

        storage_context = StorageContext.from_defaults(persist_dir=str(STORAGE_DIR))
        self.index = load_index_from_storage(storage_context)
        self.query_engine = self.index.as_query_engine(similarity_top_k=3, streaming=False)

    def ask(
        self,
        question: str,
        history: Optional[List[Dict[str, Any]]] = None,
        user_email: Optional[str] = None,
    ) -> str:
        cleaned_question = str(question or "").strip()
        if not cleaned_question:
            raise ValueError("Question is required.")

        normalized_history = normalize_history(history)
        history_text = format_history(normalized_history)
        today = datetime.now().strftime("%B %d, %Y")
        user_context = f"Authenticated student email: {user_email}." if user_email else "No authenticated user context."
        detail_mode = wants_detailed_answer(cleaned_question)

        brevity_instruction = (
            "Keep the answer concise but not blunt. Use 2 to 4 sentences by default, and only mention the most relevant details."
            if not detail_mode
            else "The user asked for more detail, so give a fuller answer with clear specifics and helpful context."
        )

        if should_use_rag(cleaned_question):
            prompt = f"""
You are a college assistant chatbot for an event platform.

Today's date is {today}.
{user_context}

Conversation so far:
{history_text}

Answer in a warm, natural tone.
{brevity_instruction}
Use the retrieved event data when it is relevant.
Only consider events marked as "Upcoming Event".
Ignore events marked as "Past Event".

If there are upcoming events, mention the relevant ones with event name, date, and location.
Do not add hype, filler, or over-explaining unless the user explicitly asked for details.
If there are no matching upcoming events, say there are currently no upcoming events matching the request.

Question: {cleaned_question}
"""
            response = self.query_engine.query(prompt)
            text = str(getattr(response, "response", "") or str(response)).strip()
            return text or "There are currently no upcoming events."

        prompt = f"""
You are a college assistant chatbot for an event platform.

Today's date is {today}.
{user_context}

Conversation so far:
{history_text}

Answer naturally and helpfully.
{brevity_instruction}
If the user asks about platform events, schedules, clubs, or registrations, help clearly.
Do not ramble unless the user explicitly asks for a detailed answer.

User: {cleaned_question}
Assistant:
"""
        completion = self.llm.complete(prompt)
        return str(getattr(completion, "text", "") or completion).strip() or "I am here to help with your event questions."


@lru_cache(maxsize=1)
def get_chatbot() -> EventChatbot:
    return EventChatbot()


def warmup_chatbot() -> None:
    get_chatbot()


def ask_chatbot(
    question: str,
    history: Optional[List[Dict[str, Any]]] = None,
    user_email: Optional[str] = None,
) -> str:
    return get_chatbot().ask(question=question, history=history, user_email=user_email)


def run_cli() -> None:
    print("Loading vector index...")
    chatbot = get_chatbot()
    print("Chatbot ready! Type 'exit' to quit.\n")

    while True:
        question = input("Ask: ").strip()
        if question.lower() in {"exit", "quit", "q"}:
            print("Goodbye!")
            break

        if not question:
            continue

        print("\nBot: ", end="", flush=True)
        print(chatbot.ask(question))
        print()


if __name__ == "__main__":
    run_cli()
