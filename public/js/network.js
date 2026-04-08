/* ComNet - Network Simulation Engine */

class NetworkEngine {
    constructor(app) { this.app = app; this.eventLog = []; this.eventId = 0; }

    ping(sourceDevice, destIP, count = 4) {
        if (!sourceDevice || !destIP) return { success:false, message:'Invalid parameters' };
        if (!sourceDevice.powered) return { success:false, message:`${sourceDevice.name} is powered off` };

        // Check ACL on outbound interface
        const aclResult = this._checkACLForTraffic(sourceDevice, destIP, 'icmp');
        if (aclResult === 'deny') {
            this.logEvent('ICMP', sourceDevice.name, destIP, 'ICMP', 'Blocked by ACL', 'failed');
            return { success:false, message:`Packet denied by access-list on ${sourceDevice.name}` };
        }

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
        if (cached) {
            // Check age — stale after 4 hours
            if (cached.age && (Date.now() - cached.age) > 4 * 3600000) {
                sourceDevice.arpTable = sourceDevice.arpTable.filter(e => e.ip !== ip);
            } else {
                return cached.mac;
            }
        }
        const target = this.findDeviceByIP(ip);
        if (target) {
            const iface = target.interfaces.find(i => i.ipAddress === ip);
            if (iface) {
                sourceDevice.arpTable.push({ ip, mac:iface.macAddress, age:Date.now() });
                this.logEvent('ARP', sourceDevice.name, target.name, 'ARP', `Resolved ${ip} → ${iface.macAddress}`, 'success');
                return iface.macAddress;
            }
        }
        this.logEvent('ARP', sourceDevice.name, ip, 'ARP', `ARP Request (no reply)`, 'failed');
        return null;
    }

    dnsLookup(sourceDevice, domain) {
        // Search for DNS server in network
        for (const [id, dev] of this.app.devices) {
            if (dev.services?.dns?.enabled) {
                // Check reachability first
                const path = this._tracePath(sourceDevice, dev.getPrimaryIP?.() || '');
                for (const rec of (dev.services.dns.records||[])) {
                    if (rec.name === domain || rec.name === domain + '.') {
                        this.logEvent('DNS', sourceDevice.name, dev.name, 'DNS', `${domain} → ${rec.address}`, 'success');
                        return { success:true, ip:rec.address, server:dev.name };
                    }
                }
                this.logEvent('DNS', sourceDevice.name, dev.name, 'DNS', `${domain}: NXDOMAIN`, 'failed');
                return { success:false, message:`DNS: ${domain} not found`, server:dev.name };
            }
        }
        return { success:false, message:`DNS: No DNS server available` };
    }

    requestDHCP(clientDevice) {
        for (const [id, dev] of this.app.devices) {
            const dhcp = dev.services?.dhcp;
            if (!dhcp?.enabled) continue;
            const start = Utils.ipToNumber(dhcp.poolStart||'192.168.1.100');
            const end = Utils.ipToNumber(dhcp.poolEnd||'192.168.1.200');

            // Check for excluded addresses
            const excluded = dev._dhcpExcluded || [];
            let ip = null;
            for (let n = start; n <= end; n++) {
                const candidate = Utils.numberToIp(n);
                const isExcluded = excluded.some(ex =>
                    Utils.ipToNumber(ex.start) <= n && n <= Utils.ipToNumber(ex.end)
                );
                if (isExcluded) continue;
                // Check if already in use
                if (!this.findDeviceByIP(candidate)) { ip = candidate; break; }
            }
            if (!ip) ip = Utils.numberToIp(start + Math.floor(Math.random()*(end-start+1)));

            this.logEvent('DHCP', dev.name, clientDevice.name, 'DHCP', `Assigned ${ip}`, 'success');
            return { success:true, ip, mask:dhcp.mask||'255.255.255.0', gateway:dhcp.gateway||'', dns:dhcp.dns||'' };
        }

        // Also check CLI-configured DHCP pools
        for (const [id, dev] of this.app.devices) {
            if (!dev._dhcpPools) continue;
            for (const [poolName, pool] of Object.entries(dev._dhcpPools)) {
                if (!pool.network) continue;
                const base = Utils.ipToNumber(pool.network);
                const ip = Utils.numberToIp(base + 10 + Math.floor(Math.random() * 200));
                this.logEvent('DHCP', dev.name, clientDevice.name, 'DHCP', `Pool ${poolName}: Assigned ${ip}`, 'success');
                return { success:true, ip, mask:pool.mask||'255.255.255.0', gateway:pool.gateway||'', dns:pool.dns||'' };
            }
        }

        return { success:false, message:'No DHCP server found' };
    }

