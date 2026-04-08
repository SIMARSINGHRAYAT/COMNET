/* ComNet - Network Simulation Engine */

class NetworkEngine {
    constructor(app) { this.app = app; this.eventLog = []; this.eventId = 0; }

    ping(sourceDevice, destIP, count = 4) {
        if (!sourceDevice || !destIP) return { success:false, message:'Invalid parameters' };
        if (!sourceDevice.powered) return { success:false, message:`${sourceDevice.name} is powered off` };
        const result = this._tracePath(sourceDevice, destIP);
        this.logEvent('ICMP', sourceDevice.name, destIP, 'ICMP', result.success ? `Reply ttl=${result.ttl||64}` : result.message, result.success ? 'success' : 'failed');
        return result;
    }

    _tracePath(sourceDevice, destIP, maxTTL = 30) {
        const hops = []; const visited = new Set();
        let current = sourceDevice; let ttl = maxTTL;

        while (ttl > 0) {
            ttl--;
            if (!current || visited.has(current.id)) return { success:false, message:'Routing loop detected', hops };
            if (!current.powered) return { success:false, message:`${current.name} is powered off`, hops };
            visited.add(current.id);
            hops.push({ deviceId:current.id, name:current.name });

            // Check if destination is on this device
            for (const iface of current.interfaces) {
                if (iface.ipAddress === destIP) return { success:true, hops, ttl:maxTTL-ttl, path:hops };
            }

            // Find next hop
            const next = this._getNextDevice(current, destIP, visited);
            if (!next) return { success:false, message:`No route to ${destIP} from ${current.name}`, hops };
            current = next;
        }
        return { success:false, message:'TTL expired', hops };
    }

    _getNextDevice(fromDevice, destIP, visited) {
        // Use routing table if available (routers, L3 switches)
        if (fromDevice.findRoute) {
            const route = fromDevice.findRoute(destIP);
            if (route) {
                // If route has a resolved interface, follow it
                if (route.iface) {
                    const iface = fromDevice.getInterface(route.iface);
                    if (iface?.isConnected()) {
                        const dev = this.app.devices.get(iface.connectedTo);
                        if (dev && !visited.has(dev.id)) return dev;
                    }
                }
                // For static routes without resolved iface, find next-hop via adjacency
                if (route.nextHop && route.nextHop !== 'directly connected') {
                    const nhDev = this.findDeviceByIP(route.nextHop);
                    if (nhDev && !visited.has(nhDev.id)) return nhDev;
                }
            }
        }

        // Traverse connections looking for destination or forwarding device
        const conns = this.app.connectionManager.getByDevice(fromDevice.id);
        let bestNext = null;

        for (const conn of conns) {
            const other = conn.getOtherDevice(fromDevice.id);
            const peer = this.app.devices.get(other.deviceId);
            if (!peer || visited.has(peer.id) || !peer.powered) continue;

            // Check iface status
            const localIf = fromDevice.getInterface(fromDevice.id === conn.deviceA ? conn.interfaceA : conn.interfaceB);
            if (localIf && !localIf.isUp()) continue;

            // Destination is on this peer?
            for (const pi of peer.interfaces) { if (pi.ipAddress === destIP) return peer; }

            // Switch/Hub: flood through
            if (peer.type === 'switch' || peer.type === 'hub' || peer.type === 'bridge' || peer.type === 'l3switch') { if (!bestNext) bestNext = peer; continue; }
            // Router/Firewall: forward
            if (peer.type === 'router' || peer.type === 'firewall') { bestNext = peer; }
            // Any other connected device
            if (!bestNext) bestNext = peer;
        }
        return bestNext;
    }

    traceroute(sourceDevice, destIP) {
        const result = this._tracePath(sourceDevice, destIP, 30);
        this.logEvent('TRACE', sourceDevice.name, destIP, 'ICMP', result.hops.map(h=>h.name).join(' → '), result.success?'success':'failed');
        return result;
    }

    findDeviceByIP(ip) {
        for (const [id, dev] of this.app.devices) {
            for (const iface of dev.interfaces) { if (iface.ipAddress === ip) return dev; }
        }
        return null;
    }

    resolveARP(sourceDevice, ip) {
        const cached = sourceDevice.arpTable.find(e => e.ip === ip);
        if (cached) return cached.mac;
        const target = this.findDeviceByIP(ip);
        if (target) {
            const iface = target.interfaces.find(i => i.ipAddress === ip);
            if (iface) {
                sourceDevice.arpTable.push({ ip, mac:iface.macAddress, age:Date.now() });
                return iface.macAddress;
            }
        }
        return null;
    }

    dnsLookup(sourceDevice, domain) {
        for (const [id, dev] of this.app.devices) {
            if (dev.services?.dns?.enabled) {
                for (const rec of (dev.services.dns.records||[])) {
                    if (rec.name === domain) return { success:true, ip:rec.address, server:dev.name };
                }
            }
        }
        return { success:false, message:`DNS: ${domain} not found` };
    }

    requestDHCP(clientDevice) {
        for (const [id, dev] of this.app.devices) {
            const dhcp = dev.services?.dhcp;
            if (!dhcp?.enabled) continue;
            const start = Utils.ipToNumber(dhcp.poolStart||'192.168.1.100');
            const end = Utils.ipToNumber(dhcp.poolEnd||'192.168.1.200');
            const ip = Utils.numberToIp(start + Math.floor(Math.random()*(end-start+1)));
            this.logEvent('DHCP', dev.name, clientDevice.name, 'DHCP', `Assigned ${ip}`, 'success');
            return { success:true, ip, mask:dhcp.mask||'255.255.255.0', gateway:dhcp.gateway||'', dns:dhcp.dns||'' };
        }
        return { success:false, message:'No DHCP server found' };
    }

    logEvent(type, source, dest, protocol, info, status) {
        this.eventId++;
        const evt = { id:this.eventId, time:Utils.timestamp(), type, source, dest, protocol, info, status };
        this.eventLog.push(evt);
        if (this.eventLog.length > 500) this.eventLog.shift();
        if (this.app.addPacketToEventList) this.app.addPacketToEventList(evt);
    }

    clearLog() { this.eventLog = []; this.eventId = 0; }
}
