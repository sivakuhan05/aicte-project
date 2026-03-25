# EventVerse

EventVerse is a multi-portal college event management app with:

- a student portal for browsing and joining events
- an organizer portal for hosting and managing events
- an admin portal for approvals and club oversight
- a FastAPI backend backed by MongoDB Atlas

## Repo Structure

```text
.
├── backend/              # FastAPI app and Python dependencies
├── frontend/
│   ├── landing/          # Portal selection landing page
│   ├── student/          # Student HTML/CSS/JS pages
│   ├── organizer/        # Organizer HTML/CSS/JS pages
│   ├── admin/            # Admin HTML/CSS/JS pages
│   ├── public/           # Shared password reset / forgot-password pages
│   └── shared/           # Shared styles and scripts (auth/dashboard/sidebar)
├── main.py               # Convenience launcher for the FastAPI app
└── .env                  # Local environment variables (not committed)
```

## Frontend

The frontend is a static multi-page app split by user role:

- `frontend/landing`: entry page that routes users to a portal
- `frontend/student`: student login, signup, dashboard, events, and profile
- `frontend/organizer`: organizer auth, dashboard, hosting, and post-event flows
- `frontend/admin`: admin auth, approvals, dashboard, and club management
- `frontend/public`: shared password reset and recovery screens
- `frontend/shared`: common CSS/JS (auth styles, dashboard styles, sidebar script)

Most pages call the backend directly at `http://localhost:3000`.

## Backend

The backend lives in `backend/main.py` and uses:

- `FastAPI`
- `Motor` for MongoDB
- `bcrypt` for password hashing
- `PyJWT` for tokens

Run it with:

```bash
pip install -r backend/requirements.txt
uvicorn backend.main:app --host 0.0.0.0 --port 3000 --reload
```

If you are also using the RAG chatbot inside `backend/chatbot`, install its extra packages into the same backend virtual environment:

```bash
pip install -r backend/chatbot/chatbot-requirements.txt
```

## Environment

Create a root `.env` file with at least:

```env
MONGO_UR=your_mongodb_connection_string
MONGO_DB_NAME=your_database_name
JWT_SECRET=your_secret
PORT=3000
```

## Notes

- The backend serves static assets from `frontend/`, including the `public/` reset pages.
- Event images are stored in MongoDB and returned as base64 data URLs.
- The current layout is intentionally folder-per-portal because the frontend relies on many relative file paths.
- The chatbot lives under `backend/chatbot` and shares the backend Python environment.
