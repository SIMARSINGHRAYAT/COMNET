/* ============================================
   ComNet Simulator - Device Models
   ============================================ */

// Interface / Port definition
class NetworkInterface {
    constructor(name, type = 'ethernet', speed = '100Mbps') {
        this.name = name;
        this.type = type;        // ethernet, serial, wireless, console
        this.speed = speed;
        this.macAddress = Utils.generateMAC();
        this.ipAddress = '';
        this.subnetMask = '255.255.255.0';
        this.defaultGateway = '';
        this.dnsServer = '';
        this.dhcpEnabled = false;
        this.status = 'down';    // up, down
        this.connectedTo = null; // { deviceId, interfaceName }
        this.bandwidth = speed;
        this.duplex = 'auto';
        this.vlan = 1;
        this.description = '';
        this.clockRate = 64000; // for serial
    }

    isConnected() {
        return this.connectedTo !== null;
    }

    isUp() {
        return this.status === 'up';
    }

    getIPConfig() {
        return {
            ip: this.ipAddress,
            mask: this.subnetMask,
            gateway: this.defaultGateway,
            dns: this.dnsServer,
            mac: this.macAddress,
            dhcp: this.dhcpEnabled
        };
    }

    serialize() {
        return {
            name: this.name,
            type: this.type,
            speed: this.speed,
            macAddress: this.macAddress,
            ipAddress: this.ipAddress,
            subnetMask: this.subnetMask,
            defaultGateway: this.defaultGateway,
            dnsServer: this.dnsServer,
            dhcpEnabled: this.dhcpEnabled,
            status: this.status,
            connectedTo: this.connectedTo,
            bandwidth: this.bandwidth,
            duplex: this.duplex,
            vlan: this.vlan,
            description: this.description,
            clockRate: this.clockRate
        };
    }

    static deserialize(data) {
        const iface = new NetworkInterface(data.name, data.type, data.speed);
        Object.assign(iface, data);
        return iface;
    }
}

// Base Device class
class NetworkDevice {
    constructor(type, x, y) {
        this.id = Utils.generateId();
        this.type = type;
        this.name = Utils.generateDisplayName(type);
        this.x = x;
        this.y = y;
        this.width = 60;
        this.height = 60;
        this.interfaces = [];
        this.powered = true;
        this.selected = false;
        this.hostname = this.name;
        this.notes = '';

        // ARP / MAC table
        this.arpTable = new Map();   // IP -> MAC
        this.macTable = new Map();   // MAC -> interface name (for switches)

        // Routing table for routers
        this.routingTable = [];

        // DHCP
        this.dhcpServer = null;

        // Drawing
        this.color = '#89b4fa';
        this.icon = 'fa-desktop';
        this.iconSize = 24;

        this._initInterfaces();
    }

    _initInterfaces() {
        // Override in subclasses
    }

    getInterface(name) {
        return this.interfaces.find(i => i.name === name);
    }

    getAvailablePorts() {
        return this.interfaces.filter(i => !i.isConnected());
    }

    getConnectedPorts() {
        return this.interfaces.filter(i => i.isConnected());
    }

    hasAvailablePort(type = null) {
        return this.interfaces.some(i => !i.isConnected() && (type === null || i.type === type));
    }

    getFirstAvailablePort(type = null) {
        return this.interfaces.find(i => !i.isConnected() && (type === null || i.type === type));
    }

    // Get the IP address of the first configured interface
    getPrimaryIP() {
        for (const iface of this.interfaces) {
            if (iface.ipAddress) return iface.ipAddress;
        }
        return null;
    }

    // Get the MAC of the first interface
    getPrimaryMAC() {
        if (this.interfaces.length > 0) return this.interfaces[0].macAddress;
        return null;
    }

    // Get center position for drawing
    getCenterX() { return this.x + this.width / 2; }
    getCenterY() { return this.y + this.height / 2; }

    // Hit test
    containsPoint(px, py) {
        return Utils.pointInRect(px, py, this.x, this.y, this.width, this.height);
    }

    // Check if device can route
    canRoute() { return false; }

    // Check if device can switch
    canSwitch() { return false; }

    serialize() {
        return {
            id: this.id,
            type: this.type,
            name: this.name,
            x: this.x,
            y: this.y,
            hostname: this.hostname,
            powered: this.powered,
            notes: this.notes,
            interfaces: this.interfaces.map(i => i.serialize()),
            routingTable: this.routingTable,
            arpTable: Array.from(this.arpTable.entries()),
            macTable: Array.from(this.macTable.entries()),
            dhcpServer: this.dhcpServer
        };
    }