    // ===== ACL CHECKING =====
    _checkACLForTraffic(device, destIP, protocol) {
        if (!device._accessLists) return 'permit';
        // Check each interface for applied ACLs
        for (const iface of device.interfaces) {
            const groups = iface._accessGroup;
            if (!groups) continue;
            for (const [direction, aclName] of Object.entries(groups)) {
                const acl = device._accessLists[aclName];
                if (!acl) continue;
                for (const entry of acl.entries) {
                    if (entry.action === 'remark') continue;
                    // Simple matching: check if dest matches
                    if (entry.source === 'any' || this._aclMatch(destIP, entry.source, entry.srcWild || entry.wildcard)) {
                        if (entry.dest && entry.dest !== 'any' && !this._aclMatch(destIP, entry.dest, entry.dstWild)) continue;
                        if (entry.protocol && entry.protocol !== 'ip' && entry.protocol !== protocol) continue;
                        return entry.action; // 'permit' or 'deny'
                    }
                }
            }
        }
        // Implicit deny at end of ACL (if ACL was applied)
        const hasACL = device.interfaces.some(i => i._accessGroup);
        return hasACL ? 'permit' : 'permit'; // Default permit if no ACL applied
    }

    _aclMatch(ip, network, wildcard) {
        if (network === 'any') return true;
        if (network === 'host') return ip === wildcard;
        if (!wildcard) return ip === network;
        const ipNum = Utils.ipToNumber(ip);
        const netNum = Utils.ipToNumber(network);
        const wildNum = Utils.ipToNumber(wildcard);
        return (ipNum & ~wildNum) === (netNum & ~wildNum);
    }

    // ===== CDP NEIGHBORS =====
    getCDPNeighbors(device) {
        const neighbors = [];
        const conns = this.app.connectionManager.getByDevice(device.id);
        for (const conn of conns) {
            const other = conn.getOtherDevice(device.id);
            const peer = this.app.devices.get(other.deviceId);
            if (!peer || !peer.powered) continue;
            const localIf = device.id === conn.deviceA ? conn.interfaceA : conn.interfaceB;
            const remoteIf = device.id === conn.deviceA ? conn.interfaceB : conn.interfaceA;
            neighbors.push({
                deviceId: peer.hostname,
                localInterface: localIf,
                remoteInterface: remoteIf,
                platform: peer.model,
                capabilities: peer.type === 'router' ? 'Router' : peer.type === 'switch' ? 'Switch' : 'Host',
                ip: peer.getPrimaryIP() || 'N/A',
            });
        }
        return neighbors;
    }

    // ===== BROADCAST SIMULATION =====
    simulateBroadcast(sourceDevice, protocol, data) {
        const conns = this.app.connectionManager.getByDevice(sourceDevice.id);
        const reached = [];
        for (const conn of conns) {
            const other = conn.getOtherDevice(sourceDevice.id);
            const peer = this.app.devices.get(other.deviceId);
            if (!peer || !peer.powered) continue;
            reached.push(peer);
            // If switch/hub, flood to all other ports
            if (peer.type === 'switch' || peer.type === 'hub') {
                const peerConns = this.app.connectionManager.getByDevice(peer.id);
                for (const pc of peerConns) {
                    const o2 = pc.getOtherDevice(peer.id);
                    const p2 = this.app.devices.get(o2.deviceId);
                    if (p2 && p2.id !== sourceDevice.id && p2.powered && !reached.find(r => r.id === p2.id)) {
                        reached.push(p2);
                    }
                }
            }
        }
        this.logEvent(protocol, sourceDevice.name, 'BROADCAST', protocol, `Reached ${reached.length} devices`, 'success');
        return reached;
    }

    // ===== MAC ADDRESS LEARNING (for switches) =====
    learnMAC(switchDevice, macAddress, port, vlan) {
        if (!switchDevice.macTable) switchDevice.macTable = [];
        const existing = switchDevice.macTable.find(e => e.mac === macAddress);
        if (existing) { existing.port = port; existing.age = Date.now(); return; }
        switchDevice.macTable.push({ mac:macAddress, port, vlan:vlan||1, age:Date.now() });
        // Limit MAC table size
        if (switchDevice.macTable.length > 1024) switchDevice.macTable.shift();
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
