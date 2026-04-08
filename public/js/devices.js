/* ComNet - Device Classes (Complete) */

class NetworkInterface {
    constructor(name, type = 'ethernet', speed = '100Mbps') {
        this.name = name; this.type = type; this.speed = speed;
        this.macAddress = Utils.generateMAC();
        this.ipAddress = ''; this.subnetMask = '255.255.255.0'; this.gateway = '';
        this.status = 'down'; this.adminStatus = 'up';
        this.connectedTo = null; this.connectedInterface = null;
        this.vlan = 1; this.trunkMode = false; this.allowedVlans = [1];
        this.natDirection = ''; this.clockRate = 0;
        this.duplex = 'auto'; this.description = '';
        this.txPackets = 0; this.rxPackets = 0; this.txBytes = 0; this.rxBytes = 0;
    }
    isUp() { return this.status === 'up' && this.adminStatus === 'up'; }
    isConnected() { return this.connectedTo !== null; }
    connect(deviceId, ifaceName) { this.connectedTo = deviceId; this.connectedInterface = ifaceName; this.status = 'up'; }
    disconnect() { this.connectedTo = null; this.connectedInterface = null; this.status = 'down'; }
    serialize() {
        return { name:this.name, type:this.type, speed:this.speed, macAddress:this.macAddress,
            ipAddress:this.ipAddress, subnetMask:this.subnetMask, gateway:this.gateway,
            status:this.status, adminStatus:this.adminStatus, connectedTo:this.connectedTo,
            connectedInterface:this.connectedInterface, vlan:this.vlan, trunkMode:this.trunkMode,
            natDirection:this.natDirection, clockRate:this.clockRate, duplex:this.duplex, description:this.description };
    }
    static deserialize(d) {
        const i = new NetworkInterface(d.name, d.type, d.speed);
        Object.assign(i, d); return i;
    }
}

class NetworkDevice {
    constructor(type, x, y, model) {
        this.id = Utils.generateId();
        this.type = type; this.model = model || type;
        this.name = Utils.generateDisplayName(type);
        this.hostname = this.name;
        this.x = x; this.y = y; this.width = 60; this.height = 50;
        this.powered = true; this.selected = false;
        this.interfaces = []; this.routingTable = []; this.arpTable = [];
        this.macTable = []; this.vlans = [{ id:1, name:'default' }];
        this.services = {}; this.acl = [];
        this.enableSecret = ''; this.bannerMotd = '';
        const cat = DeviceCatalog.findModel(this.model);
        this.img = cat?.img || '❓'; this.color = cat?.color || '#6cb6ff';
        this._initInterfaces();
    }
    _initInterfaces() {}
    containsPoint(px, py) { return px >= this.x && px <= this.x+this.width && py >= this.y && py <= this.y+this.height; }
    getCenterX() { return this.x + this.width/2; }
    getCenterY() { return this.y + this.height/2; }
    getInterface(name) { return this.interfaces.find(i => i.name === name); }
    getConnectedPorts() { return this.interfaces.filter(i => i.isConnected()); }
    getFirstAvailablePort(cableType) {
        const typeMap = { 'serial-dce':'serial','serial-dte':'serial','console':'console','fiber':'fiber','coaxial':'coaxial','phone':'phone' };
        const need = typeMap[cableType];
        if (need) return this.interfaces.find(i => !i.isConnected() && i.type === need);
        return this.interfaces.find(i => !i.isConnected() && (i.type === 'ethernet' || i.type === 'wireless') && i.type !== 'console' && i.type !== 'vlan');
    }
    getPrimaryIP() {
        for (const i of this.interfaces) if (i.ipAddress && i.type !== 'console') return i.ipAddress;
        return null;
    }
    hasCLI() { return false; }
    hasDesktop() { return false; }
    findRoute(destIP) {
        for (const i of this.interfaces) {
            if (i.ipAddress && i.isUp() && Utils.sameSubnet(destIP, i.ipAddress, i.subnetMask))
                return { network: Utils.getNetworkAddress(i.ipAddress, i.subnetMask), mask: i.subnetMask, nextHop: 'directly connected', iface: i.name };
        }
        for (const r of this.routingTable) {
            if (r.network !== '0.0.0.0' && Utils.sameSubnet(destIP, r.network, r.mask)) {
                const iface = this._resolveNextHopIface(r.nextHop);
                return { network:r.network, mask:r.mask, nextHop:r.nextHop, iface: iface || null };
            }
        }
        const def = this.routingTable.find(r => r.network === '0.0.0.0');
        if (def) {
            const iface = this._resolveNextHopIface(def.nextHop);
            return { network:'0.0.0.0', mask:'0.0.0.0', nextHop:def.nextHop, iface: iface || null };
        }
        return null;
    }
    _resolveNextHopIface(nextHop) {
        for (const i of this.interfaces) {
            if (i.ipAddress && i.isUp() && Utils.sameSubnet(nextHop, i.ipAddress, i.subnetMask)) return i.name;
        }
        const connected = this.interfaces.find(i => i.isConnected() && i.isUp() && i.type !== 'console' && i.type !== 'vlan');
        return connected ? connected.name : null;
    }
    serialize() {
        return { id:this.id, type:this.type, model:this.model, name:this.name, hostname:this.hostname,
            x:this.x, y:this.y, powered:this.powered, img:this.img, color:this.color,
            interfaces: this.interfaces.map(i => i.serialize()),
            routingTable:this.routingTable, arpTable:this.arpTable, macTable:this.macTable,
            vlans:this.vlans, services:this.services, acl:this.acl, enableSecret:this.enableSecret, bannerMotd:this.bannerMotd };
    }
    static deserialize(d) {
        const cls = DeviceFactory.getClass(d.type);
        const dev = new cls(d.type, d.x, d.y, d.model);
        dev.id = d.id; dev.name = d.name; dev.hostname = d.hostname || d.name;
        dev.powered = d.powered; dev.img = d.img; dev.color = d.color;
        dev.interfaces = (d.interfaces||[]).map(i => NetworkInterface.deserialize(i));
        dev.routingTable = d.routingTable||[]; dev.arpTable = d.arpTable||[];
        dev.macTable = d.macTable||[]; dev.vlans = d.vlans||[{id:1,name:'default'}];
        dev.services = d.services||{}; dev.acl = d.acl||[];
        dev.enableSecret = d.enableSecret||''; dev.bannerMotd = d.bannerMotd||'';
        return dev;
    }
}

