"""
ComNet Network Simulator — Python FastAPI Backend
Topology CRUD, WebSocket real-time sync, server-side simulation engine.
"""

import json, os, uuid, asyncio, re
from pathlib import Path
from datetime import datetime
from typing import Any, Optional

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel

app = FastAPI(title="ComNet Network Simulator", version="3.0.0")

TOPOLOGIES_DIR = Path("topologies")
TOPOLOGIES_DIR.mkdir(exist_ok=True)

# ─── Helpers ───────────────────────────────────────────────
def sanitize(name: str) -> str:
    clean = re.sub(r'[^a-zA-Z0-9_\-]', '_', str(name))[:100]
    # Prevent path traversal
    clean = clean.strip('.').strip('_') or 'unnamed'
    return clean

# ─── Topology CRUD ─────────────────────────────────────────
@app.get("/api/topologies")
async def list_topologies():
    files = sorted(TOPOLOGIES_DIR.glob("*.comnet"), key=lambda f: f.stat().st_mtime, reverse=True)
    result = []
    for f in files:
        try:
            data = json.loads(f.read_text("utf-8"))
            result.append({
                "id": f.stem,
                "name": data.get("name", f.stem),
                "devices": len(data.get("devices", [])),
                "connections": len(data.get("connections", [])),
                "modified": datetime.fromtimestamp(f.stat().st_mtime).isoformat(),
                "size": f.stat().st_size,
            })
        except Exception:
            result.append({"id": f.stem, "name": f.stem, "devices": 0, "connections": 0})
    return {"topologies": result}

@app.post("/api/topologies")
async def save_topology(request: Request):
    body = await request.json()
    tid = body.get("id") or str(uuid.uuid4())
    name = sanitize(body.get("name", tid))
    body["id"] = tid
    body["savedAt"] = datetime.utcnow().isoformat()
    (TOPOLOGIES_DIR / f"{name}.comnet").write_text(json.dumps(body, indent=2), "utf-8")
    return {"success": True, "id": tid, "filename": f"{name}.comnet"}

@app.get("/api/topologies/{tid}")
async def load_topology(tid: str):
    safe = sanitize(tid)
    fp = TOPOLOGIES_DIR / f"{safe}.comnet"
    if not fp.exists():
        raise HTTPException(404, "Topology not found")
    return json.loads(fp.read_text("utf-8"))

@app.put("/api/topologies/{tid}")
async def update_topology(tid: str, request: Request):
    body = await request.json()
    safe = sanitize(tid)
    body["id"] = tid
    body["savedAt"] = datetime.utcnow().isoformat()
    (TOPOLOGIES_DIR / f"{safe}.comnet").write_text(json.dumps(body, indent=2), "utf-8")
    return {"success": True}

@app.delete("/api/topologies/{tid}")
async def delete_topology(tid: str):
    safe = sanitize(tid)
    fp = TOPOLOGIES_DIR / f"{safe}.comnet"
    if fp.exists():
        fp.unlink()
    return {"success": True}