    static deserialize(data) {
        const DevClass = DeviceFactory.getClass(data.type);
        const dev = new DevClass(data.x, data.y);
        dev.id = data.id;
        dev.name = data.name;
        dev.hostname = data.hostname;
        dev.powered = data.powered;
        dev.notes = data.notes || '';
        dev.interfaces = data.interfaces.map(i => NetworkInterface.deserialize(i));
        dev.routingTable = data.routingTable || [];
        dev.arpTable = new Map(data.arpTable || []);
        dev.macTable = new Map(data.macTable || []);
        dev.dhcpServer = data.dhcpServer || null;
        return dev;
    }
}

// === End Devices ===

class PC extends NetworkDevice {
    constructor(x, y) {
        super('pc', x, y);
        this.color = '#89b4fa';
        this.icon = 'fa-desktop';
    }
    _initInterfaces() {
        this.interfaces.push(new NetworkInterface('FastEthernet0', 'ethernet', '100Mbps'));
    }
}

class Laptop extends NetworkDevice {
    constructor(x, y) {
        super('laptop', x, y);
        this.color = '#94e2d5';
        this.icon = 'fa-laptop';
    }
    _initInterfaces() {
        this.interfaces.push(new NetworkInterface('FastEthernet0', 'ethernet', '100Mbps'));
        this.interfaces.push(new NetworkInterface('Wireless0', 'wireless', '54Mbps'));
    }
}

class Server extends NetworkDevice {
    constructor(x, y) {
        super('server', x, y);
        this.color = '#cba6f7';
        this.icon = 'fa-server';
        this.services = {
            http: { enabled: false, port: 80 },
            https: { enabled: false, port: 443 },
            dns: { enabled: false, port: 53, records: [] },
            dhcp: { enabled: false, pool: null },
            ftp: { enabled: false, port: 21 },
            email: { enabled: false, smtpPort: 25, pop3Port: 110 }
        };
    }
    _initInterfaces() {
        this.interfaces.push(new NetworkInterface('FastEthernet0', 'ethernet', '1Gbps'));
        this.interfaces.push(new NetworkInterface('FastEthernet1', 'ethernet', '1Gbps'));
    }
}

class Printer extends NetworkDevice {
    constructor(x, y) {
        super('printer', x, y);
        this.color = '#a6adc8';
        this.icon = 'fa-print';
    }
    _initInterfaces() {
        this.interfaces.push(new NetworkInterface('FastEthernet0', 'ethernet', '100Mbps'));
    }
}

class Smartphone extends NetworkDevice {
    constructor(x, y) {
        super('smartphone', x, y);
        this.color = '#a6e3a1';
        this.icon = 'fa-mobile-alt';
    }
    _initInterfaces() {
        this.interfaces.push(new NetworkInterface('Wireless0', 'wireless', '54Mbps'));
    }
}

// === Network Devices ===

class Router extends NetworkDevice {
    constructor(x, y) {
        super('router', x, y);
        this.color = '#f38ba8';
        this.icon = 'fa-project-diagram';
    }

    _initInterfaces() {
        this.interfaces.push(new NetworkInterface('GigabitEthernet0/0', 'ethernet', '1Gbps'));
        this.interfaces.push(new NetworkInterface('GigabitEthernet0/1', 'ethernet', '1Gbps'));
        this.interfaces.push(new NetworkInterface('Serial0/0/0', 'serial', '1.544Mbps'));
        this.interfaces.push(new NetworkInterface('Serial0/0/1', 'serial', '1.544Mbps'));
        this.interfaces.push(new NetworkInterface('Console0', 'console', '-'));
    }

    canRoute() { return true; }

    // Find route for destination IP
    findRoute(destIP) {
        // Check directly connected networks first
        for (const iface of this.interfaces) {
            if (iface.ipAddress && iface.isUp()) {
                if (Utils.sameSubnet(destIP, iface.ipAddress, iface.subnetMask)) {
                    return { type: 'connected', interface: iface, nextHop: destIP };
                }
            }
        }
        // Check static routes
        for (const route of this.routingTable) {
            const destNet = Utils.ipToNumber(route.network);
            const mask = Utils.ipToNumber(route.mask);
            const target = Utils.ipToNumber(destIP);
            if ((target & mask) === (destNet & mask)) {
                const iface = this.getInterface(route.interface);
                return { type: 'static', interface: iface, nextHop: route.gateway };
            }
        }
        // Default route
        const defaultRoute = this.routingTable.find(r => r.network === '0.0.0.0');
        if (defaultRoute) {
            const iface = this.getInterface(defaultRoute.interface);
            return { type: 'default', interface: iface, nextHop: defaultRoute.gateway };
        }
        return null;
    }
}

class Switch extends NetworkDevice {
    constructor(x, y) {
        super('switch', x, y);
        this.color = '#89b4fa';
        this.icon = 'fa-exchange-alt';
        this.vlans = { 1: { name: 'default', ports: [] } };
        this.stpEnabled = true;
    }

