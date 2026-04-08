/* ComNet - IOS-style CLI */

class CLISession {
    constructor(device, networkEngine) {
        this.device = device;
        this.network = networkEngine;
        this.mode = 'user'; // user, privileged, config, interface
        this.currentInterface = null;
        this.history = [];
        this.historyIndex = -1;
        this.output = '';
        if (device.bannerMotd) this.output += device.bannerMotd + '\n';
        this.output += `\n${device.hostname}>\n`;
    }

    getPrompt() {
        const h = this.device.hostname;
        switch (this.mode) {
            case 'user': return `${h}>`;
            case 'privileged': return `${h}#`;
            case 'config': return `${h}(config)#`;
            case 'interface': return `${h}(config-if)#`;
            default: return `${h}>`;
        }
    }

    execute(input) {
        const line = input.trim();
        if (!line) return '';
        this.history.push(line);
        this.historyIndex = this.history.length;
        const parts = line.split(/\s+/);
        const cmd = parts[0].toLowerCase();

        try {
            if (this.mode === 'user') return this._userMode(cmd, parts);
            if (this.mode === 'privileged') return this._privMode(cmd, parts);
            if (this.mode === 'config') return this._configMode(cmd, parts);
            if (this.mode === 'interface') return this._ifaceMode(cmd, parts);
        } catch (e) { return `% Error: ${e.message}`; }
        return `% Unknown command: ${line}`;
    }

    _userMode(cmd, parts) {
        switch (cmd) {
            case 'enable': this.mode = 'privileged'; return '';
            case 'ping': return this._doPing(parts);
            case 'traceroute': return this._doTrace(parts);
            case 'show': return this._doShow(parts);
            case 'exit': case 'quit': case 'logout': return '--- Session ended ---';
            case '?': case 'help': return 'enable  ping  traceroute  show  exit';
            default: return `% Unknown command: ${parts.join(' ')}`;
        }
    }

    _privMode(cmd, parts) {
        switch (cmd) {
            case 'configure':
                if (parts[1] === 'terminal' || parts[1] === 't') { this.mode = 'config'; return 'Enter configuration commands, one per line. End with CNTL/Z.'; }
                return '% Incomplete command.';
            case 'disable': this.mode = 'user'; return '';
            case 'exit': this.mode = 'user'; return '';
            case 'ping': return this._doPing(parts);
            case 'traceroute': return this._doTrace(parts);
            case 'show': return this._doShow(parts);
            case 'copy': return this._doCopy(parts);
            case 'write': return 'Building configuration...\n[OK]';
            case 'reload': this.device.powered = false; setTimeout(() => this.device.powered = true, 1000); return '% Reloading...';
            case 'debug': return '% Debugging enabled';
            case 'undebug': case 'no': return '% OK';
            case '?': case 'help': return 'configure terminal  show  ping  traceroute  copy  write  reload  disable  exit';
            default: return `% Unknown command: ${parts.join(' ')}`;
        }
    }

