/* ComNet - Connection Management */

class Connection {
    constructor(deviceA, interfaceA, deviceB, interfaceB, cableType = 'copper-straight') {
        this.id = 'conn-' + Math.random().toString(36).slice(2, 11);
        this.deviceA = deviceA; this.interfaceA = interfaceA;
        this.deviceB = deviceB; this.interfaceB = interfaceB;
        this.cableType = cableType; this.selected = false;
    }
    getOtherDevice(devId) {
        return devId === this.deviceA
            ? { deviceId: this.deviceB, iface: this.interfaceB }
            : { deviceId: this.deviceA, iface: this.interfaceA };
    }
    getStyle() { return DeviceCatalog.cableStyles[this.cableType] || { color:'#6c7086', width:2, dash:[] }; }
    serialize() { return { id:this.id, deviceA:this.deviceA, interfaceA:this.interfaceA, deviceB:this.deviceB, interfaceB:this.interfaceB, cableType:this.cableType }; }
    static deserialize(d) { const c = new Connection(d.deviceA,d.interfaceA,d.deviceB,d.interfaceB,d.cableType); c.id = d.id; return c; }
}

class ConnectionManager {
    constructor() { this.connections = new Map(); }
    add(conn) { this.connections.set(conn.id, conn); }
    remove(id) { this.connections.delete(id); }
    toArray() { return [...this.connections.values()]; }
    getByDevice(devId) { return this.toArray().filter(c => c.deviceA === devId || c.deviceB === devId); }
    getByInterface(devId, ifName) { return this.toArray().find(c => (c.deviceA === devId && c.interfaceA === ifName) || (c.deviceB === devId && c.interfaceB === ifName)); }
    isInterfaceConnected(devId, ifName) { return !!this.getByInterface(devId, ifName); }

    createConnection(devA, ifaceA, devB, ifaceB, cableType) {
        if (this.isInterfaceConnected(devA.id, ifaceA.name) || this.isInterfaceConnected(devB.id, ifaceB.name)) return null;
        const conn = new Connection(devA.id, ifaceA.name, devB.id, ifaceB.name, cableType);
        ifaceA.connect(devB.id, ifaceB.name);
        ifaceB.connect(devA.id, ifaceA.name);
        this.add(conn);
        return conn;
    }

    disconnect(connId, devices) {
        const conn = this.connections.get(connId);
        if (!conn) return;
        const dA = devices.get(conn.deviceA), dB = devices.get(conn.deviceB);
        if (dA) { const i = dA.getInterface(conn.interfaceA); if (i) i.disconnect(); }
        if (dB) { const i = dB.getInterface(conn.interfaceB); if (i) i.disconnect(); }
        this.remove(connId);
    }

    removeByDevice(devId, devices) {
        for (const c of this.getByDevice(devId)) {
            // Clean up peer device interfaces
            if (devices) {
                const peerId = c.deviceA === devId ? c.deviceB : c.deviceA;
                const peerIfName = c.deviceA === devId ? c.interfaceB : c.interfaceA;
                const peer = devices.get(peerId);
                if (peer) { const iface = peer.getInterface(peerIfName); if (iface) iface.disconnect(); }
            }
            this.connections.delete(c.id);
        }
    }

    hitTest(x, y, devices, threshold = 8) {
        for (const conn of this.toArray()) {
            const dA = devices.get(conn.deviceA), dB = devices.get(conn.deviceB);
            if (!dA || !dB) continue;
            const ax = dA.getCenterX(), ay = dA.getCenterY(), bx = dB.getCenterX(), by = dB.getCenterY();
            const dx = bx-ax, dy = by-ay, len2 = dx*dx+dy*dy;
            if (len2 < 1) continue;
            const t = Utils.clamp(((x-ax)*dx+(y-ay)*dy)/len2, 0, 1);
            const px = ax+t*dx, py = ay+t*dy;
            if (Math.hypot(x-px, y-py) < threshold) return conn;
        }
        return null;
    }

    serialize() { return this.toArray().map(c => c.serialize()); }
    deserialize(data) { this.connections.clear(); for (const d of (data||[])) this.add(Connection.deserialize(d)); }
}