    _initInterfaces() {
        for (let i = 0; i < 8; i++) {
            this.interfaces.push(new NetworkInterface(`FastEthernet0/${i}`, 'ethernet', '100Mbps'));
        }
        this.interfaces.push(new NetworkInterface('Console0', 'console', '-'));
    }

    canSwitch() { return true; }

    // Learn MAC address on a port
    learnMAC(mac, interfaceName) {
        this.macTable.set(mac, interfaceName);
    }

    // Lookup which port a MAC is on
    lookupMAC(mac) {
        return this.macTable.get(mac) || null;
    }

    // Get flood ports (all ports except source)
    getFloodPorts(excludeInterface) {
        return this.interfaces.filter(i =>
            i.isConnected() && i.isUp() && i.name !== excludeInterface && i.type !== 'console'
        );
    }
}

class Hub extends NetworkDevice {
    constructor(x, y) {
        super('hub', x, y);
        this.color = '#f9e2af';
        this.icon = 'fa-circle-notch';
    }

    _initInterfaces() {
        for (let i = 0; i < 4; i++) {
            this.interfaces.push(new NetworkInterface(`Ethernet${i}`, 'ethernet', '10Mbps'));
        }
    }

    // Hub floods to all ports except incoming
    getFloodPorts(excludeInterface) {
        return this.interfaces.filter(i =>
            i.isConnected() && i.name !== excludeInterface
        );
    }
}

class Bridge extends NetworkDevice {
    constructor(x, y) {
        super('bridge', x, y);
        this.color = '#fab387';
        this.icon = 'fa-grip-lines';
    }

    _initInterfaces() {
        this.interfaces.push(new NetworkInterface('Ethernet0', 'ethernet', '100Mbps'));
        this.interfaces.push(new NetworkInterface('Ethernet1', 'ethernet', '100Mbps'));
    }

    canSwitch() { return true; }
}

class AccessPoint extends NetworkDevice {
    constructor(x, y) {
        super('access-point', x, y);
        this.color = '#94e2d5';
        this.icon = 'fa-wifi';
        this.ssid = 'ComNet-WiFi';
        this.channel = 1;
        this.security = 'WPA2';
        this.password = '';
    }

    _initInterfaces() {
        this.interfaces.push(new NetworkInterface('FastEthernet0', 'ethernet', '100Mbps'));
        this.interfaces.push(new NetworkInterface('Wireless0', 'wireless', '54Mbps'));
    }
}

class Firewall extends NetworkDevice {
    constructor(x, y) {
        super('firewall', x, y);
        this.color = '#f38ba8';
        this.icon = 'fa-shield-alt';
        this.rules = [];
        this.defaultPolicy = 'deny';
    }

    _initInterfaces() {
        this.interfaces.push(new NetworkInterface('GigabitEthernet0/0', 'ethernet', '1Gbps'));
        this.interfaces.push(new NetworkInterface('GigabitEthernet0/1', 'ethernet', '1Gbps'));
        this.interfaces.push(new NetworkInterface('GigabitEthernet0/2', 'ethernet', '1Gbps'));
    }

    canRoute() { return true; }

    checkRule(srcIP, dstIP, protocol, port) {
        for (const rule of this.rules) {
            if (this._matchRule(rule, srcIP, dstIP, protocol, port)) {
                return rule.action; // 'permit' or 'deny'
            }
        }
        return this.defaultPolicy;
    }

    _matchRule(rule, srcIP, dstIP, protocol, port) {
        if (rule.srcIP && rule.srcIP !== 'any' && rule.srcIP !== srcIP) return false;
        if (rule.dstIP && rule.dstIP !== 'any' && rule.dstIP !== dstIP) return false;
        if (rule.protocol && rule.protocol !== 'any' && rule.protocol !== protocol) return false;
        if (rule.port && rule.port !== 'any' && rule.port !== port) return false;
        return true;
    }
}

// === Device Factory ===
const DeviceFactory = {
    _classes: {
        'pc': PC,
        'laptop': Laptop,
        'server': Server,
        'printer': Printer,
        'smartphone': Smartphone,
        'router': Router,
        'switch': Switch,
        'hub': Hub,
        'bridge': Bridge,
        'access-point': AccessPoint,
        'firewall': Firewall,
    },

    create(type, x, y) {
        const DevClass = this._classes[type];
        if (!DevClass) {
            console.error(`Unknown device type: ${type}`);
            return null;
        }
        return new DevClass(x, y);
    },

    getClass(type) {
        return this._classes[type] || NetworkDevice;
    },

    getTypes() {
        return Object.keys(this._classes);
    }
};
