/* ============================================
   ComNet Simulator - Network Simulation Engine
   ============================================ */

class NetworkEngine {
    constructor(app) {
        this.app = app;
        this.eventLog = [];
        this.eventCounter = 0;
    }

    // === PING (ICMP Echo) ===
    ping(sourceDevice, destIP, count = 4) {
        const results = [];
        const srcIP = sourceDevice.getPrimaryIP();
        if (!srcIP) {
            return { success: false, message: 'Source device has no IP address configured.' };
        }

        if (!Utils.isValidIPv4(destIP)) {
            return { success: false, message: `Invalid destination IP: ${destIP}` };
        }

        // Find the interface that should be used
        const srcIface = this._findSourceInterface(sourceDevice, destIP);
        if (!srcIface) {
            return { success: false, message: 'No route to destination.' };
        }

        // Trace the path
        const path = this._tracePath(sourceDevice, destIP);
        if (!path.success) {
            return { success: false, message: path.message, path: path.hops };
        }

        return {
            success: true,
            srcIP: srcIface.ipAddress,
            destIP: destIP,
            path: path.hops,
            message: `Ping ${destIP}: Reply from ${destIP} — TTL=128`
        };
    }

    // Find which local interface to use for a destination
    _findSourceInterface(device, destIP) {
        // Check directly connected interfaces
        for (const iface of device.interfaces) {
            if (iface.ipAddress && iface.isUp()) {
                if (Utils.sameSubnet(destIP, iface.ipAddress, iface.subnetMask)) {
                    return iface;
                }
            }
        }

        // If device is a router, check routing table
        if (device.canRoute && device.canRoute()) {
            const route = device.findRoute(destIP);
            if (route) return route.interface;
        }

        // Check for default gateway
        for (const iface of device.interfaces) {
            if (iface.defaultGateway) {
                return iface;
            }
        }

        return null;
    }

    // Trace the path a packet would take from source to dest IP
    _tracePath(sourceDevice, destIP) {
        const hops = [];
        const visited = new Set();
        let currentDevice = sourceDevice;
        let targetIP = destIP;
        let ttl = 30;

        while (ttl > 0) {
            ttl--;

            if (visited.has(currentDevice.id)) {
                return { success: false, message: 'Routing loop detected.', hops };
            }
            visited.add(currentDevice.id);

            hops.push({
                deviceId: currentDevice.id,
                deviceName: currentDevice.name,
                ip: currentDevice.getPrimaryIP()
            });

            // Check if current device IS the destination
            for (const iface of currentDevice.interfaces) {
                if (iface.ipAddress === destIP) {
                    return { success: true, hops };
                }
            }

            // Find the next hop
            let nextHopIP = null;
            let outInterface = null;

            if (currentDevice.canRoute && currentDevice.canRoute()) {
                // Router: use routing table
                const route = currentDevice.findRoute(targetIP);
                if (route) {
                    outInterface = route.interface;
                    nextHopIP = route.type === 'connected' ? targetIP : route.nextHop;
                }
            } else {
                // End device: use default gateway or same-subnet
                const srcIface = this._findSourceInterface(currentDevice, targetIP);
                if (srcIface) {
                    outInterface = srcIface;
                    if (Utils.sameSubnet(targetIP, srcIface.ipAddress, srcIface.subnetMask)) {
                        nextHopIP = targetIP;
                    } else if (srcIface.defaultGateway) {
                        nextHopIP = srcIface.defaultGateway;
                    }
                }
            }

            if (!outInterface || !nextHopIP) {
                return { success: false, message: `No route from ${currentDevice.name} to ${targetIP}`, hops };
            }

            if (!outInterface.isConnected()) {
                return { success: false, message: `Interface ${outInterface.name} on ${currentDevice.name} is not connected.`, hops };
            }

            if (!outInterface.isUp()) {
                return { success: false, message: `Interface ${outInterface.name} on ${currentDevice.name} is down.`, hops };
            }

            // Find the next device through the connection
            const nextDevice = this._getNextDevice(currentDevice, outInterface);
            if (!nextDevice) {
                return { success: false, message: `No device connected on ${outInterface.name}`, hops };
            }

            // If the next device is a switch/hub, traverse it
            if (nextDevice.canSwitch && nextDevice.canSwitch()) {
                const switchResult = this._traverseSwitch(nextDevice, currentDevice, targetIP);
                if (!switchResult.success) {
                    hops.push({ deviceId: nextDevice.id, deviceName: nextDevice.name, ip: null });
                    return { success: false, message: switchResult.message, hops };
                }
                hops.push({ deviceId: nextDevice.id, deviceName: nextDevice.name, ip: null });
                currentDevice = switchResult.nextDevice;
            } else if (nextDevice.type === 'hub') {
                // Hub just floods
                const hubResult = this._traverseHub(nextDevice, currentDevice, nextHopIP);
                if (!hubResult.success) {
                    hops.push({ deviceId: nextDevice.id, deviceName: nextDevice.name, ip: null });
                    return { success: false, message: hubResult.message, hops };
                }
                hops.push({ deviceId: nextDevice.id, deviceName: nextDevice.name, ip: null });
                currentDevice = hubResult.nextDevice;
            } else {
                currentDevice = nextDevice;
            }

            // If current device is a router, we continue routing
            // If it's an end device, check if it has the target IP
        }

        return { success: false, message: 'TTL expired.', hops };
    }

