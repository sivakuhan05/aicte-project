from __future__ import annotations

import os
import re
from datetime import datetime
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, List, Optional

from dotenv import load_dotenv
from llama_index.core import Settings, StorageContext, load_index_from_storage
from llama_index.embeddings.huggingface import HuggingFaceEmbedding
from llama_index.llms.ollama import Ollama
from pymongo import MongoClient

CHATBOT_ROOT = Path(__file__).resolve().parent.parent
REPO_ROOT = CHATBOT_ROOT.parent.parent
STORAGE_DIR = CHATBOT_ROOT / "storage"

load_dotenv(REPO_ROOT / ".env")

DEFAULT_MODEL = os.getenv("CHATBOT_MODEL", "llama3")
MONGO_URI = os.getenv("MONGO_URI") or os.getenv("MONGO_UR") or ""
DB_NAME = os.getenv("DB_NAME") or os.getenv("MONGO_DB_NAME") or "eventverse"
EVENTS_COLLECTION = os.getenv("COLLECTION_NAME") or "events"
USERS_COLLECTION = os.getenv("CHATBOT_USERS_COLLECTION") or "users"
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
COUNT_WORDS = {
    "one": 1,
    "two": 2,
    "three": 3,
    "four": 4,
    "five": 5,
}
UPCOMING_QUERY_KEYWORDS = {"next", "closest", "soonest", "upcoming", "nearest"}
DEPARTMENT_ALIASES = {
    "cse": "CSE",
    "computer science": "CSE",
    "computer science and engineering": "CSE",
    "it": "IT",
    "information technology": "IT",
    "mech": "MECH",
    "mechanical": "MECH",
    "mechanical engineering": "MECH",
    "ece": "ECE",
    "electronics": "ECE",
    "electronics and communication": "ECE",
    "electronics and communication engineering": "ECE",
    "aiml": "AIML",
    "ai ml": "AIML",
    "ai and ml": "AIML",
    "artificial intelligence and machine learning": "AIML",
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


def normalize_department(value: Any) -> str:
    cleaned = str(value or "").strip()
    if not cleaned:
        return ""

    lowered = cleaned.lower().replace("&", " and ").replace("/", " ").replace("-", " ")
    lowered = re.sub(r"\s+", " ", lowered).strip()
    return DEPARTMENT_ALIASES.get(lowered, cleaned.upper())


def parse_event_datetime(value: Any) -> Optional[datetime]:
    if isinstance(value, datetime):
        return value
    if isinstance(value, str):
        try:
            normalized = value.replace("Z", "+00:00") if value.endswith("Z") else value
            return datetime.fromisoformat(normalized)
        except Exception:
            return None
    return None


def wants_ordered_upcoming_events(question: str) -> bool:
    lowered = question.lower()
    return "event" in lowered and any(keyword in lowered for keyword in UPCOMING_QUERY_KEYWORDS)


def parse_requested_count(question: str) -> int:
    lowered = question.lower()
    digit_match = re.search(r"\b(\d+)\b", lowered)
    if digit_match:
        return max(1, min(int(digit_match.group(1)), 5))

    for word, count in COUNT_WORDS.items():
        if re.search(rf"\b{word}\b", lowered):
            return count

    if "next event" in lowered or "closest event" in lowered or "soonest event" in lowered:
        return 1
    return 3


def get_mongo_db():
    if not MONGO_URI:
        return None
    client = MongoClient(MONGO_URI)
    return client[DB_NAME]


def get_student_department(user_email: Optional[str]) -> str:
    mongo_db = get_mongo_db()
    if mongo_db is None or not user_email:
        return ""

    user_doc = mongo_db[USERS_COLLECTION].find_one({"email": str(user_email).strip().lower()})
    if not user_doc:
        return ""
    return normalize_department(user_doc.get("department"))


def event_visible_to_student(event_doc: Dict[str, Any], student_department: str) -> bool:
    access_scope = str(event_doc.get("accessScope") or "all").strip().lower()
    allowed_departments = [
        normalize_department(value)
        for value in (event_doc.get("allowedDepartments") or [])
        if normalize_department(value)
    ]
    if access_scope != "department" or not allowed_departments:
        return True
    return bool(student_department and student_department in allowed_departments)


def fetch_sorted_upcoming_events(count: int, user_email: Optional[str]) -> List[Dict[str, Any]]:
    mongo_db = get_mongo_db()
    if mongo_db is None:
        return []

    student_department = get_student_department(user_email)
    now = datetime.now()
    docs = list(mongo_db[EVENTS_COLLECTION].find({"approvalStatus": "approved"}))

    upcoming: List[Dict[str, Any]] = []
    for doc in docs:
        event_date = parse_event_datetime(doc.get("eventDate"))
        if not event_date or event_date < now:
            continue
        if not event_visible_to_student(doc, student_department):
            continue
        doc["_parsedEventDate"] = event_date
        upcoming.append(doc)

    upcoming.sort(key=lambda doc: doc["_parsedEventDate"])
    return upcoming[:count]


def format_sorted_upcoming_events_response(events: List[Dict[str, Any]], detail_mode: bool) -> str:
    if not events:
        return "There are currently no upcoming events matching that request."

    if len(events) == 1:
        event = events[0]
        when = event["_parsedEventDate"].strftime("%b %d, %Y at %I:%M %p")
        location = str(event.get("eventLocation") or "Location pending").strip()
        response = f"The next upcoming event is {event.get('eventName')} on {when} at {location}."
        if detail_mode:
            description = str(event.get("eventDescription") or "").strip()
            if description:
                response += f" It is about {description}"
        return response

    segments = []
    for index, event in enumerate(events, start=1):
        when = event["_parsedEventDate"].strftime("%b %d, %Y at %I:%M %p")
        location = str(event.get("eventLocation") or "Location pending").strip()
        segments.append(f"{index}. {event.get('eventName')} on {when} at {location}")

    intro = f"The next {len(events)} upcoming events are:"
    return intro + " " + " ".join(segments)


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


def refresh_chatbot_index() -> None:
    try:
        from backend.chatbot.app.ingest import build_storage_from_mongo
    except ModuleNotFoundError:
        from chatbot.app.ingest import build_storage_from_mongo

    build_storage_from_mongo()
    get_chatbot.cache_clear()
    get_chatbot()


def ask_chatbot(
    question: str,
    history: Optional[List[Dict[str, Any]]] = None,
    user_email: Optional[str] = None,
) -> str:
    cleaned_question = str(question or "").strip()
    if wants_ordered_upcoming_events(cleaned_question):
        detail_mode = wants_detailed_answer(cleaned_question)
        requested_count = parse_requested_count(cleaned_question)
        direct_events = fetch_sorted_upcoming_events(requested_count, user_email)
        return format_sorted_upcoming_events_response(direct_events, detail_mode)

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