    _configMode(cmd, parts) {
        switch (cmd) {
            case 'hostname':
                if (!parts[1]) return '% Incomplete command.';
                this.device.hostname = parts[1]; this.device.name = parts[1]; return '';
            case 'interface':
                if (!parts[1]) return '% Incomplete command.';
                const ifName = parts.slice(1).join('');
                const iface = this.device.interfaces.find(i => i.name.toLowerCase().startsWith(ifName.toLowerCase()));
                if (!iface) return `% Invalid interface: ${parts.slice(1).join(' ')}`;
                this.currentInterface = iface; this.mode = 'interface'; return '';
            case 'ip':
                if (parts[1] === 'route') {
                    if (parts.length < 5) return '% ip route <network> <mask> <next-hop> [exit-interface]';
                    const routeEntry = { network:parts[2], mask:parts[3], nextHop:parts[4] };
                    if (parts[5]) routeEntry.iface = parts[5];
                    this.device.routingTable.push(routeEntry);
                    return '';
                }
                if (parts[1] === 'name-server') return '';
                return `% Invalid command: ${parts.join(' ')}`;
            case 'enable':
                if (parts[1] === 'secret' && parts[2]) { this.device.enableSecret = parts[2]; return ''; }
                return '% Incomplete command.';
            case 'banner':
                if (parts[1] === 'motd') { this.device.bannerMotd = parts.slice(2).join(' ').replace(/^#|#$/g,''); return ''; }
                return '';
            case 'vlan':
                if (!parts[1]) return '% Incomplete command.';
                const vid = parseInt(parts[1]);
                if (!this.device.vlans.find(v => v.id === vid)) this.device.vlans.push({ id:vid, name:`VLAN${vid}` });
                return '';
            case 'no':
                if (parts[1] === 'ip' && parts[2] === 'route') {
                    const net = parts[3], mask = parts[4], nh = parts[5];
                    this.device.routingTable = this.device.routingTable.filter(r =>
                        !(r.network === net && (!mask || r.mask === mask) && (!nh || r.nextHop === nh))
                    );
                    return '';
                }
                return '';
            case 'exit': case 'end': this.mode = 'privileged'; return '';
            case '?': return 'hostname  interface  ip route  enable secret  banner motd  vlan  no  exit';
            default: return `% Unknown command: ${parts.join(' ')}`;
        }
    }

    _ifaceMode(cmd, parts) {
        const iface = this.currentInterface;
        if (!iface) { this.mode = 'config'; return ''; }
        switch (cmd) {
            case 'ip':
                if (parts[1] === 'address' && parts[2]) {
                    if (parts[2] === 'dhcp') return '% DHCP client enabled';
                    if (!parts[3]) return '% ip address <ip> <mask>';
                    iface.ipAddress = parts[2]; iface.subnetMask = parts[3]; return '';
                }
                if (parts[1] === 'nat') { iface.natDirection = parts[2] || ''; return ''; }
                return `% Invalid: ${parts.join(' ')}`;
            case 'no':
                if (parts[1] === 'shutdown') { iface.adminStatus = 'up'; if (iface.isConnected()) iface.status = 'up'; return ''; }
                if (parts[1] === 'ip' && parts[2] === 'address') { iface.ipAddress = ''; return ''; }
                return '';
            case 'shutdown': iface.adminStatus = 'down'; iface.status = 'down'; return '';
            case 'speed': if (parts[1]) iface.speed = parts[1]; return '';
            case 'duplex': if (parts[1]) iface.duplex = parts[1]; return '';
            case 'clock': if (parts[1] === 'rate' && parts[2]) iface.clockRate = parseInt(parts[2]); return '';
            case 'description': iface.description = parts.slice(1).join(' '); return '';
            case 'switchport':
                if (parts[1] === 'mode') { iface.trunkMode = parts[2] === 'trunk'; return ''; }
                if (parts[1] === 'access' && parts[2] === 'vlan') { iface.vlan = parseInt(parts[3])||1; return ''; }
                return '';
            case 'exit': this.mode = 'config'; this.currentInterface = null; return '';
            case '?': return 'ip address  no shutdown  shutdown  speed  duplex  clock rate  description  switchport  exit';
            default: return `% Unknown command: ${parts.join(' ')}`;
        }
    }

    _doShow(parts) {
        const sub = (parts[1]||'').toLowerCase();
        const sub2 = (parts[2]||'').toLowerCase();
        if (sub === 'ip' && sub2 === 'interface') return this._showIPIntBrief();
        if (sub === 'ip' && sub2 === 'route') return this._showIPRoute();
        if (sub === 'interfaces') return this._showInterfaces();
        if (sub === 'arp') return this._showARP();
        if (sub === 'mac-address-table') return this._showMAC();
        if (sub === 'running-config') return this._showRunConfig();
        if (sub === 'vlan') return this._showVlan();
        if (sub === 'version') return `ComNet IOS v3.0\nModel: ${this.device.model}\nHostname: ${this.device.hostname}\nUptime: running\nInterfaces: ${this.device.interfaces.length}`;
        return 'show ip interface brief | ip route | interfaces | arp | mac-address-table | running-config | vlan | version';
    }

    _showIPIntBrief() {
        let out = 'Interface'.padEnd(25) + 'IP-Address'.padEnd(18) + 'Status'.padEnd(10) + 'Protocol\n';
        out += '-'.repeat(65) + '\n';
        for (const i of this.device.interfaces) {
            if (i.type === 'console') continue;
            out += i.name.padEnd(25) + (i.ipAddress||'unassigned').padEnd(18) + (i.adminStatus==='down'?'admin down':i.status).padEnd(10) + (i.isUp()?'up':'down') + '\n';
        }
        return out;
    }

    _showIPRoute() {
        let out = 'Routing Table:\n';
        // Connected routes
        for (const i of this.device.interfaces) {
            if (i.ipAddress && i.isUp()) out += `C   ${Utils.getNetworkAddress(i.ipAddress,i.subnetMask)}/${Utils.maskToCIDR(i.subnetMask)} directly connected, ${i.name}\n`;
        }
        for (const r of this.device.routingTable) out += `S   ${r.network} ${r.mask} via ${r.nextHop}\n`;
        return out || 'No routes configured.';
    }

    _showInterfaces() {
        let out = '';
        for (const i of this.device.interfaces) {
            out += `${i.name} is ${i.isUp()?'up':'down'}, line protocol is ${i.isUp()?'up':'down'}\n`;
            out += `  Hardware is ${i.type}, address is ${i.macAddress}\n`;
            if (i.ipAddress) out += `  Internet address is ${i.ipAddress}/${Utils.maskToCIDR(i.subnetMask)}\n`;
            out += `  ${i.speed} ${i.duplex}, TX: ${i.txPackets} RX: ${i.rxPackets}\n\n`;
        }
        return out;
    }

    _showARP() {
        let out = 'Protocol  Address'.padEnd(30) + 'Hardware Addr'.padEnd(20) + 'Type\n';
        for (const e of this.device.arpTable) out += `Internet  ${e.ip}`.padEnd(30) + `${e.mac}`.padEnd(20) + 'ARPA\n';
        return out || 'ARP table is empty.';
    }

    _showMAC() {
        if (!this.device.macTable?.length) return 'MAC address table is empty.';
        let out = 'VLAN'.padEnd(8) + 'Mac Address'.padEnd(20) + 'Type'.padEnd(10) + 'Ports\n';
        for (const e of this.device.macTable) out += `${e.vlan}`.padEnd(8) + `${e.mac}`.padEnd(20) + 'DYNAMIC'.padEnd(10) + `${e.port}\n`;
        return out;
    }

    _showRunConfig() {
        let out = `!\nhostname ${this.device.hostname}\n!\n`;
        if (this.device.enableSecret) out += `enable secret ${this.device.enableSecret}\n!\n`;
        for (const i of this.device.interfaces) {
            out += `interface ${i.name}\n`;
            if (i.description) out += ` description ${i.description}\n`;
            if (i.ipAddress) out += ` ip address ${i.ipAddress} ${i.subnetMask}\n`;
            if (i.natDirection) out += ` ip nat ${i.natDirection}\n`;
            if (i.adminStatus === 'down') out += ' shutdown\n';
            else out += ' no shutdown\n';
            out += '!\n';
        }
        for (const r of this.device.routingTable) out += `ip route ${r.network} ${r.mask} ${r.nextHop}\n`;
        return out;
    }

    _showVlan() {
        let out = 'VLAN'.padEnd(8) + 'Name'.padEnd(20) + 'Ports\n';
        out += '-'.repeat(50) + '\n';
        for (const v of this.device.vlans) {
            const ports = this.device.interfaces.filter(i => i.vlan === v.id && i.type === 'ethernet').map(i=>i.name).join(', ');
            out += `${v.id}`.padEnd(8) + `${v.name}`.padEnd(20) + ports + '\n';
        }
        return out;
    }

    _doPing(parts) {
        const dest = parts[1];
        if (!dest) return '% ping <ip-address>';
        if (!Utils.isValidIP(dest)) return `% Invalid IP: ${dest}`;
        if (!this.network) return `Pinging ${dest} ... no simulation engine`;
        const result = this.network.ping(this.device, dest);
        if (result.success) return `Pinging ${dest}: Reply from ${dest}: ttl=${result.ttl||64}\nPing statistics: 4 sent, 4 received, 0% loss`;
        return `Pinging ${dest}: ${result.message}\nPing statistics: 4 sent, 0 received, 100% loss`;
    }

    _doTrace(parts) {
        const dest = parts[1];
        if (!dest) return '% traceroute <ip-address>';
        if (!this.network) return '% No simulation engine';
        const result = this.network.traceroute(this.device, dest);
        let out = `Tracing route to ${dest}:\n`;
        result.hops.forEach((h, i) => { out += ` ${i+1}  ${h.name}\n`; });
        if (result.success) out += `Trace complete.`;
        else out += `Trace failed: ${result.message}`;
        return out;
    }

    _doCopy(parts) {
        return `${parts[1]||'src'} -> ${parts[2]||'dest'}: [OK]`;
    }

    tabComplete(partial) {
        const cmds = {
            user: ['enable','ping','traceroute','show','exit'],
            privileged: ['configure terminal','show','ping','traceroute','copy','write','reload','disable','exit'],
            config: ['hostname','interface','ip route','enable secret','banner motd','vlan','no','exit','end'],
            interface: ['ip address','no shutdown','shutdown','speed','duplex','clock rate','switchport','description','exit'],
        };
        const list = cmds[this.mode] || [];
        return list.filter(c => c.startsWith(partial.toLowerCase()));
    }
}
