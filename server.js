/* ============================================
   ComNet Simulator - Node.js Backend Server
   Express + WebSocket for real-time simulation
   ============================================ */

const express = require('express');
const http = require('http');
const { WebSocketServer, WebSocket } = require('ws');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 3000;
const TOPOLOGIES_DIR = path.join(__dirname, 'topologies');

// Ensure topologies directory exists
if (!fs.existsSync(TOPOLOGIES_DIR)) {
    fs.mkdirSync(TOPOLOGIES_DIR, { recursive: true });
}

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// === REST API ===

// List saved topologies
app.get('/api/topologies', (req, res) => {
    try {
        const files = fs.readdirSync(TOPOLOGIES_DIR)
            .filter(f => f.endsWith('.comnet'))
            .map(f => {
                const filePath = path.join(TOPOLOGIES_DIR, f);
                const stat = fs.statSync(filePath);
                let meta = { name: f.replace('.comnet', ''), devices: 0, connections: 0 };
                try {
                    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                    meta.devices = data.devices ? data.devices.length : 0;
                    meta.connections = data.connections ? data.connections.length : 0;
                    meta.name = data.name || meta.name;
                } catch (e) { /* ignore parse errors */ }
                return {
                    id: f.replace('.comnet', ''),
                    filename: f,
                    ...meta,
                    modified: stat.mtime.toISOString(),
                    size: stat.size
                };
            });
        res.json({ topologies: files });
    } catch (err) {
        res.status(500).json({ error: 'Failed to list topologies' });
    }
});

// Save topology
app.post('/api/topologies', (req, res) => {
    try {
        const topology = req.body;
        const id = topology.id || uuidv4();
        const filename = `${sanitizeFilename(topology.name || id)}.comnet`;
        topology.id = id;
        topology.savedAt = new Date().toISOString();

        fs.writeFileSync(
            path.join(TOPOLOGIES_DIR, filename),
            JSON.stringify(topology, null, 2),
            'utf8'
        );
        res.json({ success: true, id, filename });
    } catch (err) {
        res.status(500).json({ error: 'Failed to save topology' });
    }
});

// Load topology
app.get('/api/topologies/:id', (req, res) => {
    try {
        const id = sanitizeFilename(req.params.id);
        const filename = `${id}.comnet`;
        const filePath = path.join(TOPOLOGIES_DIR, filename);

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'Topology not found' });
        }

        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: 'Failed to load topology' });
    }
});

// Delete topology
app.delete('/api/topologies/:id', (req, res) => {
    try {
        const id = sanitizeFilename(req.params.id);
        const filename = `${id}.comnet`;
        const filePath = path.join(TOPOLOGIES_DIR, filename);

        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete topology' });
    }
});

// Auto-save endpoint
app.put('/api/topologies/:id', (req, res) => {
    try {
        const id = sanitizeFilename(req.params.id);
        const filename = `${id}.comnet`;
        const topology = req.body;
        topology.id = id;
        topology.savedAt = new Date().toISOString();

        fs.writeFileSync(
            path.join(TOPOLOGIES_DIR, filename),
            JSON.stringify(topology, null, 2),
            'utf8'
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to auto-save topology' });
    }
});

// === WebSocket for real-time simulation events ===
const clients = new Map();

wss.on('connection', (ws) => {
    const clientId = uuidv4();
    clients.set(clientId, { ws, topologyId: null });

    ws.send(JSON.stringify({ type: 'connected', clientId }));

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            handleWSMessage(clientId, data);
        } catch (e) {
            ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' }));
        }
    });

    ws.on('close', () => {
        clients.delete(clientId);
    });
});

function handleWSMessage(clientId, data) {
    const client = clients.get(clientId);
    if (!client) return;

    switch (data.type) {
        case 'join-topology':
            client.topologyId = data.topologyId;
            break;

        case 'simulation-event':
            // Broadcast simulation events to all clients in same topology
            broadcast(client.topologyId, {
                type: 'simulation-event',
                event: data.event,
                senderId: clientId
            }, clientId);
            break;

        case 'packet-trace':
            // Server-side packet trace computation
            client.ws.send(JSON.stringify({
                type: 'packet-trace-result',
                traceId: data.traceId,
                result: computePacketTrace(data.topology, data.sourceId, data.destIP)
            }));
            break;

        case 'topology-update':
            broadcast(client.topologyId, {
                type: 'topology-update',
                update: data.update,
                senderId: clientId
            }, clientId);
            break;
    }
}

function broadcast(topologyId, message, excludeClientId) {
    if (!topologyId) return;
    const msgStr = JSON.stringify(message);
    for (const [id, client] of clients) {
        if (id !== excludeClientId && client.topologyId === topologyId && client.ws.readyState === WebSocket.OPEN) {
            client.ws.send(msgStr);
        }
    }
}

// Server-side packet trace for complex topologies
function computePacketTrace(topology, sourceId, destIP) {
    if (!topology || !topology.devices || !topology.connections) {
        return { success: false, message: 'Invalid topology data' };
    }

    const devices = new Map();
    for (const d of topology.devices) {
        devices.set(d.id, d);
    }

    const source = devices.get(sourceId);
    if (!source) return { success: false, message: 'Source device not found' };

    const hops = [];
    const visited = new Set();
    let current = source;
    let ttl = 64;

    while (ttl > 0) {
        ttl--;
        if (visited.has(current.id)) {
            return { success: false, message: 'Routing loop detected', hops };
        }
        visited.add(current.id);
        hops.push({ deviceId: current.id, deviceName: current.name });

        // Check if destination reached
        const hasIP = current.interfaces && current.interfaces.some(i => i.ipAddress === destIP);
        if (hasIP) return { success: true, hops };

        // Find next hop
        let nextDeviceId = null;
        for (const iface of (current.interfaces || [])) {
            if (!iface.connectedTo) continue;
            const conn = topology.connections.find(c =>
                (c.deviceA === current.id && c.interfaceA === iface.name) ||
                (c.deviceB === current.id && c.interfaceB === iface.name)
            );
            if (!conn) continue;

            const otherId = conn.deviceA === current.id ? conn.deviceB : conn.deviceA;
            const otherDev = devices.get(otherId);
            if (!otherDev || visited.has(otherId)) continue;

            // Check if other device has the dest IP or can route
            const otherHasIP = otherDev.interfaces && otherDev.interfaces.some(i => i.ipAddress === destIP);
            if (otherHasIP) {
                nextDeviceId = otherId;
                break;
            }

            if (otherDev.type === 'router' || otherDev.type === 'firewall') {
                nextDeviceId = otherId;
                break;
            }

            if (otherDev.type === 'switch' || otherDev.type === 'hub' || otherDev.type === 'bridge') {
                nextDeviceId = otherId;
                break;
            }
        }

        if (!nextDeviceId) {
            return { success: false, message: `No path from ${current.name}`, hops };
        }

        current = devices.get(nextDeviceId);
        if (!current) break;
    }

    return { success: false, message: 'TTL expired', hops };
}

function sanitizeFilename(name) {
    return String(name).replace(/[^a-zA-Z0-9_\-\.]/g, '_').substring(0, 100);
}

// Serve the frontend
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

server.listen(PORT, () => {
    console.log(`
╔══════════════════════════════════════════════╗
║                                              ║
║          ComNet Network Simulator            ║
║          ─────────────────────────           ║
║                                              ║
║   Server running at:                         ║
║   http://localhost:${String(PORT).padEnd(27)}║
║                                              ║
║   WebSocket: ws://localhost:${String(PORT).padEnd(19)}║
║                                              ║
╚══════════════════════════════════════════════╝
`);
});
