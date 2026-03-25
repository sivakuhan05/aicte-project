from __future__ import annotations

import asyncio
import base64
import os
import re
import secrets
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

import bcrypt
import jwt
from bson import Binary, ObjectId
from dotenv import load_dotenv
from fastapi import Body, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import ReturnDocument
from pymongo.errors import ConfigurationError

APP_ROOT = Path(__file__).resolve().parent.parent
FRONTEND_DIR = APP_ROOT / "frontend"
PUBLIC_DIR = FRONTEND_DIR / "public"
IMAGE_DIR = APP_ROOT / "image"

load_dotenv(APP_ROOT / ".env")

MONGO_URI = os.getenv("MONGO_UR", "").strip()
MONGO_DB_NAME = os.getenv("MONGO_DB_NAME", "").strip()
JWT_SECRET = os.getenv("JWT_SECRET", "your_jwt_secret")
PORT = int(os.getenv("PORT", "3000"))
APP_TIMEZONE = timezone(timedelta(hours=5, minutes=30))

DATA_URL_RE = re.compile(r"^data:(.+);base64,(.+)$")
KNOWN_DEPARTMENTS = {"CSE", "IT", "MECH", "ECE", "AIML"}
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

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    return response


client: Optional[AsyncIOMotorClient] = None
_db = None
users = None
user_interests = None
events = None
participants = None
org_signins = None
feedbacks = None
admin_users = None
student_notifications = None
chatbot_startup_error: Optional[str] = None


async def warmup_event_chatbot() -> None:
    global chatbot_startup_error

    try:
        try:
            from backend.chatbot.app.chatbot import refresh_chatbot_index
        except ModuleNotFoundError:
            from chatbot.app.chatbot import refresh_chatbot_index

        await asyncio.to_thread(refresh_chatbot_index)
        chatbot_startup_error = None
    except Exception as exc:
        chatbot_startup_error = str(exc)


@app.on_event("startup")
async def startup() -> None:
    global client, _db, users, user_interests, events, participants, org_signins, feedbacks, admin_users, student_notifications

    if not MONGO_URI:
        raise RuntimeError("MONGO_UR is not set in .env")

    client = AsyncIOMotorClient(MONGO_URI)

    if MONGO_DB_NAME:
        _db = client[MONGO_DB_NAME]
    else:
        try:
            _db = client.get_default_database()
        except ConfigurationError as exc:
            raise RuntimeError(
                "No default database name in MONGO_UR. "
                "Set MONGO_DB_NAME in .env or add the db name to the URI."
            ) from exc

    users = _db["users"]
    user_interests = _db["user_interest_details"]
    events = _db["events"]
    participants = _db["participants"]
    org_signins = _db["orgsignins"]
    feedbacks = _db["feedbacks"]
    admin_users = _db["adminusers"]
    student_notifications = _db["student_notifications"]

    await _db.command("ping")
    await cleanup_expired_events()
    await warmup_event_chatbot()


@app.on_event("shutdown")
async def shutdown() -> None:
    if client is not None:
        client.close()


def json_response(payload: Any, status_code: int = 200) -> JSONResponse:
    return JSONResponse(content=serialize_value(payload), status_code=status_code)


def isoformat_z(value: datetime) -> str:
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def serialize_value(value: Any) -> Any:
    if isinstance(value, datetime):
        return isoformat_z(value)
    if isinstance(value, ObjectId):
        return str(value)
    if isinstance(value, Binary):
        return base64.b64encode(value).decode("ascii")
    if isinstance(value, (bytes, bytearray)):
        return base64.b64encode(value).decode("ascii")
    if isinstance(value, dict):
        return {k: serialize_value(v) for k, v in value.items()}
    if isinstance(value, list):
        return [serialize_value(v) for v in value]
    return value


def serialize_event(doc: Dict[str, Any], include_image_field: bool) -> Dict[str, Any]:
    data = serialize_value(doc)
    event_image = data.get("eventImage")

    if include_image_field:
        image_value = None
        if isinstance(event_image, dict):
            base64_data = event_image.get("data")
            content_type = event_image.get("contentType")
            if base64_data and content_type:
                image_value = f"data:{content_type};base64,{base64_data}"
        data["image"] = image_value

    return data


def parse_datetime(value: Any) -> Optional[datetime]:
    if value is None:
        return None
    if isinstance(value, datetime):
        if value.tzinfo is not None:
            return value.astimezone(timezone.utc).replace(tzinfo=None)
        return value
    if isinstance(value, (int, float)):
        try:
            return datetime.fromtimestamp(value / 1000, tz=timezone.utc).replace(tzinfo=None)
        except Exception:
            return None
    if isinstance(value, str):
        try:
            normalized = value.replace("Z", "+00:00") if value.endswith("Z") else value
            parsed = datetime.fromisoformat(normalized)
            if parsed.tzinfo is not None:
                parsed = parsed.astimezone(timezone.utc).replace(tzinfo=None)
            elif "T" in value or re.search(r"\d{1,2}:\d{2}", value):
                parsed = parsed.replace(tzinfo=APP_TIMEZONE).astimezone(timezone.utc).replace(tzinfo=None)
            return parsed
        except Exception:
            try:
                return datetime.strptime(value, "%Y-%m-%d")
            except Exception:
                return None
    return None


def parse_datetime_or_value(value: Any) -> Any:
    parsed = parse_datetime(value)
    return parsed if parsed is not None else value


def clean_text(value: Any) -> str:
    return str(value or "").strip()


def normalize_interest(value: Any) -> str:
    interest = clean_text(value).lower()
    if "sport" in interest or interest in {"port", "ports"}:
        return "Sports"

    aliases = {
        "technical": "Tech",
        "tech": "Tech",
        "food": "Food",
        "food stalls": "Food",
        "sports": "Sports",
        "sports events": "Sports",
        "music": "Music",
        "music events": "Music",
        "arts": "Arts",
        "art": "Arts",
        "general": "General",
        "non-technical": "Non-Tech",
        "non technical": "Non-Tech",
        "non tech": "Non-Tech",
    }
    return aliases.get(interest, clean_text(value))


def normalize_interests(values: Any) -> List[str]:
    if not isinstance(values, list):
        return []

    normalized: List[str] = []
    seen = set()
    for value in values:
        item = normalize_interest(value)
        if not item or item in seen:
            continue
        normalized.append(item)
        seen.add(item)
    return normalized


def normalize_department(value: Any) -> str:
    cleaned = clean_text(value)
    if not cleaned:
        return ""

    lowered = (
        cleaned.lower()
        .replace("&", " and ")
        .replace("/", " ")
        .replace("-", " ")
    )
    lowered = re.sub(r"\s+", " ", lowered).strip()
    mapped = DEPARTMENT_ALIASES.get(lowered)
    if mapped:
        return mapped

    upper = cleaned.upper()
    if upper in KNOWN_DEPARTMENTS:
        return upper

    return cleaned


def normalize_departments(values: Any) -> List[str]:
    if not isinstance(values, list):
        return []

    normalized: List[str] = []
    seen = set()
    for value in values:
        department = normalize_department(value)
        if not department or department in seen:
            continue
        normalized.append(department)
        seen.add(department)
    return normalized
def event_allowed_departments(event_doc: Optional[Dict[str, Any]]) -> List[str]:
    if not event_doc:
        return []
    return normalize_departments(event_doc.get("allowedDepartments"))


def event_access_scope(event_doc: Optional[Dict[str, Any]]) -> str:
    scope = clean_text((event_doc or {}).get("accessScope")).lower()
    if scope == "department":
        return "department"
    return "all"


def student_can_access_event(
    user_doc: Optional[Dict[str, Any]], event_doc: Optional[Dict[str, Any]]
) -> bool:
    if not user_doc or not event_doc:
        return False

    allowed_departments = event_allowed_departments(event_doc)
    if event_access_scope(event_doc) != "department" or not allowed_departments:
        return True

    student_department = normalize_department(user_doc.get("department"))
    return student_department in allowed_departments


def create_auth_token(user: Dict[str, Any]) -> str:
    return jwt.encode(
        {
            "id": str(user.get("_id")),
            "email": user.get("email"),
            "exp": datetime.utcnow() + timedelta(hours=1),
        },
        JWT_SECRET,
        algorithm="HS256",
    )


def extract_auth_email(request: Optional[Request]) -> Optional[str]:
    auth_header = request.headers.get("authorization") if request else None
    token = auth_header.split(" ", 1)[1] if auth_header and " " in auth_header else None
    if not token:
        return None

    try:
        decoded = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
        return clean_text(decoded.get("email")) or None
    except jwt.InvalidTokenError:
        return None