# ─── Simulation Engine ─────────────────────────────────────
class SimEngine:
    """Server-side packet simulation on topology snapshots."""

    @staticmethod
    def build_maps(topo: dict):
        devices = {}
        for d in topo.get("devices", []):
            devices[d["id"]] = d
        conns = topo.get("connections", [])
        adj: dict[str, list] = {}
        for c in conns:
            adj.setdefault(c["deviceA"], []).append(c)
            adj.setdefault(c["deviceB"], []).append(c)
        return devices, conns, adj

    @staticmethod
    def find_device_by_ip(devices: dict, ip: str):
        for did, d in devices.items():
            for iface in d.get("interfaces", []):
                if iface.get("ipAddress") == ip:
                    return d
        return None

    @staticmethod
    def get_peer(conn: dict, device_id: str) -> tuple:
        if conn["deviceA"] == device_id:
            return conn["deviceB"], conn.get("interfaceB")
        return conn["deviceA"], conn.get("interfaceA")

    @classmethod
    def trace_path(cls, topo: dict, src_id: str, dst_ip: str, ttl: int = 64):
        devices, conns, adj = cls.build_maps(topo)
        source = devices.get(src_id)
        if not source:
            return {"success": False, "message": "Source not found", "hops": []}

        hops, visited = [], set()
        current = source

        while ttl > 0:
            ttl -= 1
            if current["id"] in visited:
                return {"success": False, "message": "Routing loop", "hops": hops}
            visited.add(current["id"])
            hops.append({"deviceId": current["id"], "name": current.get("name", "?")})

            # Check if destination reached
            for iface in current.get("interfaces", []):
                if iface.get("ipAddress") == dst_ip:
                    return {"success": True, "hops": hops, "ttl": 64 - ttl}

            # Find next hop via routing table or adjacency
            next_id = None
            for route in current.get("routingTable", []):
                if cls._ip_in_network(dst_ip, route.get("network", ""), route.get("mask", "")):
                    # Find the interface's connected device
                    for c in adj.get(current["id"], []):
                        peer_id, _ = cls.get_peer(c, current["id"])
                        peer = devices.get(peer_id)
                        if not peer or peer_id in visited:
                            continue
                        # Check if peer has the next-hop IP or can forward
                        for pi in peer.get("interfaces", []):
                            if pi.get("ipAddress") == route.get("nextHop"):
                                next_id = peer_id
                                break
                        if next_id:
                            break
                if next_id:
                    break

            if not next_id:
                # Fall back to adjacency traversal
                for c in adj.get(current["id"], []):
                    peer_id, _ = cls.get_peer(c, current["id"])
                    if peer_id in visited:
                        continue
                    peer = devices.get(peer_id)
                    if not peer:
                        continue
                    # Destination on this peer?
                    for pi in peer.get("interfaces", []):
                        if pi.get("ipAddress") == dst_ip:
                            next_id = peer_id
                            break
                    if next_id:
                        break
                    # L2/L3 forwarding device?
                    if peer.get("type") in ("router", "switch", "hub", "bridge", "l3switch", "firewall"):
                        next_id = peer_id
                        break

            if not next_id:
                return {"success": False, "message": f"No route from {current.get('name')}", "hops": hops}

            current = devices.get(next_id)
            if not current:
                break

        return {"success": False, "message": "TTL expired", "hops": hops}

    @staticmethod
    def _ip_to_int(ip: str) -> int:
        parts = ip.split(".")
        if len(parts) != 4:
            return 0
        try:
            return sum(int(p) << (24 - 8 * i) for i, p in enumerate(parts))
        except ValueError:
            return 0

    @classmethod
    def _ip_in_network(cls, ip: str, network: str, mask: str) -> bool:
        if not network or not mask:
            return False
        return (cls._ip_to_int(ip) & cls._ip_to_int(mask)) == (cls._ip_to_int(network) & cls._ip_to_int(mask))

    @classmethod
    def dhcp_assign(cls, topo: dict, client_id: str):
        """Find a DHCP server and assign an IP."""
        devices, _, adj = cls.build_maps(topo)
        client = devices.get(client_id)
        if not client:
            return {"success": False, "message": "Client not found"}
        for did, d in devices.items():
            svcs = d.get("services", {})
            dhcp = svcs.get("dhcp", {})
            if not dhcp.get("enabled"):
                continue
            pool_start = dhcp.get("poolStart", "192.168.1.100")
            pool_end = dhcp.get("poolEnd", "192.168.1.200")
            gateway = dhcp.get("gateway", "192.168.1.1")
            dns = dhcp.get("dns", "8.8.8.8")
            mask = dhcp.get("mask", "255.255.255.0")
            # Simple: assign a random IP from pool
            start_int = cls._ip_to_int(pool_start)
            end_int = cls._ip_to_int(pool_end)
            import random
            assigned_int = random.randint(start_int, end_int)
            parts = [(assigned_int >> (24 - 8 * i)) & 0xFF for i in range(4)]
            assigned_ip = ".".join(map(str, parts))
            return {
                "success": True, "ip": assigned_ip, "mask": mask,
                "gateway": gateway, "dns": dns, "server": d.get("name"),
            }
        return {"success": False, "message": "No DHCP server found"}

    @classmethod
    def dns_lookup(cls, topo: dict, domain: str):
        devices, _, _ = cls.build_maps(topo)
        for did, d in devices.items():
            svcs = d.get("services", {})
            dns = svcs.get("dns", {})
            if not dns.get("enabled"):
                continue
            for rec in dns.get("records", []):
                if rec.get("name") == domain:
                    return {"success": True, "ip": rec.get("address"), "server": d.get("name")}
        return {"success": False, "message": f"DNS: {domain} not found"}