/* ===== NETWORK INFRASTRUCTURE ===== */

class Router extends NetworkDevice {
    constructor(t,x,y,m){ super(t||'router',x,y,m||'PT-Router'); }
    _initInterfaces() {
        const specs = { '4331':[3,2],'4321':[2,2],'2911':[3,2],'2901':[2,2],'2811':[2,2],'1941':[2,1],'PT-Router':[2,1] };
        const s = specs[this.model] || [2,1];
        for (let i=0;i<s[0];i++) this.interfaces.push(new NetworkInterface(`GigabitEthernet0/${i}`,'ethernet','1Gbps'));
        for (let i=0;i<s[1];i++) this.interfaces.push(new NetworkInterface(`Serial0/${i}`,'serial','1.544Mbps'));
        this.interfaces.push(new NetworkInterface('Console0','console','—'));
    }
    hasCLI(){ return true; }
}

class Switch extends NetworkDevice {
    constructor(t,x,y,m){ super(t||'switch',x,y,m||'PT-Switch'); }
    _initInterfaces() {
        const n = this.model.includes('48') ? 48 : this.model.includes('24') ? 24 : 8;
        for (let i=0;i<n;i++) this.interfaces.push(new NetworkInterface(`FastEthernet0/${i}`,'ethernet','100Mbps'));
        this.interfaces.push(new NetworkInterface('GigabitEthernet0/1','ethernet','1Gbps'));
        this.interfaces.push(new NetworkInterface('Console0','console','—'));
        this.interfaces.push(new NetworkInterface('Vlan1','vlan','—'));
    }
    hasCLI(){ return true; }
    learnMAC(mac, port) {
        const existing = this.macTable.find(e => e.mac === mac);
        if (existing) { existing.port = port; existing.age = Date.now(); }
        else this.macTable.push({ mac, port, vlan:1, age:Date.now() });
    }
    lookupMAC(mac) { const e = this.macTable.find(m => m.mac === mac); return e ? e.port : null; }
    floodPorts(excludePort) { return this.interfaces.filter(i => i.name !== excludePort && i.isConnected() && i.type === 'ethernet').map(i => i.name); }
}

class L3Switch extends Switch {
    constructor(t,x,y,m){ super('l3switch',x,y,m||'3650-24PS'); this.type='l3switch'; }
    findRoute(d){ return Router.prototype.findRoute.call(this,d); }
}

class Hub extends NetworkDevice {
    constructor(t,x,y,m){ super('hub',x,y,m||'PT-Hub'); }
    _initInterfaces() { for(let i=0;i<4;i++) this.interfaces.push(new NetworkInterface(`Ethernet${i}`,'ethernet','10Mbps')); }
}

class Bridge extends NetworkDevice {
    constructor(t,x,y,m){ super('bridge',x,y,m||'PT-Bridge'); }
    _initInterfaces() {
        for(let i=0;i<2;i++) this.interfaces.push(new NetworkInterface(`FastEthernet0/${i}`,'ethernet','100Mbps'));
    }
    hasCLI(){ return true; }
}