def build_student_profile(user: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "name": clean_text(user.get("name")),
        "email": clean_text(user.get("email")),
        "gender": clean_text(user.get("gender")),
        "department": normalize_department(user.get("department")),
        "rollNumber": clean_text(user.get("rollNumber")),
        "currentYear": clean_text(user.get("currentYear")),
        "interests": normalize_interests(user.get("interests") or []),
    }


def build_organizer_profile(organizer: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": str(organizer.get("_id")) if organizer.get("_id") else "",
        "username": clean_text(organizer.get("username")),
        "email": clean_text(organizer.get("email")),
        "clubAssociation": clean_text(organizer.get("clubAssociation")),
        "bio": clean_text(organizer.get("bio")),
        "approvalStatus": normalize_approval_status(organizer.get("approvalStatus")),
        "createdAt": organizer.get("createdAt"),
        "approvedAt": organizer.get("approvedAt"),
    }


def build_admin_profile(admin: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": str(admin.get("_id")) if admin.get("_id") else "",
        "username": clean_text(admin.get("username")),
        "email": clean_text(admin.get("email")),
        "createdAt": admin.get("createdAt"),
    }


def build_student_notification(doc: Dict[str, Any]) -> Dict[str, Any]:
    notification = serialize_value(doc)
    return {
        "id": notification.get("_id"),
        "email": clean_text(notification.get("email")).lower(),
        "eventId": clean_text(notification.get("eventId")),
        "eventName": clean_text(notification.get("eventName")),
        "previousEventName": clean_text(notification.get("previousEventName")),
        "organizerUsername": clean_text(notification.get("organizerUsername")),
        "title": clean_text(notification.get("title")) or "Event updated",
        "message": clean_text(notification.get("message")),
        "type": clean_text(notification.get("type")) or "event_edited",
        "eventDate": notification.get("eventDate"),
        "createdAt": notification.get("createdAt"),
        "updatedAt": notification.get("updatedAt"),
    }


def build_event_edited_message(previous_event_name: str, event_name: str) -> str:
    if previous_event_name and previous_event_name != event_name:
        return (
            f'"{previous_event_name}" was updated to "{event_name}". '
            "Your registration was removed. Please review the edited event "
            "and register again after admin approval."
        )
    return (
        f'"{event_name}" was edited. Your registration was removed. '
        "Please review the edited event and register again after admin approval."
    )


def normalize_approval_status(value: Any) -> str:
    status = clean_text(value).lower()
    if not status:
        return "approved"
    if status == "approved":
        return "approved"
    if status == "rejected":
        return "rejected"
    return "pending"


def is_approved_record(doc: Optional[Dict[str, Any]]) -> bool:
    return normalize_approval_status((doc or {}).get("approvalStatus")) == "approved"


def is_event_upcoming(event_date: Any) -> bool:
    parsed = parse_datetime(event_date)
    return bool(parsed and parsed >= datetime.utcnow())


def build_registered_student_summary(doc: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "name": clean_text(doc.get("name")),
        "email": clean_text(doc.get("email")),
        "department": normalize_department(doc.get("department")),
        "rollNumber": clean_text(doc.get("rollNumber")),
        "currentYear": clean_text(doc.get("currentYear")),
        "registeredAt": doc.get("registeredAt"),
    }


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, hashed: Any) -> bool:
    if isinstance(hashed, str):
        hashed_bytes = hashed.encode("utf-8")
    else:
        hashed_bytes = hashed
    return bcrypt.checkpw(password.encode("utf-8"), hashed_bytes)


def parse_data_url(data_url: str) -> Optional[Dict[str, Any]]:
    match = DATA_URL_RE.match(data_url or "")
    if not match:
        return None

    content_type = match.group(1)
    base64_data = match.group(2)

    try:
        binary_data = base64.b64decode(base64_data, validate=True)
    except Exception:
        return None

    return {
        "content_type": content_type,
        "base64_data": base64_data,
        "binary_data": binary_data,
    }


async def get_feedback_docs_for_event(
    event_name: Optional[str], organizer_username: Optional[str] = None
) -> List[Dict[str, Any]]:
    if not event_name:
        return []

    docs = await feedbacks.find({"eventName": event_name}).to_list(length=None)
    if not organizer_username:
        return docs

    filtered: List[Dict[str, Any]] = []
    for doc in docs:
        feedback_organizer = str(
            doc.get("organizerName") or doc.get("organizerUsername") or ""
        ).strip()
        if feedback_organizer and feedback_organizer != organizer_username:
            continue
        filtered.append(doc)

    return filtered


def get_event_retention_cutoff() -> datetime:
    return datetime.utcnow() - timedelta(days=365)


async def cleanup_expired_events() -> None:
    cutoff = get_event_retention_cutoff()
    docs = await events.find({}).to_list(length=None)

    expired_ids: List[ObjectId] = []
    expired_pairs: List[Dict[str, str]] = []

    for doc in docs:
        event_date = parse_datetime(doc.get("eventDate"))
        if not event_date or event_date >= cutoff:
            continue

        expired_ids.append(doc["_id"])
        expired_pairs.append(
            {
                "eventName": clean_text(doc.get("eventName")),
                "organizerUsername": clean_text(doc.get("organizerUsername")),
            }
        )

    if not expired_ids:
        return

    await events.delete_many({"_id": {"$in": expired_ids}})

    participant_filters = [
        {
            "eventName": pair["eventName"],
            "organizerUsername": pair["organizerUsername"],
        }
        for pair in expired_pairs
        if pair["eventName"] and pair["organizerUsername"]
    ]
    if participant_filters:
        await participants.delete_many({"$or": participant_filters})

    expired_event_ids = [str(event_id) for event_id in expired_ids]
    if expired_event_ids:
        await student_notifications.delete_many({"eventId": {"$in": expired_event_ids}})

    feedback_filters = []
    for pair in expired_pairs:
        if not pair["eventName"]:
            continue
        feedback_filters.append(
            {
                "eventName": pair["eventName"],
                "$or": [
                    {"organizerUsername": pair["organizerUsername"]},
                    {"organizerName": pair["organizerUsername"]},
                    {
                        "organizerUsername": {"$exists": False},
                        "organizerName": {"$exists": False},
                    },
                ],
            }
        )
    if feedback_filters:
        await feedbacks.delete_many({"$or": feedback_filters})


async def resolve_registration_event(
    registration_doc: Dict[str, Any],
) -> Optional[Dict[str, Any]]:
    event_id = clean_text(registration_doc.get("eventId"))
    if event_id:
        try:
            event_doc = await events.find_one({"_id": ObjectId(event_id)})
            if event_doc:
                return event_doc
        except Exception:
            pass

    event_name = clean_text(registration_doc.get("eventName"))
    organizer_username = clean_text(registration_doc.get("organizerUsername"))
    if event_name and organizer_username:
        return await events.find_one(
            {"eventName": event_name, "organizerUsername": organizer_username}
        )

    return None


