"""FastAPI app. Run: uvicorn keel.api:app --reload --port 8000"""

from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from . import clinic, live, story

app = FastAPI(title="Keel", version="0.1")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


class CheckIn(BaseModel):
    answers: list[float] = Field(..., min_length=5, max_length=5)
    done: list[str] = []


class Action(BaseModel):
    action: str


@app.get("/api/health")
def health():
    return {"ok": True}


@app.get("/api/story")
def get_story():
    return story.build()


@app.get("/api/live")
def get_live():
    return live.snapshot()


@app.post("/api/live/checkin")
def post_checkin(body: CheckIn):
    return live.checkin(body.answers, body.done)


@app.post("/api/live/reset")
def post_reset():
    return live.reset()


@app.get("/api/clinic")
def get_clinic():
    return clinic.roster()


@app.get("/api/clinic/{pid}")
def get_clinic_detail(pid: str):
    try:
        return clinic.detail(pid)
    except KeyError:
        raise HTTPException(404, "unknown patient")


@app.post("/api/clinic/{pid}/action")
def post_action(pid: str, body: Action):
    return clinic.act(pid, body.action)


@app.on_event("startup")
def warm():
    story.build()
    clinic.roster()
    live.reset()


# serve the built frontend if present (single-command demo)
_dist = Path(__file__).resolve().parents[2] / "frontend" / "dist"
if _dist.exists():
    app.mount("/", StaticFiles(directory=_dist, html=True), name="ui")