class Repeater extends NetworkDevice {
    constructor(t,x,y,m){ super('repeater',x,y,m||'PT-Repeater'); }
    _initInterfaces() {
        this.interfaces.push(new NetworkInterface('Port0','ethernet','10Mbps'));
        this.interfaces.push(new NetworkInterface('Port1','ethernet','10Mbps'));
    }
}

class Splitter extends NetworkDevice {
    constructor(t,x,y,m){ super('splitter',x,y,m||'Coaxial-Splitter'); }
    _initInterfaces() {
        this.interfaces.push(new NetworkInterface('Coax0','coaxial','10Mbps'));
        this.interfaces.push(new NetworkInterface('Coax1','coaxial','10Mbps'));
        this.interfaces.push(new NetworkInterface('Coax2','coaxial','10Mbps'));
    }
}

class WirelessRouter extends Router {
    constructor(t,x,y,m){ super('wirelessrouter',x,y,m||'WRT300N'); this.type='wirelessrouter'; }
    _initInterfaces() {
        for(let i=0;i<4;i++) this.interfaces.push(new NetworkInterface(`FastEthernet0/${i}`,'ethernet','100Mbps'));
        this.interfaces.push(new NetworkInterface('Internet0','ethernet','100Mbps'));
        this.interfaces.push(new NetworkInterface('Wireless0','wireless','54Mbps'));
    }
}

class AccessPoint extends NetworkDevice {
    constructor(t,x,y,m){ super('accesspoint',x,y,m||'AccessPoint-PT'); }
    _initInterfaces() {
        this.interfaces.push(new NetworkInterface('FastEthernet0','ethernet','100Mbps'));
        this.interfaces.push(new NetworkInterface('Wireless0','wireless','54Mbps'));
    }
}

class WLC extends NetworkDevice {
    constructor(t,x,y,m){ super('wlc',x,y,m||'WLC-PT'); }
    _initInterfaces() {
        this.interfaces.push(new NetworkInterface('GigabitEthernet0/0','ethernet','1Gbps'));
        this.interfaces.push(new NetworkInterface('GigabitEthernet0/1','ethernet','1Gbps'));
    }
    hasCLI(){ return true; }
}

class Firewall extends NetworkDevice {
    constructor(t,x,y,m){ super('firewall',x,y,m||'PT-Firewall'); }
    _initInterfaces() {
        const n = this.model === 'ASA5506-X' ? 8 : 4;
        for(let i=0;i<n;i++) this.interfaces.push(new NetworkInterface(`GigabitEthernet0/${i}`,'ethernet','1Gbps'));
        this.interfaces.push(new NetworkInterface('Management0/0','ethernet','100Mbps'));
        this.interfaces.push(new NetworkInterface('Console0','console','—'));
    }
    hasCLI(){ return true; }
}

class IDS extends NetworkDevice {
    constructor(t,x,y,m){ super('ids',x,y,m||'IDS-PT'); }
    _initInterfaces() {
        this.interfaces.push(new NetworkInterface('Monitoring0','ethernet','1Gbps'));
        this.interfaces.push(new NetworkInterface('Management0','ethernet','100Mbps'));
    }
}

class Cloud extends NetworkDevice {
    constructor(t,x,y,m){ super('cloud',x,y,m||'Cloud-PT'); }
    _initInterfaces() {
        for(let i=0;i<4;i++) this.interfaces.push(new NetworkInterface(`Ethernet${i}`,'ethernet','1Gbps'));
        this.interfaces.push(new NetworkInterface('Coax0','coaxial','100Mbps'));
        this.interfaces.push(new NetworkInterface('Serial0','serial','1.544Mbps'));
    }
}

class Modem extends NetworkDevice {
    constructor(t,x,y,m){ super('modem',x,y,m||'DSL-Modem'); }
    _initInterfaces() {
        this.interfaces.push(new NetworkInterface('Ethernet0','ethernet','100Mbps'));
        this.interfaces.push(new NetworkInterface('Phone0','phone','—'));
    }
}

/* ===== END DEVICES ===== */

class PC extends NetworkDevice {
    constructor(t,x,y,m){ super('pc',x,y,m||'PC-PT'); }
    _initInterfaces() {
        this.interfaces.push(new NetworkInterface('FastEthernet0','ethernet','100Mbps'));
    }
    hasDesktop(){ return true; }
}

class Laptop extends NetworkDevice {
    constructor(t,x,y,m){ super('laptop',x,y,m||'Laptop-PT'); }
    _initInterfaces() {
        this.interfaces.push(new NetworkInterface('FastEthernet0','ethernet','100Mbps'));
        this.interfaces.push(new NetworkInterface('Wireless0','wireless','54Mbps'));
    }
    hasDesktop(){ return true; }
}

