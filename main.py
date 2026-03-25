from backend.main import PORT  # loads .env
import uvicorn


if __name__ == "__main__":
    uvicorn.run("backend.main:app", host="0.0.0.0", port=PORT, reload=True)
