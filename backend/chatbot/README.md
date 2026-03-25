# College AI Assistant

Local RAG chatbot for answering college event queries using a local LLM and MongoDB.

---

## Features

* Local LLM using Llama3 via Ollama
* Retrieval-Augmented Generation (RAG)
* MongoDB Atlas integration (events collection)
* Semantic search using embeddings (HuggingFace)
* Conditional RAG (uses data only when needed)
* Streaming responses

---

## Setup

### 1. Install Python

Ensure Python 3.10+ is installed.

---

### 2. Install Ollama

Linux:
```
curl -fsSL https://ollama.com/install.sh | sh
```

Windows:
```
irm https://ollama.com/install.ps1 | iex
```

---

### 3. Use the backend virtual environment

```
cd /home/sivakuhan/Projects/aicte-project
source backend/venv/bin/activate
```

---

### 4. Install dependencies

```bash
pip install -r backend/requirements.txt
pip install -r backend/chatbot/chatbot-requirements.txt
```

---

### 5. Download the Llama3 model

```
ollama run llama3
```

(First run downloads the model. Exit with `/bye` once done.)

---

## Environment Variables

Use the repo root `.env` file:

```
MONGO_URI=your_mongodb_uri
DB_NAME=your_database_name
COLLECTION_NAME=your_collection_name
```

---

## Build the knowledge base

Fetch events from MongoDB and generate the vector index:

```bash
cd backend/chatbot
python app/ingest.py
```

---

## Run the chatbot

```bash
cd backend/chatbot
python app/chatbot.py
```

---

## Example queries

```
Are there any upcoming events?
What tech events are there?
Where is Codex happening?
```

---

## Behavior

* Uses MongoDB (events collection) as the data source
* Uses RAG only for relevant queries
* Handles general chat without retrieval
* Distinguishes between upcoming and past events
* Lists upcoming events when available

---

## Project Structure

```text
backend/chatbot/
├── app/
│   ├── chatbot.py
│   ├── ingest.py
│   └── server.py
├── chatbot-requirements.txt
├── README.md
└── storage/        # generated vector index, ignored by git
```

---

## Notes

* `storage/` is generated automatically and should not be committed
* Model runs locally; CPU usage may spike during responses