class Server extends NetworkDevice {
    constructor(t,x,y,m){ super('server',x,y,m||'Server-PT'); }
    _initInterfaces() {
        this.interfaces.push(new NetworkInterface('FastEthernet0','ethernet','100Mbps'));
        this.interfaces.push(new NetworkInterface('GigabitEthernet0','ethernet','1Gbps'));
        this.services = {
            http: { enabled:false, content:'<h1>Welcome to Server</h1><p>HTTP service is running.</p>' },
            dhcp: { enabled:false, poolStart:'192.168.1.100', poolEnd:'192.168.1.200', gateway:'192.168.1.1', dns:'8.8.8.8', mask:'255.255.255.0' },
            dns:  { enabled:false, records:[] },
            ftp:  { enabled:false },
            email:{ enabled:false },
        };
    }
    hasDesktop(){ return true; }
    hasCLI(){ return true; }
}

class Printer extends NetworkDevice {
    constructor(t,x,y,m){ super('printer',x,y,m||'Printer-PT'); }
    _initInterfaces() {
        this.interfaces.push(new NetworkInterface('FastEthernet0','ethernet','100Mbps'));
    }
}

class Phone extends NetworkDevice {
    constructor(t,x,y,m){ super('phone',x,y,m||'IP-Phone'); }
    _initInterfaces() {
        this.interfaces.push(new NetworkInterface('FastEthernet0','ethernet','100Mbps'));
        this.interfaces.push(new NetworkInterface('Port-PC','ethernet','100Mbps'));
    }
}

class TV extends NetworkDevice {
    constructor(t,x,y,m){ super('tv',x,y,m||'Smart-TV'); }
    _initInterfaces() {
        this.interfaces.push(new NetworkInterface('FastEthernet0','ethernet','100Mbps'));
        this.interfaces.push(new NetworkInterface('Wireless0','wireless','54Mbps'));
    }
}

class Tablet extends NetworkDevice {
    constructor(t,x,y,m){ super('tablet',x,y,m||'Tablet-PT'); }
    _initInterfaces() {
        this.interfaces.push(new NetworkInterface('Wireless0','wireless','54Mbps'));
    }
    hasDesktop(){ return true; }
}

class Smartphone extends NetworkDevice {
    constructor(t,x,y,m){ super('smartphone',x,y,m||'Smartphone-PT'); }
    _initInterfaces() {
        this.interfaces.push(new NetworkInterface('Wireless0','wireless','54Mbps'));
    }
    hasDesktop(){ return true; }
}

/* ===== IoT DEVICES ===== */

class Sensor extends NetworkDevice {
    constructor(t,x,y,m){ super('sensor',x,y,m||'IoT-Sensor'); }
    _initInterfaces() {
        this.interfaces.push(new NetworkInterface('Wireless0','wireless','11Mbps'));
    }
}

class Actuator extends NetworkDevice {
    constructor(t,x,y,m){ super('actuator',x,y,m||'IoT-Actuator'); }
    _initInterfaces() {
        this.interfaces.push(new NetworkInterface('Wireless0','wireless','11Mbps'));
    }
}

class MCU extends NetworkDevice {
    constructor(t,x,y,m){ super('mcu',x,y,m||'MCU-PT'); }
    _initInterfaces() {
        this.interfaces.push(new NetworkInterface('Ethernet0','ethernet','10Mbps'));
        this.interfaces.push(new NetworkInterface('Wireless0','wireless','11Mbps'));
    }
}

class SBC extends NetworkDevice {
    constructor(t,x,y,m){ super('sbc',x,y,m||'SBC-PT'); }
    _initInterfaces() {
        this.interfaces.push(new NetworkInterface('Ethernet0','ethernet','100Mbps'));
        this.interfaces.push(new NetworkInterface('Wireless0','wireless','54Mbps'));
    }
    hasDesktop(){ return true; }
}

/* ===== DEVICE FACTORY ===== */

const DeviceFactory = {
    _map: {
        router: Router, switch: Switch, l3switch: L3Switch, hub: Hub,
        bridge: Bridge, repeater: Repeater, splitter: Splitter,
        wirelessrouter: WirelessRouter, accesspoint: AccessPoint, wlc: WLC,
        firewall: Firewall, ids: IDS, cloud: Cloud, modem: Modem,
        pc: PC, laptop: Laptop, server: Server, printer: Printer,
        phone: Phone, tv: TV, tablet: Tablet, smartphone: Smartphone,
        sensor: Sensor, actuator: Actuator, mcu: MCU, sbc: SBC,
    },
    getClass(type) { return this._map[type] || NetworkDevice; },
    create(type, x, y, model) {
        const cls = this.getClass(type);
        return new cls(type, x, y, model);
    },
};
