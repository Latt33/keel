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
        for _ in range(4):
            s = c.post("/api/live/checkin", json={"answers": [2, 2, 1.5, 2, 1.5], "done": []}).json()
            risks.append(s["risk"])
        assert max(risks[1:]) > risks[0]
        assert s["alert"], "four bad days in her hard week should reach the clinic"