    _getNextDevice(fromDevice, throughInterface) {
        const conn = this.app.connectionManager.getByInterface(fromDevice.id, throughInterface.name);
        if (!conn) return null;
        const other = conn.getOtherDevice(fromDevice.id);
        return this.app.devices.get(other.deviceId) || null;
    }

    _traverseSwitch(switchDevice, fromDevice, targetIP) {
        // Switch looks up MAC table or floods
        // For simulation, find a device with the target IP on one of the switch ports
        for (const iface of switchDevice.interfaces) {
            if (!iface.isConnected() || iface.type === 'console') continue;
            const conn = this.app.connectionManager.getByInterface(switchDevice.id, iface.name);
            if (!conn) continue;
            const other = conn.getOtherDevice(switchDevice.id);
            if (other.deviceId === fromDevice.id) continue;
            const otherDev = this.app.devices.get(other.deviceId);
            if (!otherDev) continue;

            // Check if the other device has the target IP or can route to it
            for (const oIface of otherDev.interfaces) {
                if (oIface.ipAddress === targetIP) {
                    return { success: true, nextDevice: otherDev };
                }
            }

            // Check if the other device is a router that can handle this IP
            if (otherDev.canRoute && otherDev.canRoute()) {
                return { success: true, nextDevice: otherDev };
            }
        }

        // If no specific target found, try to find any device on same subnet
        for (const iface of switchDevice.interfaces) {
            if (!iface.isConnected() || iface.type === 'console') continue;
            const conn = this.app.connectionManager.getByInterface(switchDevice.id, iface.name);
            if (!conn) continue;
            const other = conn.getOtherDevice(switchDevice.id);
            if (other.deviceId === fromDevice.id) continue;
            const otherDev = this.app.devices.get(other.deviceId);
            if (!otherDev) continue;

            for (const oIface of otherDev.interfaces) {
                if (oIface.ipAddress && Utils.sameSubnet(targetIP, oIface.ipAddress, oIface.subnetMask)) {
                    return { success: true, nextDevice: otherDev };
                }
            }
        }

        return { success: false, message: `Switch ${switchDevice.name}: No port found for target IP ${targetIP}` };
    }

    _traverseHub(hubDevice, fromDevice, targetIP) {
        // Hub floods everywhere - find the device with this IP
        for (const iface of hubDevice.interfaces) {
            if (!iface.isConnected()) continue;
            const conn = this.app.connectionManager.getByInterface(hubDevice.id, iface.name);
            if (!conn) continue;
            const other = conn.getOtherDevice(hubDevice.id);
            if (other.deviceId === fromDevice.id) continue;
            const otherDev = this.app.devices.get(other.deviceId);
            if (!otherDev) continue;

            for (const oIface of otherDev.interfaces) {
                if (oIface.ipAddress === targetIP) {
                    return { success: true, nextDevice: otherDev };
                }
            }

            if (otherDev.canRoute && otherDev.canRoute()) {
                return { success: true, nextDevice: otherDev };
            }
        }

        return { success: false, message: `Hub ${hubDevice.name}: Destination ${targetIP} unreachable` };
    }

    // === ARP Resolution ===
    resolveARP(sourceDevice, targetIP) {
        // Check ARP cache first
        if (sourceDevice.arpTable.has(targetIP)) {
            return { success: true, mac: sourceDevice.arpTable.get(targetIP), cached: true };
        }

        // Need to ARP - find the device with this IP
        const targetDevice = this._findDeviceByIP(targetIP);
        if (!targetDevice) {
            return { success: false, message: `ARP: Who has ${targetIP}? - No reply` };
        }

        const targetIface = targetDevice.interfaces.find(i => i.ipAddress === targetIP);
        if (!targetIface) {
            return { success: false, message: `ARP: Who has ${targetIP}? - No reply` };
        }

        // Cache in ARP table
        sourceDevice.arpTable.set(targetIP, targetIface.macAddress);
        return { success: true, mac: targetIface.macAddress, cached: false };
    }

    _findDeviceByIP(ip) {
        for (const [id, device] of this.app.devices) {
            for (const iface of device.interfaces) {
                if (iface.ipAddress === ip) return device;
            }
        }
        return null;
    }

    // === Traceroute ===
    traceroute(sourceDevice, destIP) {
        const path = this._tracePath(sourceDevice, destIP);
        return path;
    }

    // Log event
    logEvent(type, source, dest, protocol, info, status) {
        this.eventCounter++;
        const event = {
            id: this.eventCounter,
            time: Utils.timestamp(),
            source,
            dest,
            type: protocol,
            info,
            status
        };
        this.eventLog.push(event);
        this.app.addPacketToEventList(event);
        return event;
    }

    clearLog() {
        this.eventLog = [];
        this.eventCounter = 0;
    }
}
