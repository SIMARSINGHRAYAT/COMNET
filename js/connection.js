/* ============================================
   ComNet Simulator - Connection / Cable System
   ============================================ */

class Connection {
    constructor(deviceA_Id, interfaceA_Name, deviceB_Id, interfaceB_Name, cableType = 'ethernet') {
        this.id = 'conn_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 6);
        this.deviceA = deviceA_Id;
        this.interfaceA = interfaceA_Name;
        this.deviceB = deviceB_Id;
        this.interfaceB = interfaceB_Name;
        this.cableType = cableType; // ethernet, crossover, fiber, serial, console
        this.status = 'up'; // up, down
        this.selected = false;

        // Visual
        this.color = this._getCableColor();
        this.lineWidth = 2;
    }

    _getCableColor() {
        const colors = {
            'ethernet': '#6c7086',
            'crossover': '#f38ba8',
            'fiber': '#f9e2af',
            'serial': '#f38ba8',
            'console': '#89b4fa'
        };
        return colors[this.cableType] || '#6c7086';
    }

    // Check if cable type is compatible with interface types
    static isCompatible(cableType, ifaceTypeA, ifaceTypeB) {
        const compat = {
            'ethernet': ['ethernet'],
            'crossover': ['ethernet'],
            'fiber': ['ethernet'],
            'serial': ['serial'],
            'console': ['console']
        };
        const allowed = compat[cableType] || [];
        return allowed.includes(ifaceTypeA) && allowed.includes(ifaceTypeB);
    }

    // Auto-select best cable type
    static autoCableType(deviceA, deviceB) {
        const typeA = deviceA.type;
        const typeB = deviceB.type;

        // Same layer devices need crossover
        const switchLike = ['switch', 'hub', 'bridge'];
        const routerLike = ['router', 'firewall'];
        const endDevice = ['pc', 'laptop', 'server', 'printer', 'smartphone'];

        if (switchLike.includes(typeA) && switchLike.includes(typeB)) return 'crossover';
        if (routerLike.includes(typeA) && routerLike.includes(typeB)) return 'crossover';
        if (endDevice.includes(typeA) && endDevice.includes(typeB)) return 'crossover';

        return 'ethernet';
    }

    involves(deviceId) {
        return this.deviceA === deviceId || this.deviceB === deviceId;
    }

    getOtherDevice(deviceId) {
        if (this.deviceA === deviceId) return { deviceId: this.deviceB, interfaceName: this.interfaceB };
        if (this.deviceB === deviceId) return { deviceId: this.deviceA, interfaceName: this.interfaceA };
        return null;
    }

    getOtherInterface(deviceId) {
        if (this.deviceA === deviceId) return this.interfaceB;
        if (this.deviceB === deviceId) return this.interfaceA;
        return null;
    }

    getInterfaceForDevice(deviceId) {
        if (this.deviceA === deviceId) return this.interfaceA;
        if (this.deviceB === deviceId) return this.interfaceB;
        return null;
    }

    serialize() {
        return {
            id: this.id,
            deviceA: this.deviceA,
            interfaceA: this.interfaceA,
            deviceB: this.deviceB,
            interfaceB: this.interfaceB,
            cableType: this.cableType,
            status: this.status
        };
    }

    static deserialize(data) {
        const conn = new Connection(
            data.deviceA, data.interfaceA,
            data.deviceB, data.interfaceB,
            data.cableType
        );
        conn.id = data.id;
        conn.status = data.status;
        conn.color = conn._getCableColor();
        return conn;
    }
}

// Connection Manager
class ConnectionManager {
    constructor() {
        this.connections = [];
    }

    add(connection) {
        this.connections.push(connection);
        return connection;
    }

    remove(connectionId) {
        const idx = this.connections.findIndex(c => c.id === connectionId);
        if (idx !== -1) {
            return this.connections.splice(idx, 1)[0];
        }
        return null;
    }

    getByDevice(deviceId) {
        return this.connections.filter(c => c.involves(deviceId));
    }

    getByInterface(deviceId, interfaceName) {
        return this.connections.find(c =>
            (c.deviceA === deviceId && c.interfaceA === interfaceName) ||
            (c.deviceB === deviceId && c.interfaceB === interfaceName)
        );
    }

    findAtPoint(px, py, devices, threshold = 8) {
        for (const conn of this.connections) {
            const devA = devices.get(conn.deviceA);
            const devB = devices.get(conn.deviceB);
            if (!devA || !devB) continue;

            const dist = Utils.pointToSegmentDist(
                px, py,
                devA.getCenterX(), devA.getCenterY(),
                devB.getCenterX(), devB.getCenterY()
            );
            if (dist < threshold) return conn;
        }
        return null;
    }

    getAll() {
        return this.connections;
    }

    clear() {
        this.connections = [];
    }

    serialize() {
        return this.connections.map(c => c.serialize());
    }

    deserialize(dataArray) {
        this.connections = dataArray.map(d => Connection.deserialize(d));
    }
}