# ─── Simulation API endpoints ──────────────────────────────
@app.post("/api/simulate/ping")
async def simulate_ping(request: Request):
    body = await request.json()
    topo = body.get("topology", {})
    result = SimEngine.trace_path(topo, body.get("sourceId", ""), body.get("destIP", ""))
    return result

@app.post("/api/simulate/traceroute")
async def simulate_traceroute(request: Request):
    body = await request.json()
    topo = body.get("topology", {})
    result = SimEngine.trace_path(topo, body.get("sourceId", ""), body.get("destIP", ""), ttl=30)
    return result

@app.post("/api/simulate/dhcp")
async def simulate_dhcp(request: Request):
    body = await request.json()
    return SimEngine.dhcp_assign(body.get("topology", {}), body.get("clientId", ""))

@app.post("/api/simulate/dns")
async def simulate_dns(request: Request):
    body = await request.json()
    return SimEngine.dns_lookup(body.get("topology", {}), body.get("domain", ""))

# ─── WebSocket ─────────────────────────────────────────────
ws_clients: dict[str, dict] = {}

@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()
    cid = str(uuid.uuid4())
    ws_clients[cid] = {"ws": ws, "topology": None}
    await ws.send_json({"type": "connected", "clientId": cid})

    try:
        while True:
            data = await ws.receive_json()
            msg_type = data.get("type")

            if msg_type == "join-topology":
                ws_clients[cid]["topology"] = data.get("topologyId")

            elif msg_type == "simulation-event":
                await _broadcast(ws_clients[cid]["topology"], {
                    "type": "simulation-event", "event": data.get("event"), "senderId": cid
                }, exclude=cid)

            elif msg_type == "topology-update":
                await _broadcast(ws_clients[cid]["topology"], {
                    "type": "topology-update", "update": data.get("update"), "senderId": cid
                }, exclude=cid)

            elif msg_type == "packet-trace":
                result = SimEngine.trace_path(
                    data.get("topology", {}), data.get("sourceId", ""), data.get("destIP", "")
                )
                await ws.send_json({"type": "packet-trace-result", "traceId": data.get("traceId"), "result": result})

    except WebSocketDisconnect:
        pass
    finally:
        ws_clients.pop(cid, None)

async def _broadcast(topo_id: str | None, msg: dict, exclude: str = ""):
    if not topo_id:
        return
    for cid, info in list(ws_clients.items()):
        if cid != exclude and info["topology"] == topo_id:
            try:
                await info["ws"].send_json(msg)
            except Exception:
                ws_clients.pop(cid, None)

# ─── Static files (MUST be last) ──────────────────────────
app.mount("/", StaticFiles(directory="public", html=True), name="static")

# ─── Entry point ───────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    print("""
╔══════════════════════════════════════════════╗
║                                              ║
║          ComNet Network Simulator v3         ║
║          ────────────────────────            ║
║   Python + FastAPI Backend                   ║
║   http://localhost:3000                      ║
║   WebSocket: ws://localhost:3000/ws          ║
║                                              ║
╚══════════════════════════════════════════════╝
""")
    uvicorn.run(app, host="0.0.0.0", port=3000, log_level="info")
