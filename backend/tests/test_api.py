from fastapi.testclient import TestClient

from keel.api import app


def test_story_clinic_and_live_loop():
    with TestClient(app) as c:
        st = c.get("/api/story").json()
        ev = st["events"]
        assert ev["alert"] is not None and ev["relapse_without"] is not None
        assert ev["alert"] < ev["relapse_without"], "the warning must come before the untreated relapse"
        assert len(st["keel"]) == 180 and len(st["tms"]) == 42

        rows = c.get("/api/clinic").json()
        assert rows[0]["status"] == "act"
        assert any(r["name"].startswith("Aino") and r["status"] == "act" for r in rows)
        assert "learned" in c.get(f"/api/clinic/{rows[0]['id']}").json()

        s0 = c.post("/api/live/reset").json()
        risks = [s0["risk"]]
        s = s0
        for _ in range(5):
            ans = {k: (0 if k == "safety" else 2) for k in s["questions"]}
            s = c.post("/api/live/checkin", json={"answers": ans, "done": []}).json()
            risks.append(s["risk"])
        assert not s["safety"]
        assert max(risks[1:]) > risks[0]
        assert s["alert"], "five hard days in her hard week should reach the clinic"


def test_items_cover_bdi_structure_and_safety_path():
    from keel import items
    assert len(items.ITEMS) == 21 and all(len(st) == 4 for *_, st in items.ITEMS)
    assert all(st[0].lower().find("usual") >= 0 or "haven" in st[0] or "don" in st[0] for *_, st in items.ITEMS)
    with TestClient(app) as c:
        c.post("/api/live/reset")
        s = c.post("/api/live/checkin", json={"answers": {"safety": 1}, "done": []}).json()
        assert s["safety"]
