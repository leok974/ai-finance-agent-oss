import json
from typing import Dict, Any
from sqlalchemy import text
from app.db import SessionLocal, engine


def store_event(rec: Dict[str, Any]) -> None:
    """Synchronous insert using existing SessionLocal.
    Called off-thread via run_in_executor to avoid blocking the event loop.
    """
    try:
        db = SessionLocal()
        try:
            is_pg = engine.url.get_backend_name() == "postgresql"
            if is_pg:
                q = text(
                    """
                    INSERT INTO analytics_events
                      (event, props_json, client_ts, server_ts, rid, path, ip, ua)
                    VALUES
                      (:event, :props_json, :client_ts,
                       COALESCE(:server_ts, (extract(epoch from now())*1000)::bigint),
                       :rid, :path, :ip::inet, :ua)
                    """
                )
            else:
                q = text(
                    """
                    INSERT INTO analytics_events
                      (event, props_json, client_ts, server_ts, rid, path, ip, ua)
                    VALUES
                      (:event, :props_json, :client_ts, :server_ts, :rid, :path, :ip, :ua)
                    """
                )
            db.execute(q, {
                "event": rec.get("event"),
                "props_json": json.dumps(rec.get("props") or {}, ensure_ascii=False),
                "client_ts": rec.get("client_ts"),
                "server_ts": rec.get("server_ts"),
                "rid": rec.get("rid"),
                "path": rec.get("path"),
                "ip": rec.get("ip"),
                "ua": rec.get("ua"),
            })
            db.commit()
        finally:
            db.close()
    except Exception:
        # Swallow errors to ensure analytics never breaks main flow
        pass
