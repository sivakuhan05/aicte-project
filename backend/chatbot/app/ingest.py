import os
import shutil
from datetime import datetime
from pathlib import Path

from dotenv import load_dotenv
from llama_index.core import Document, Settings, VectorStoreIndex
from llama_index.embeddings.huggingface import HuggingFaceEmbedding
from pymongo import MongoClient

CHATBOT_ROOT = Path(__file__).resolve().parent.parent
REPO_ROOT = CHATBOT_ROOT.parent.parent
STORAGE_DIR = CHATBOT_ROOT / "storage"

# Set embedding model
Settings.embed_model = HuggingFaceEmbedding(model_name="BAAI/bge-small-en")

# MongoDB connection
load_dotenv(REPO_ROOT / ".env")
MONGO_URI = os.getenv("MONGO_URI") or os.getenv("MONGO_UR")
if not MONGO_URI:
    raise ValueError("MONGO_URI or MONGO_UR not set in .env file")
DB_NAME = os.getenv("DB_NAME") or os.getenv("MONGO_DB_NAME") or "eventverse"
COLLECTION_NAME = os.getenv("COLLECTION_NAME") or "events"


def load_events_from_mongo():
    client = MongoClient(MONGO_URI)
    db = client[DB_NAME]
    collection = db[COLLECTION_NAME]

    docs = list(collection.find({
        "approvalStatus": "approved"
    }))

    documents = []

    for doc in docs:
        event_date = doc.get("eventDate")

        if event_date:
            formatted_date = event_date.strftime("%B %d, %Y")
            is_past = event_date < datetime.now()
        else:
            formatted_date = "Unknown"
            is_past = False

        status = "Past Event" if is_past else "Upcoming Event"

        text = f"""
Event: {doc.get('eventName')}
Category: {doc.get('category')}
Date: {formatted_date}
Status: {status}
Location: {doc.get('eventLocation')}
Organizer: {doc.get('organizerUsername')}
Club: {doc.get('clubAssociation')}
Description: {doc.get('eventDescription')}
"""

        documents.append(Document(text=text))

    return documents


def build_storage_from_mongo():
    documents = load_events_from_mongo()
    if STORAGE_DIR.exists():
        shutil.rmtree(STORAGE_DIR)
    index = VectorStoreIndex.from_documents(documents)
    index.storage_context.persist(persist_dir=str(STORAGE_DIR))
    return len(documents)


if __name__ == "__main__":
    print("Fetching events from MongoDB...")
    document_count = build_storage_from_mongo()
    print(f"Loaded {document_count} events")

    print(f"Index created and saved to {STORAGE_DIR}/")