def build_student_registration(
    registration_doc: Dict[str, Any],
    event_doc: Optional[Dict[str, Any]] = None,
    feedback_doc: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    registration_data = serialize_value(registration_doc)
    event_data = serialize_event(event_doc, include_image_field=True) if event_doc else {}
    feedback_data = serialize_value(feedback_doc) if feedback_doc else {}

    event_date = event_data.get("eventDate") or registration_data.get("eventDate")
    parsed_event_date = parse_datetime(event_date)
    status = "upcoming"
    if parsed_event_date and parsed_event_date < datetime.utcnow():
        status = "attended"

    return {
        "registrationId": registration_data.get("_id"),
        "eventId": event_data.get("_id") or registration_data.get("eventId"),
        "eventName": event_data.get("eventName") or registration_data.get("eventName"),
        "eventDate": event_date,
        "eventLocation": event_data.get("eventLocation")
        or registration_data.get("eventLocation"),
        "eventDescription": event_data.get("eventDescription")
        or registration_data.get("eventDescription"),
        "category": event_data.get("category")
        or registration_data.get("eventCategory")
        or "General",
        "clubAssociation": event_data.get("clubAssociation")
        or registration_data.get("clubAssociation"),
        "accessScope": event_data.get("accessScope")
        or registration_data.get("accessScope")
        or "all",
        "allowedDepartments": event_data.get("allowedDepartments")
        or registration_data.get("allowedDepartments")
        or [],
        "organizerUsername": event_data.get("organizerUsername")
        or registration_data.get("organizerUsername"),
        "externalFormUrl": event_data.get("externalFormUrl")
        or registration_data.get("externalFormUrl"),
        "image": event_data.get("image"),
        "completion": event_data.get("completion"),
        "registeredAt": registration_data.get("registeredAt"),
        "status": status,
        "studentFeedback": {
            "rating": feedback_data.get("rating"),
            "feedback": feedback_data.get("feedback"),
            "createdAt": feedback_data.get("createdAt"),
            "updatedAt": feedback_data.get("updatedAt"),
        }
        if feedback_data
        else None,
        "participant": {
            "name": registration_data.get("name"),
            "email": registration_data.get("email"),
            "gender": registration_data.get("gender"),
            "department": registration_data.get("department"),
            "rollNumber": registration_data.get("rollNumber"),
            "currentYear": registration_data.get("currentYear"),
        },
    }


async def get_student_registrations(email: str) -> List[Dict[str, Any]]:
    registration_docs = await participants.find({"email": email}).to_list(length=None)
    feedback_docs = await feedbacks.find({"participantEmail": email}).to_list(length=None)
    feedback_lookup = {
        (
            clean_text(doc.get("eventName")),
            clean_text(doc.get("organizerUsername") or doc.get("organizerName")),
        ): doc
        for doc in feedback_docs
    }
    registrations: List[Dict[str, Any]] = []

    for registration_doc in registration_docs:
        event_doc = await resolve_registration_event(registration_doc)
        event_name = clean_text(
            (event_doc or {}).get("eventName") or registration_doc.get("eventName")
        )
        organizer_username = clean_text(
            (event_doc or {}).get("organizerUsername")
            or registration_doc.get("organizerUsername")
        )
        feedback_doc = feedback_lookup.get((event_name, organizer_username))
        registrations.append(
            build_student_registration(registration_doc, event_doc, feedback_doc)
        )

    def sort_key(item: Dict[str, Any]) -> datetime:
        return parse_datetime(item.get("eventDate")) or datetime.max

    registrations.sort(key=sort_key)
    return registrations


async def build_admin_event_summary(event_doc: Dict[str, Any]) -> Dict[str, Any]:
    event = serialize_event(event_doc, include_image_field=True)
    organizer_username = clean_text(event.get("organizerUsername"))
    event_name = clean_text(event.get("eventName"))

    participant_docs = await participants.find(
        {"eventName": event_name, "organizerUsername": organizer_username}
    ).to_list(length=None)
    registered_students = [build_registered_student_summary(doc) for doc in participant_docs]

    feedback_docs = await get_feedback_docs_for_event(event_name, organizer_username)
    ratings: List[float] = []
    for feedback in feedback_docs:
        try:
            ratings.append(float(feedback.get("rating")))
        except Exception:
            continue

    rating_sum = sum(ratings) if ratings else 0
    rating_count = len(ratings)
    average_rating = round(rating_sum / rating_count, 1) if rating_count else 0

    completion = event.get("completion") or {}
    attended_count = 0
    try:
        attended_count = int(completion.get("participantsParticipated") or 0)
    except Exception:
        attended_count = 0

    event["participantCount"] = len(participant_docs)
    event["registeredStudents"] = registered_students
    event["ratingSum"] = rating_sum
    event["ratingCount"] = rating_count
    event["averageRating"] = average_rating
    event["feedbackCount"] = len(feedback_docs)
    event["attendedCount"] = attended_count
    event["approvalStatus"] = normalize_approval_status(event.get("approvalStatus"))
    event["clubAssociation"] = clean_text(event.get("clubAssociation")) or "Open to All"
    event["accessScope"] = event_access_scope(event_doc)
    event["allowedDepartments"] = event_allowed_departments(event_doc)
    return event


async def get_admin_event_summaries(
    query: Optional[Dict[str, Any]] = None,
) -> List[Dict[str, Any]]:
    await cleanup_expired_events()
    docs = await events.find(query or {}).to_list(length=None)
    results: List[Dict[str, Any]] = []
    for doc in docs:
        results.append(await build_admin_event_summary(doc))
    results.sort(
        key=lambda item: parse_datetime(item.get("eventDate")) or datetime.max
    )
    return results


async def begin_password_reset(
    collection,
    email: Any,
    name_field: str = "name",
) -> JSONResponse:
    cleaned_email = clean_text(email).lower()

    try:
        user = await collection.find_one({"email": cleaned_email})
        if not user:
            return json_response(
                {
                    "success": True,
                    "message": "Reset request processed.",
                }
            )

        token = secrets.token_hex(20)
        expires_at = datetime.utcnow() + timedelta(hours=1)

        await collection.update_one(
            {"_id": user["_id"]},
            {
                "$set": {
                    "resetPasswordToken": token,
                    "resetPasswordExpires": expires_at,
                }
            },
        )

        return json_response(
            {
                "success": True,
                "token": token,
                "email": cleaned_email,
                "name": clean_text(user.get(name_field)) or clean_text(user.get("username")),
                "message": "Reset link generated",
            }
        )
    except Exception:
        return json_response({"success": False, "error": "Server error"}, status_code=500)


async def finish_password_reset(
    collection,
    token: Any,
    email: Any,
    new_password: Any,
) -> JSONResponse:
    cleaned_email = clean_text(email).lower()
    password = str(new_password or "")

    try:
        user = await collection.find_one(
            {
                "email": cleaned_email,
                "resetPasswordToken": token,
                "resetPasswordExpires": {"$gt": datetime.utcnow()},
            }
        )

        if not user:
            return json_response(
                {"success": False, "error": "Invalid or expired token"},
                status_code=400,
            )

        hashed_password = hash_password(password)

        await collection.update_one(
            {"_id": user["_id"]},
            {
                "$set": {"password": hashed_password},
                "$unset": {"resetPasswordToken": "", "resetPasswordExpires": ""},
            },
        )

        return json_response(
            {"success": True, "message": "Password updated successfully"}
        )
    except Exception:
        return json_response({"success": False, "error": "Server error"}, status_code=500)


@app.post("/forgot-password")
async def forgot_password(payload: Dict[str, Any] = Body(...)):
    email = payload.get("email")
    return await begin_password_reset(users, email, "name")


@app.post("/org/forgot-password")
async def org_forgot_password(payload: Dict[str, Any] = Body(...)):
    email = payload.get("email")
    return await begin_password_reset(org_signins, email, "username")


@app.post("/admin/forgot-password")
async def admin_forgot_password(payload: Dict[str, Any] = Body(...)):
    email = payload.get("email")
    return await begin_password_reset(admin_users, email, "username")


@app.post("/reset-password")
async def reset_password(payload: Dict[str, Any] = Body(...)):
    token = payload.get("token")
    email = payload.get("email")
    new_password = payload.get("newPassword")
    return await finish_password_reset(users, token, email, new_password)


@app.post("/org/reset-password")
async def org_reset_password(payload: Dict[str, Any] = Body(...)):
    token = payload.get("token")
    email = payload.get("email")
    new_password = payload.get("newPassword") or payload.get("password")
    return await finish_password_reset(org_signins, token, email, new_password)


@app.post("/admin/reset-password")
async def admin_reset_password(payload: Dict[str, Any] = Body(...)):
    token = payload.get("token")
    email = payload.get("email")
    new_password = payload.get("newPassword") or payload.get("password")
    return await finish_password_reset(admin_users, token, email, new_password)


@app.get("/reset.html")
async def reset_page():
    reset_path = PUBLIC_DIR / "reset.html"
    return FileResponse(reset_path)


@app.post("/register")
async def register(payload: Dict[str, Any] = Body(...)):
    name = payload.get("name")
    email = payload.get("email")
    password = payload.get("password")

    if not name or not email or not password:
        return json_response({"message": "All fields are required"}, status_code=400)

    existing_user = await users.find_one({"email": email})
    if existing_user:
        return json_response(
            {"message": "Email already registered. Please log in."},
            status_code=409,
        )

    hashed_password = hash_password(password)
    await users.insert_one({"name": name, "email": email, "password": hashed_password})

    return json_response(
        {"message": "Registration successful!", "user": {"name": name, "email": email}},
        status_code=201,
    )


@app.post("/signup")
async def signup(payload: Dict[str, Any] = Body(...)):
    name = payload.get("name")
    email = payload.get("email")
    password = payload.get("password")
    confirm_password = payload.get("confirmPassword")

    if not name or not email or not password or not confirm_password:
        return json_response({"message": "All fields are required"}, status_code=400)

    if password != confirm_password:
        return json_response({"message": "Passwords do not match"}, status_code=400)

    existing_user = await users.find_one({"email": email})
    if existing_user:
        return json_response(
            {"message": "Email already registered. Please log in."},
            status_code=409,
        )

    hashed_password = hash_password(password)
    await users.insert_one({"name": name, "email": email, "password": hashed_password})

    return json_response(
        {"message": "Sign-up successful!", "user": {"name": name, "email": email}},
        status_code=201,
    )


@app.post("/students/register")
async def student_register(payload: Dict[str, Any] = Body(...)):
    name = clean_text(payload.get("name"))
    email = clean_text(payload.get("email")).lower()
    password = payload.get("password")
    confirm_password = payload.get("confirmPassword")
    gender = clean_text(payload.get("gender"))
    department = normalize_department(payload.get("department"))
    roll_number = clean_text(payload.get("rollNumber"))
    current_year = clean_text(payload.get("currentYear"))
    interests = normalize_interests(payload.get("interests"))

    if (
        not name
        or not email
        or not password
        or not confirm_password
        or not gender
        or not department
    ):
        return json_response({"message": "All fields are required"}, status_code=400)

    if password != confirm_password:
        return json_response({"message": "Passwords do not match"}, status_code=400)

    if not interests:
        return json_response(
            {"message": "Select at least one interested event domain."},
            status_code=400,
        )

    existing_user = await users.find_one({"email": email})
    if existing_user:
        return json_response(
            {"message": "Email already registered. Please log in."},
            status_code=409,
        )

    hashed_password = hash_password(password)
    user_doc = {
        "name": name,
        "email": email,
        "password": hashed_password,
        "gender": gender,
        "department": department,
        "rollNumber": roll_number or None,
        "currentYear": current_year or None,
        "interests": interests,
        "role": "student",
        "createdAt": datetime.utcnow(),
    }

    result = await users.insert_one(user_doc)
    user_doc["_id"] = result.inserted_id
    token = create_auth_token(user_doc)

    return json_response(
        {
            "message": "Student account created successfully.",
            "token": token,
            "user": build_student_profile(user_doc),
        },
        status_code=201,
    )


@app.post("/submit")
async def submit_interests(payload: Dict[str, Any] = Body(...)):
    name = payload.get("name")
    email = payload.get("email")
    password = payload.get("password")
    location = payload.get("location")
    dob = payload.get("dob")
    interests = payload.get("interests")

    if not name or not email or not password or not location or not dob or interests is None:
        return json_response({"message": "All fields are required"}, status_code=400)

    existing = await user_interests.find_one({"email": email})
    if existing:
        return json_response({"message": "Email already submitted interests."}, status_code=409)

    doc = {
        "name": name,
        "email": email,
        "password": password,
        "location": location,
        "dob": parse_datetime_or_value(dob),
        "interests": interests,
    }

    await user_interests.insert_one(doc)

    return json_response(
        {
            "message": "Interest saved!",
            "user": {
                "name": name,
                "email": email,
                "location": location,
                "dob": parse_datetime_or_value(dob),
                "interests": interests,
            },
        },
        status_code=201,
    )


@app.post("/login")
async def login(payload: Dict[str, Any] = Body(...)):
    email = clean_text(payload.get("email")).lower()
    password = payload.get("password")

    if not email or not password:
        return json_response(
            {"message": "Please provide both email and password."},
            status_code=400,
        )

    try:
        user = await users.find_one({"email": email})
        if not user or not verify_password(password, user.get("password")):
            return json_response({"message": "Invalid email or password."}, status_code=400)

        token = create_auth_token(user)

        return json_response(
            {
                "message": "Login successful!",
                "email": user.get("email"),
                "name": user.get("name"),
                "token": token,
                "user": build_student_profile(user),
            }
        )
    except Exception:
        return json_response({"message": "Server error"}, status_code=500)


@app.post("/admin/signup")
async def admin_signup(payload: Dict[str, Any] = Body(...)):
    username = clean_text(payload.get("username"))
    email = clean_text(payload.get("email")).lower()
    password = payload.get("password")

    if not username or not email or not password:
        return json_response(
            {"message": "Username, email, and password are required."},
            status_code=400,
        )

    try:
        existing_admin = await admin_users.find_one(
            {"$or": [{"email": email}, {"username": username}]}
        )
        if existing_admin:
            return json_response(
                {"message": "Admin account already exists with this email or username."},
                status_code=409,
            )

        admin_doc = {
            "username": username,
            "email": email,
            "password": hash_password(password),
            "createdAt": datetime.utcnow(),
        }
        result = await admin_users.insert_one(admin_doc)
        admin_doc["_id"] = result.inserted_id

        return json_response(
            {
                "message": "Admin account created successfully.",
                "admin": build_admin_profile(admin_doc),
            },
            status_code=201,
        )
    except Exception:
        return json_response({"message": "Server error"}, status_code=500)


@app.post("/admin/login")
async def admin_login(payload: Dict[str, Any] = Body(...)):
    email = clean_text(payload.get("email")).lower()
    password = payload.get("password")

    if not email or not password:
        return json_response(
            {"message": "Email and password are required."},
            status_code=400,
        )

    try:
        admin = await admin_users.find_one({"email": email})
        if not admin or not verify_password(password, admin.get("password")):
            return json_response({"message": "Invalid email or password."}, status_code=401)

        return json_response(
            {
                "message": "Admin login successful.",
                "admin": build_admin_profile(admin),
            }
        )
    except Exception:
        return json_response({"message": "Server error"}, status_code=500)


@app.post("/org/login")
@app.post("/orglogin")
async def org_login(payload: Dict[str, Any] = Body(...)):
    email = clean_text(payload.get("email")).lower()
    username = clean_text(payload.get("username"))
    password = payload.get("password")

    if not password or (not email and not username):
        return json_response({"message": "Email and password are required"}, status_code=400)

    try:
        if email:
            org = await org_signins.find_one({"email": email})
        else:
            org = await org_signins.find_one({"username": username})

        if not org or not verify_password(password, org.get("password")):
            return json_response({"message": "Invalid email or password"}, status_code=401)

        if not is_approved_record(org):
            return json_response(
                {"message": "Your account is not verified by admin yet."},
                status_code=403,
            )

        return json_response(
            {
                "message": "Login successful",
                "username": org.get("username"),
                "email": org.get("email"),
                "clubAssociation": org.get("clubAssociation"),
                "bio": org.get("bio"),
                "approvalStatus": normalize_approval_status(org.get("approvalStatus")),
            }
        )
    except Exception:
        return json_response({"message": "Server error"}, status_code=500)


@app.post("/org/signup")
@app.post("/orgsiginregister")
async def org_register(payload: Dict[str, Any] = Body(...)):
    username = clean_text(payload.get("username"))
    email = clean_text(payload.get("email")).lower()
    password = payload.get("password")
    club_association = clean_text(payload.get("clubAssociation"))
    bio = clean_text(payload.get("bio"))

    if not username or not email or not password or not club_association:
        return json_response(
            {"message": "Name, email, password, and club / association are required."},
            status_code=400,
        )

    try:
        org_exists = await org_signins.find_one({"email": email})
        if org_exists:
            return json_response({"message": "Email already registered"}, status_code=400)

        username_exists = await org_signins.find_one({"username": username})
        if username_exists:
            return json_response({"message": "Name already registered"}, status_code=400)

        hashed_password = hash_password(password)
        organizer_doc = {
            "username": username,
            "email": email,
            "password": hashed_password,
            "clubAssociation": club_association,
            "bio": bio,
            "approvalStatus": "pending",
            "createdAt": datetime.utcnow(),
            "approvedAt": None,
        }
        result = await org_signins.insert_one(organizer_doc)
        organizer_doc["_id"] = result.inserted_id

        return json_response(
            {
                "message": "Organization account created and sent for admin approval.",
                "organizer": build_organizer_profile(organizer_doc),
            },
            status_code=201,
        )
    except Exception:
        return json_response({"message": "Server error"}, status_code=500)


@app.get("/organizer/profile/{username}")
async def organizer_profile(username: str):
    try:
        organizer = await org_signins.find_one({"username": clean_text(username)})
        if not organizer:
            return json_response({"message": "Organizer not found"}, status_code=404)
        return json_response(build_organizer_profile(organizer))
    except Exception:
        return json_response({"message": "Server error"}, status_code=500)


@app.post("/organizer/profile")
async def update_organizer_profile(payload: Dict[str, Any] = Body(...)):
    username = clean_text(payload.get("username"))
    club_association = clean_text(payload.get("clubAssociation"))
    bio = clean_text(payload.get("bio"))

    if not username or not club_association:
        return json_response(
            {"message": "Name and club / association are required."},
            status_code=400,
        )

    try:
        updated = await org_signins.find_one_and_update(
            {"username": username},
            {"$set": {"clubAssociation": club_association, "bio": bio}},
            return_document=ReturnDocument.AFTER,
        )
        if not updated:
            return json_response({"message": "Organizer not found"}, status_code=404)

        await events.update_many(
            {"organizerUsername": username},
            {"$set": {"clubAssociation": club_association}},
        )
        await participants.update_many(
            {"organizerUsername": username},
            {"$set": {"clubAssociation": club_association}},
        )

        return json_response(
            {
                "message": "Organizer profile updated successfully.",
                "organizer": build_organizer_profile(updated),
            }
        )
    except Exception:
        return json_response({"message": "Server error"}, status_code=500)


@app.post("/events")
async def create_event(payload: Dict[str, Any] = Body(...)):
    event_name = payload.get("eventName")
    category = payload.get("category")
    event_date = payload.get("eventDate")
    event_location = payload.get("eventLocation")
    event_description = payload.get("eventDescription")
    base64_image = payload.get("base64Image")
    organizer_username = payload.get("organizerUsername")
    external_form_url = (payload.get("externalFormUrl") or "").strip()
    club_association = clean_text(payload.get("clubAssociation")) or None
    access_scope = clean_text(payload.get("accessScope")).lower() or "all"
    allowed_departments = normalize_departments(payload.get("allowedDepartments"))

    if (
        not event_name
        or not category
        or not event_date
        or not event_location
        or not event_description
        or not base64_image
        or not organizer_username
    ):
        return json_response(
            {
                "success": False,
                "message": "All fields including organizerUsername are required",
            },
            status_code=400,
        )

    organizer = await org_signins.find_one({"username": organizer_username})
    if not organizer:
        return json_response(
            {"success": False, "message": "Organizer account not found"},
            status_code=404,
        )

    if not is_approved_record(organizer):
        return json_response(
            {
                "success": False,
                "message": "Organizer account must be approved before hosting events.",
            },
            status_code=403,
        )

    if access_scope not in {"all", "department"}:
        access_scope = "all"

    if access_scope == "department" and not allowed_departments:
        return json_response(
            {
                "success": False,
                "message": "Choose at least one department or set the event access to all.",
            },
            status_code=400,
        )

    parsed_image = parse_data_url(base64_image)
    if not parsed_image:
        return json_response(
            {"success": False, "message": "Invalid image format"}, status_code=400
        )

    parsed_date = parse_datetime_or_value(event_date)
    resolved_club_association = clean_text(organizer.get("clubAssociation")) or club_association or None

    doc = {
        "organizerUsername": organizer_username,
        "eventName": event_name,
        "category": category,
        "eventDate": parsed_date,
        "eventLocation": event_location,
        "eventDescription": event_description,
        "externalFormUrl": external_form_url or None,
        "clubAssociation": resolved_club_association,
        "accessScope": access_scope,
        "allowedDepartments": allowed_departments if access_scope == "department" else [],
        "approvalStatus": "pending",
        "approvedAt": None,
        "eventImage": {
            "data": Binary(parsed_image["binary_data"]),
            "contentType": parsed_image["content_type"],
        },
        "createdAt": datetime.utcnow(),
    }

    try:
        result = await events.insert_one(doc)
        return json_response(
            {
                "success": True,
                "message": "Event submitted and sent for admin approval.",
                "eventId": str(result.inserted_id),
            },
            status_code=201,
        )
    except Exception:
        return json_response(
            {"success": False, "message": "Internal server error"}, status_code=500
        )


@app.put("/events/{event_id}")
async def update_event(event_id: str, payload: Dict[str, Any] = Body(...)):
    event_name = clean_text(payload.get("eventName"))
    category = clean_text(payload.get("category"))
    event_date = payload.get("eventDate")
    event_location = clean_text(payload.get("eventLocation"))
    event_description = clean_text(payload.get("eventDescription"))
    base64_image = clean_text(payload.get("base64Image"))
    organizer_username = clean_text(payload.get("organizerUsername"))
    external_form_url = clean_text(payload.get("externalFormUrl"))
    access_scope = clean_text(payload.get("accessScope")).lower() or "all"
    allowed_departments = normalize_departments(payload.get("allowedDepartments"))

    if (
        not event_name
        or not category
        or not event_date
        or not event_location
        or not event_description
        or not organizer_username
    ):
        return json_response(
            {"success": False, "message": "All event fields are required."},
            status_code=400,
        )

    try:
        existing_event = await events.find_one({"_id": ObjectId(event_id)})
    except Exception:
        return json_response(
            {"success": False, "message": "Invalid event id."},
            status_code=400,
        )

    if not existing_event:
        return json_response(
            {"success": False, "message": "Event not found."},
            status_code=404,
        )

    existing_organizer_username = clean_text(existing_event.get("organizerUsername"))
    if organizer_username != existing_organizer_username:
        return json_response(
            {"success": False, "message": "You can only edit your own event."},
            status_code=403,
        )

    organizer = await org_signins.find_one({"username": organizer_username})
    if not organizer:
        return json_response(
            {"success": False, "message": "Organizer account not found."},
            status_code=404,
        )

    if access_scope not in {"all", "department"}:
        access_scope = "all"

    if access_scope == "department" and not allowed_departments:
        return json_response(
            {
                "success": False,
                "message": "Choose at least one department or set the event access to all.",
            },
            status_code=400,
        )

    updated_image = existing_event.get("eventImage")
    if base64_image:
        parsed_image = parse_data_url(base64_image)
        if not parsed_image:
            return json_response(
                {"success": False, "message": "Invalid image format"},
                status_code=400,
            )
        updated_image = {
            "data": Binary(parsed_image["binary_data"]),
            "contentType": parsed_image["content_type"],
        }

    if not updated_image:
        return json_response(
            {"success": False, "message": "Event image is required."},
            status_code=400,
        )

    parsed_date = parse_datetime_or_value(event_date)
    resolved_club_association = (
        clean_text(organizer.get("clubAssociation"))
        or clean_text(existing_event.get("clubAssociation"))
        or None
    )
    previous_event_name = clean_text(existing_event.get("eventName"))

    update_fields = {
        "eventName": event_name,
        "category": category,
        "eventDate": parsed_date,
        "eventLocation": event_location,
        "eventDescription": event_description,
        "externalFormUrl": external_form_url or None,
        "clubAssociation": resolved_club_association,
        "accessScope": access_scope,
        "allowedDepartments": allowed_departments if access_scope == "department" else [],
        "approvalStatus": "pending",
        "approvedAt": None,
        "eventImage": updated_image,
        "updatedAt": datetime.utcnow(),
    }

    try:
        participant_filter = {
            "$or": [
                {"eventId": event_id},
                {
                    "eventName": previous_event_name,
                    "organizerUsername": organizer_username,
                },
            ]
        }
        impacted_participants = await participants.find(participant_filter).to_list(length=None)

        updated_event = await events.find_one_and_update(
            {"_id": ObjectId(event_id)},
            {"$set": update_fields},
            return_document=ReturnDocument.AFTER,
        )

        notification_time = datetime.utcnow()
        notification_message = build_event_edited_message(previous_event_name, event_name)
        impacted_emails = set()

        for participant_doc in impacted_participants:
            participant_email = clean_text(participant_doc.get("email")).lower()
            if not participant_email or participant_email in impacted_emails:
                continue

            impacted_emails.add(participant_email)
            await student_notifications.find_one_and_update(
                {
                    "email": participant_email,
                    "eventId": event_id,
                    "type": "event_edited",
                },
                {
                    "$set": {
                        "email": participant_email,
                        "eventId": event_id,
                        "eventName": event_name,
                        "previousEventName": previous_event_name,
                        "organizerUsername": organizer_username,
                        "title": "Event updated",
                        "message": notification_message,
                        "type": "event_edited",
                        "eventDate": parsed_date,
                        "updatedAt": notification_time,
                    },
                    "$setOnInsert": {"createdAt": notification_time},
                },
                upsert=True,
                return_document=ReturnDocument.AFTER,
            )

        delete_result = await participants.delete_many(participant_filter)

        feedback_filter = {
            "eventName": previous_event_name,
            "$or": [
                {"organizerUsername": organizer_username},
                {"organizerName": organizer_username},
                {
                    "organizerUsername": {"$exists": False},
                    "organizerName": {"$exists": False},
                },
            ],
        }
        await feedbacks.update_many(
            feedback_filter,
            {
                "$set": {
                    "eventName": event_name,
                    "clubAssociation": resolved_club_association,
                }
            },
        )

        return json_response(
            {
                "success": True,
                "message": "Event updated and sent for admin approval.",
                "removedRegistrations": delete_result.deleted_count,
                "event": serialize_event(updated_event, include_image_field=True),
            }
        )
    except Exception:
        return json_response(
            {"success": False, "message": "Internal server error"},
            status_code=500,
        )


@app.post("/participant-register")
async def participant_register(payload: Dict[str, Any] = Body(...)):
    name = payload.get("name")
    email = payload.get("email")
    age = payload.get("age")
    profession = payload.get("profession")
    reminder = payload.get("reminder")
    event_name = payload.get("eventName")
    event_date = payload.get("eventDate")
    organizer_username = payload.get("organizerUsername")

    if not name or not email or not event_name or not event_date or not organizer_username:
        return json_response({"message": "Missing required fields"}, status_code=400)

    doc = {
        "name": name,
        "email": email,
        "age": age,
        "profession": profession,
        "reminder": reminder,
        "eventName": event_name,
        "eventDate": parse_datetime_or_value(event_date),
        "organizerUsername": organizer_username,
    }

    try:
        await participants.insert_one(doc)
        return json_response({"message": "Participant registered successfully"}, status_code=201)
    except Exception:
        return json_response({"message": "Internal Server Error"}, status_code=500)


@app.post("/students/register-event")
async def register_student_event(payload: Dict[str, Any] = Body(...)):
    email = clean_text(payload.get("email"))
    event_id = clean_text(payload.get("eventId"))

    if not email or not event_id:
        return json_response({"message": "Student email and eventId are required"}, status_code=400)

    try:
        user = await users.find_one({"email": email})
        if not user:
            return json_response({"message": "Student not found"}, status_code=404)

        try:
            event_doc = await events.find_one({"_id": ObjectId(event_id)})
        except Exception:
            return json_response({"message": "Invalid eventId"}, status_code=400)

        if not event_doc:
            return json_response({"message": "Event not found"}, status_code=404)

        if not is_approved_record(event_doc):
            return json_response(
                {"message": "This event is not approved for students yet."},
                status_code=403,
            )

        existing_registration = await participants.find_one(
            {
                "email": email,
                "$or": [
                    {"eventId": event_id},
                    {
                        "eventName": event_doc.get("eventName"),
                        "organizerUsername": event_doc.get("organizerUsername"),
                    },
                ],
                }
            )

        if existing_registration:
            await student_notifications.delete_many(
                {"email": email, "eventId": event_id, "type": "event_edited"}
            )
            return json_response(
                {
                    "message": "Event already saved to your registered events.",
                    "alreadyRegistered": True,
                    "redirectUrl": event_doc.get("externalFormUrl"),
                    "event": build_student_registration(existing_registration, event_doc),
                }
            )

        if not student_can_access_event(user, event_doc):
            allowed_departments = ", ".join(event_allowed_departments(event_doc))
            return json_response(
                {
                    "message": (
                        "This event is restricted to specific departments."
                        if not allowed_departments
                        else f"This event is only open to {allowed_departments} students."
                    )
                },
                status_code=403,
            )

        registration_doc = {
            "name": user.get("name"),
            "email": user.get("email"),
            "profession": "Student",
            "gender": user.get("gender"),
            "department": user.get("department"),
            "rollNumber": user.get("rollNumber"),
            "currentYear": user.get("currentYear"),
            "eventId": event_id,
            "eventName": event_doc.get("eventName"),
            "eventDate": event_doc.get("eventDate"),
            "eventLocation": event_doc.get("eventLocation"),
            "eventDescription": event_doc.get("eventDescription"),
            "eventCategory": event_doc.get("category"),
            "clubAssociation": event_doc.get("clubAssociation"),
            "accessScope": event_access_scope(event_doc),
            "allowedDepartments": event_allowed_departments(event_doc),
            "externalFormUrl": event_doc.get("externalFormUrl"),
            "organizerUsername": event_doc.get("organizerUsername"),
            "registeredAt": datetime.utcnow(),
        }

        result = await participants.insert_one(registration_doc)
        registration_doc["_id"] = result.inserted_id
        await student_notifications.delete_many(
            {"email": email, "eventId": event_id, "type": "event_edited"}
        )

        return json_response(
            {
                "message": "Event saved to your registered events.",
                "redirectUrl": event_doc.get("externalFormUrl"),
                "event": build_student_registration(registration_doc, event_doc),
            },
            status_code=201,
        )
    except Exception as exc:
        return json_response({"message": "Server error", "error": str(exc)}, status_code=500)


@app.get("/my-events/{email}")
async def my_events(email: str):
    try:
        registrations = await get_student_registrations(email)
        return json_response({"count": len(registrations), "events": registrations})
    except Exception as exc:
        return json_response({"message": "Server error", "error": str(exc)}, status_code=500)


@app.get("/student-notifications/{email}")
async def get_student_notifications(email: str):
    try:
        docs = await student_notifications.find(
            {"email": clean_text(email).lower()}
        ).sort("updatedAt", -1).to_list(length=20)
        return json_response(
            {
                "count": len(docs),
                "notifications": [build_student_notification(doc) for doc in docs],
            }
        )
    except Exception as exc:
        return json_response({"message": "Server error", "error": str(exc)}, status_code=500)


@app.post("/submit-feedback")
async def submit_feedback(payload: Dict[str, Any] = Body(...)):
    participant_name = clean_text(payload.get("participantName"))
    participant_email = clean_text(payload.get("participantEmail")).lower()
    event_name = clean_text(payload.get("eventName"))
    organizer_username = clean_text(payload.get("organizerUsername"))
    feedback_text = clean_text(payload.get("feedback"))

    try:
        rating = int(payload.get("rating"))
    except Exception:
        rating = 0

    if (
        not participant_name
        or not participant_email
        or not event_name
        or not organizer_username
        or not feedback_text
        or rating < 1
        or rating > 5
    ):
        return json_response(
            {
                "message": "Participant, event, rating, and feedback are required."
            },
            status_code=400,
        )

    registration = await participants.find_one(
        {
            "email": participant_email,
            "eventName": event_name,
            "organizerUsername": organizer_username,
        }
    )
    if not registration:
        return json_response(
            {"message": "You can only submit feedback for your registered event."},
            status_code=403,
        )

    event_doc = await resolve_registration_event(registration)
    if not event_doc:
        return json_response(
            {"message": "Event not found for feedback submission."},
            status_code=404,
        )

    event_date = parse_datetime(
        event_doc.get("eventDate") or registration.get("eventDate")
    )
    if not event_date or event_date >= datetime.utcnow():
        return json_response(
            {"message": "Feedback can only be submitted for completed events."},
            status_code=400,
        )

    now = datetime.utcnow()
    feedback_doc = {
        "participantName": participant_name,
        "participantEmail": participant_email,
        "eventName": event_name,
        "organizerUsername": organizer_username,
        "organizerName": organizer_username,
        "rating": rating,
        "feedback": feedback_text,
        "eventId": str(event_doc.get("_id")) if event_doc.get("_id") else clean_text(payload.get("eventId")),
        "clubAssociation": clean_text(
            event_doc.get("clubAssociation") or registration.get("clubAssociation")
        ),
        "updatedAt": now,
    }

    try:
        existing_feedback = await feedbacks.find_one_and_update(
            {
                "participantEmail": participant_email,
                "eventName": event_name,
                "organizerUsername": organizer_username,
            },
            {
                "$set": feedback_doc,
                "$setOnInsert": {"createdAt": now},
            },
            upsert=True,
            return_document=ReturnDocument.AFTER,
        )
        return json_response(
            {
                "message": "Feedback submitted successfully.",
                "feedback": serialize_value(existing_feedback),
            },
            status_code=201,
        )
    except Exception as exc:
        return json_response({"error": str(exc)}, status_code=400)


@app.post("/help-support")
async def help_support(payload: Dict[str, Any] = Body(...)):
    name = payload.get("name")
    email = payload.get("email")
    message = payload.get("message")

    if not name or not email or not message:
        return json_response({"message": "All fields are required"}, status_code=400)

    return json_response(
        {"message": "Help and support request sent. You will be contacted shortly."}
    )


@app.post("/chatbot/query")
async def chatbot_query(request: Request, payload: Dict[str, Any] = Body(...)):
    message = clean_text(payload.get("message"))
    history = payload.get("history") if isinstance(payload.get("history"), list) else []
    user_email = extract_auth_email(request)

    if not message:
        return json_response({"message": "Message is required."}, status_code=400)

    try:
        try:
            from backend.chatbot.app.chatbot import ask_chatbot
        except ModuleNotFoundError:
            from chatbot.app.chatbot import ask_chatbot

        answer = await asyncio.to_thread(
            ask_chatbot,
            question=message,
            history=history,
            user_email=user_email,
        )
        return json_response({"message": answer, "ready": True})
    except FileNotFoundError as exc:
        return json_response(
            {
                "message": "Chatbot knowledge base is not ready yet. Run ingest.py first.",
                "error": str(exc),
                "ready": False,
            },
            status_code=503,
        )
    except Exception as exc:
        return json_response(
            {
                "message": "Chatbot is unavailable right now.",
                "error": str(exc),
                "startupError": chatbot_startup_error,
                "ready": False,
            },
            status_code=503,
        )


@app.get("/events")
async def list_events(viewerEmail: Optional[str] = None):
    try:
        await cleanup_expired_events()
        docs = await events.find({}).to_list(length=None)
        docs = [doc for doc in docs if is_approved_record(doc)]
        if viewerEmail:
            user = await users.find_one({"email": clean_text(viewerEmail).lower()})
            docs = [doc for doc in docs if user and student_can_access_event(user, doc)]
        formatted = [serialize_event(doc, include_image_field=True) for doc in docs]
        return JSONResponse(content=formatted)
    except Exception as exc:
        return json_response({"message": "Failed to fetch events", "error": str(exc)}, status_code=500)


@app.get("/events/{event_id}")
async def get_event(event_id: str):
    try:
        await cleanup_expired_events()
        doc = await events.find_one({"_id": ObjectId(event_id)})
        if not doc:
            return json_response({"message": "Event not found"}, status_code=404)
        return json_response(serialize_event(doc, include_image_field=False))
    except Exception:
        return json_response({"message": "Server error"}, status_code=500)


@app.get("/user/{email}")
async def get_user(email: str):
    try:
        user = await users.find_one({"email": email})
        if not user:
            return json_response({"message": "User not found"}, status_code=404)

        return json_response(build_student_profile(user))
    except Exception:
        return json_response({"message": "Server error"}, status_code=500)


@app.post("/update-profile")
async def update_profile(payload: Dict[str, Any] = Body(...), request: Request = None):
    email = clean_text(payload.get("email")).lower()
    new_email = clean_text(payload.get("newEmail")).lower() or email
    name = clean_text(payload.get("name"))
    gender = clean_text(payload.get("gender"))
    department = normalize_department(payload.get("department"))
    roll_number = clean_text(payload.get("rollNumber"))
    current_year = clean_text(payload.get("currentYear"))
    raw_interests = payload.get("interests")

    authorized_email = extract_auth_email(request)
    if not authorized_email:
        return json_response({"message": "Unauthorized"}, status_code=401)

    try:
        if authorized_email.lower() != email.lower():
            return json_response({"message": "Forbidden"}, status_code=403)

        if new_email and new_email != email:
            email_exists = await users.find_one({"email": new_email})
            if email_exists:
                return json_response({"message": "Email already in use"}, status_code=409)

        updates = {
            "name": name,
            "email": new_email,
        }
        if "gender" in payload:
            updates["gender"] = gender
        if "department" in payload:
            updates["department"] = department
        if "rollNumber" in payload:
            updates["rollNumber"] = roll_number
        if "currentYear" in payload:
            updates["currentYear"] = current_year
        if raw_interests is not None:
            updates["interests"] = normalize_interests(raw_interests)
        updates = {key: value for key, value in updates.items() if value or key == "interests"}

        updated_user = await users.find_one_and_update(
            {"email": email},
            {"$set": updates},
            return_document=ReturnDocument.AFTER,
        )

        if not updated_user:
            return json_response({"message": "User not found"}, status_code=404)

        participant_updates: Dict[str, Any] = {}
        if new_email != email:
            participant_updates["email"] = new_email
        if name:
            participant_updates["name"] = name
        if "gender" in payload:
            participant_updates["gender"] = gender
        if "department" in payload:
            participant_updates["department"] = department
        if "rollNumber" in payload:
            participant_updates["rollNumber"] = roll_number
        if "currentYear" in payload:
            participant_updates["currentYear"] = current_year

        if participant_updates:
            await participants.update_many({"email": email}, {"$set": participant_updates})
            await feedbacks.update_many(
                {"participantEmail": email},
                {
                    "$set": {
                        "participantEmail": participant_updates.get("email", email),
                        "participantName": participant_updates.get(
                            "name", updated_user.get("name")
                        ),
                    }
                },
            )

        return json_response(
            {
                "message": "Profile updated successfully",
                "user": build_student_profile(updated_user),
                "token": create_auth_token(updated_user),
            }
        )
    except Exception:
        return json_response({"message": "Server error"}, status_code=500)


async def build_organizer_events(username: str) -> List[Dict[str, Any]]:
    await cleanup_expired_events()
    docs = await events.find({"organizerUsername": username}).to_list(length=None)
    formatted = [serialize_event(doc, include_image_field=True) for doc in docs]

    results = []
    for event in formatted:
        feedback_docs = await get_feedback_docs_for_event(event.get("eventName"), username)
        ratings: List[float] = []
        for feedback in feedback_docs:
            rating = feedback.get("rating")
            try:
                ratings.append(float(rating))
            except Exception:
                continue

        rating_sum = sum(ratings) if ratings else 0
        rating_count = len(ratings)
        average_rating = round(rating_sum / rating_count, 1) if rating_count else 0

        participant_count = await participants.count_documents(
            {"eventName": event.get("eventName"), "organizerUsername": username}
        )

        event["averageRating"] = average_rating
        event["ratingSum"] = rating_sum
        event["ratingCount"] = rating_count
        event["feedbackCount"] = len(feedback_docs)
        event["participantCount"] = participant_count
        results.append(event)

    return results


async def build_admin_club_summaries(
    event_summaries: Optional[List[Dict[str, Any]]] = None,
) -> List[Dict[str, Any]]:
    organizers = await org_signins.find({}).to_list(length=None)
    summaries = event_summaries if event_summaries is not None else await get_admin_event_summaries()

    clubs: Dict[str, Dict[str, Any]] = {}

    def ensure_club(name: str) -> Dict[str, Any]:
        club_name = clean_text(name) or "Open to All"
        key = club_name.lower()
        if key not in clubs:
            clubs[key] = {
                "clubAssociation": club_name,
                "totalEvents": 0,
                "upcomingCount": 0,
                "completedCount": 0,
                "pendingEventCount": 0,
                "registeredCount": 0,
                "attendedCount": 0,
                "ratingSum": 0,
                "ratingCount": 0,
                "overallRating": 0,
                "organizers": [],
                "upcomingEvents": [],
                "completedEvents": [],
                "pendingEvents": [],
            }
        return clubs[key]

    for organizer in organizers:
        club = ensure_club(organizer.get("clubAssociation"))
        club["organizers"].append(build_organizer_profile(organizer))

    for event in summaries:
        club = ensure_club(event.get("clubAssociation"))
        event_date = parse_datetime(event.get("eventDate"))
        event_copy = serialize_value(event)

        club["totalEvents"] += 1
        club["ratingSum"] += float(event.get("ratingSum") or 0)
        club["ratingCount"] += int(event.get("ratingCount") or 0)

        participant_count = 0
        try:
            participant_count = int(event.get("participantCount") or 0)
        except Exception:
            participant_count = 0
        club["registeredCount"] += participant_count

        attended_count = 0
        try:
            attended_count = int(event.get("attendedCount") or 0)
        except Exception:
            attended_count = 0

        if normalize_approval_status(event.get("approvalStatus")) != "approved":
            club["pendingEventCount"] += 1
            club["pendingEvents"].append(event_copy)

        if event_date and event_date >= datetime.utcnow():
            club["upcomingCount"] += 1
            club["upcomingEvents"].append(event_copy)
        else:
            club["completedCount"] += 1
            club["attendedCount"] += attended_count
            club["completedEvents"].append(event_copy)

    results = list(clubs.values())
    for club in results:
        rating_count = int(club.get("ratingCount") or 0)
        rating_sum = float(club.get("ratingSum") or 0)
        club["overallRating"] = round(rating_sum / rating_count, 1) if rating_count else 0
        club["upcomingEvents"].sort(
            key=lambda item: parse_datetime(item.get("eventDate")) or datetime.max
        )
        club["completedEvents"].sort(
            key=lambda item: parse_datetime(item.get("eventDate")) or datetime.min,
            reverse=True,
        )
        club["pendingEvents"].sort(
            key=lambda item: parse_datetime(item.get("eventDate")) or datetime.max
        )
        club["organizers"].sort(key=lambda item: item.get("username") or "")

    results.sort(key=lambda item: item.get("clubAssociation") or "")
    return results


@app.get("/admin/dashboard")
async def admin_dashboard():
    try:
        event_summaries = await get_admin_event_summaries()
        organizers = await org_signins.find({}).to_list(length=None)

        now = datetime.utcnow()
        upcoming_events = [
            event for event in event_summaries if is_event_upcoming(event.get("eventDate"))
        ]
        completed_events = [
            event
            for event in event_summaries
            if (parse_datetime(event.get("eventDate")) or now) < now
        ]

        clubs = sorted(
            {
                clean_text(organizer.get("clubAssociation")) or "Open to All"
                for organizer in organizers
            }
            | {
                clean_text(event.get("clubAssociation")) or "Open to All"
                for event in event_summaries
            }
        )

        return json_response(
            {
                "counts": {
                    "upcomingEvents": len(upcoming_events),
                    "completedEvents": len(completed_events),
                    "pendingEvents": sum(
                        1
                        for event in event_summaries
                        if normalize_approval_status(event.get("approvalStatus")) != "approved"
                    ),
                    "pendingOrganizers": sum(
                        1
                        for organizer in organizers
                        if not is_approved_record(organizer)
                    ),
                    "clubs": len(clubs),
                },
                "calendarEvents": event_summaries,
                "upcomingEvents": upcoming_events,
                "completedEvents": sorted(
                    completed_events,
                    key=lambda item: parse_datetime(item.get("eventDate")) or datetime.min,
                    reverse=True,
                ),
                "clubs": clubs,
            }
        )
    except Exception as exc:
        return json_response(
            {"message": "Failed to load admin dashboard", "error": str(exc)},
            status_code=500,
        )


@app.get("/admin/organizers/pending")
async def admin_pending_organizers():
    try:
        docs = await org_signins.find({"approvalStatus": "pending"}).to_list(length=None)
        docs.sort(key=lambda item: item.get("createdAt") or datetime.min)
        return json_response(
            {"count": len(docs), "organizers": [build_organizer_profile(doc) for doc in docs]}
        )
    except Exception as exc:
        return json_response(
            {"message": "Failed to load pending organizers", "error": str(exc)},
            status_code=500,
        )


@app.post("/admin/organizers/{organizer_id}/approve")
async def admin_approve_organizer(organizer_id: str):
    try:
        updated = await org_signins.find_one_and_update(
            {"_id": ObjectId(organizer_id)},
            {"$set": {"approvalStatus": "approved", "approvedAt": datetime.utcnow()}},
            return_document=ReturnDocument.AFTER,
        )
        if not updated:
            return json_response({"message": "Organizer not found"}, status_code=404)

        return json_response(
            {
                "message": "Organizer approved successfully.",
                "organizer": build_organizer_profile(updated),
            }
        )
    except Exception:
        return json_response({"message": "Invalid organizer id"}, status_code=400)


@app.get("/admin/events/pending")
async def admin_pending_events():
    try:
        events_data = await get_admin_event_summaries({"approvalStatus": "pending"})
        return json_response({"count": len(events_data), "events": events_data})
    except Exception as exc:
        return json_response(
            {"message": "Failed to load pending events", "error": str(exc)},
            status_code=500,
        )


@app.post("/admin/events/{event_id}/approve")
async def admin_approve_event(event_id: str):
    try:
        updated = await events.find_one_and_update(
            {"_id": ObjectId(event_id)},
            {"$set": {"approvalStatus": "approved", "approvedAt": datetime.utcnow()}},
            return_document=ReturnDocument.AFTER,
        )
        if not updated:
            return json_response({"message": "Event not found"}, status_code=404)

        return json_response(
            {
                "message": "Event approved successfully.",
                "event": await build_admin_event_summary(updated),
            }
        )
    except Exception:
        return json_response({"message": "Invalid event id"}, status_code=400)


@app.get("/admin/clubs")
async def admin_clubs():
    try:
        event_summaries = await get_admin_event_summaries()
        clubs = await build_admin_club_summaries(event_summaries)
        return json_response({"count": len(clubs), "clubs": clubs})
    except Exception as exc:
        return json_response(
            {"message": "Failed to load club analytics", "error": str(exc)},
            status_code=500,
        )


@app.get("/organizer-events/{username}")
async def organizer_events(username: str):
    try:
        results = await build_organizer_events(username)
        return JSONResponse(content=results)
    except Exception as exc:
        return json_response({"message": "Failed to fetch events", "error": str(exc)}, status_code=500)


@app.get("/events/organizer/{username}")
async def organizer_events_alias(username: str):
    return await organizer_events(username)


@app.get("/participants/count/{username}")
async def participants_count(username: str):
    try:
        count = await participants.count_documents({"organizerUsername": username})
        return json_response({"count": count})
    except Exception:
        return json_response({"message": "Server error"}, status_code=500)


@app.get("/participants/event")
async def participants_for_event(eventName: str, organizerUsername: str):
    if not eventName or not organizerUsername:
        return json_response({"message": "Event name and organizer are required"}, status_code=400)

    try:
        docs = await participants.find(
            {"eventName": eventName, "organizerUsername": organizerUsername}
        ).to_list(length=None)
        return json_response(
            {
                "eventName": eventName,
                "organizerUsername": organizerUsername,
                "count": len(docs),
                "participants": [serialize_value(doc) for doc in docs],
            }
        )
    except Exception as exc:
        return json_response({"message": "Server error", "error": str(exc)}, status_code=500)


@app.get("/feedback/event")
async def feedback_for_event(eventName: str, organizerUsername: str):
    if not eventName or not organizerUsername:
        return json_response({"message": "Event name and organizer are required"}, status_code=400)

    try:
        docs = await get_feedback_docs_for_event(eventName, organizerUsername)
        docs.sort(key=lambda doc: doc.get("createdAt") or datetime.min, reverse=True)

        ratings: List[float] = []
        for doc in docs:
            try:
                ratings.append(float(doc.get("rating")))
            except Exception:
                continue

        rating_count = len(ratings)
        average_rating = round(sum(ratings) / rating_count, 1) if rating_count else 0

        return json_response(
            {
                "eventName": eventName,
                "organizerUsername": organizerUsername,
                "count": len(docs),
                "ratingCount": rating_count,
                "averageRating": average_rating,
                "feedbacks": [serialize_value(doc) for doc in docs],
            }
        )
    except Exception as exc:
        return json_response({"message": "Server error", "error": str(exc)}, status_code=500)


@app.post("/events/{event_id}/completion")
async def event_completion(event_id: str, payload: Dict[str, Any] = Body(...)):
    participants_participated = payload.get("participantsParticipated")
    feedback = payload.get("feedback")

    try:
        participants_participated = int(participants_participated)
    except Exception:
        return json_response(
            {"message": "participantsParticipated must be a number"}, status_code=400
        )

    if participants_participated < 0 or feedback is None or str(feedback).strip() == "":
        return json_response(
            {"message": "Participants count and feedback are required"}, status_code=400
        )

    try:
        updated = await events.find_one_and_update(
            {"_id": ObjectId(event_id)},
            {
                "$set": {
                    "completion": {
                        "participantsParticipated": participants_participated,
                        "feedback": str(feedback).strip(),
                        "completedAt": datetime.utcnow(),
                    }
                }
            },
            return_document=ReturnDocument.AFTER,
        )

        if not updated:
            return json_response({"message": "Event not found"}, status_code=404)

        return json_response({"message": "Completion saved", "event": serialize_event(updated, False)})
    except Exception as exc:
        return json_response({"message": "Server error", "error": str(exc)}, status_code=500)


@app.delete("/events/{event_id}")
async def delete_event(event_id: str):
    try:
        event = await events.find_one({"_id": ObjectId(event_id)})
        if not event:
            return json_response({"message": "Event not found"}, status_code=404)

        await events.delete_one({"_id": event["_id"]})
        await participants.delete_many(
            {"eventName": event.get("eventName"), "organizerUsername": event.get("organizerUsername")}
        )
        await feedbacks.delete_many({"eventName": event.get("eventName")})

        return json_response({"message": "Event deleted successfully"})
    except Exception:
        return json_response({"message": "Server error"}, status_code=500)


if IMAGE_DIR.exists():
    app.mount("/image", StaticFiles(directory=str(IMAGE_DIR)), name="image")

if FRONTEND_DIR.exists():
    # Serve all static frontend assets (landing, student, organizer, admin, public) from one root.
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIR)), name="frontend")


if __name__ == "__main__":
    import uvicorn

    # When executed as a script (python backend/main.py), import path is just "main".
    uvicorn.run("main:app", host="0.0.0.0", port=PORT, reload=True)
