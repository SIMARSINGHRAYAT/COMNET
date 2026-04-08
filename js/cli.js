/* ============================================
   ComNet Simulator - CLI Terminal Emulator
   IOS-like CLI for Routers/Switches + Desktop 
   command prompt for PCs
   ============================================ */

class CLITerminal {
    constructor(app) {
        this.app = app;
        this.sessions = new Map(); // deviceId -> session state
        this.activeDeviceId = null;
        this.commandHistory = [];
        this.historyIndex = -1;

        // DOM refs
        this.panel = document.getElementById('cli-panel');
        this.output = document.getElementById('cli-output');
        this.input = document.getElementById('cli-input');
        this.promptEl = document.getElementById('cli-prompt');
        this.tabsEl = document.querySelector('.cli-tabs');

        // Events
        this.input.addEventListener('keydown', (e) => this._onKeyDown(e));
    }

    // Open terminal for a device
    open(device) {
        this.panel.classList.remove('hidden');

        if (!this.sessions.has(device.id)) {
            this.sessions.set(device.id, this._createSession(device));
        }

        this.activeDeviceId = device.id;
        this._renderTabs();
        this._renderOutput();
        this._updatePrompt();
        this.input.focus();
    }

    close() {
        this.panel.classList.add('hidden');
        this.activeDeviceId = null;
    }

    closeTab(deviceId) {
        this.sessions.delete(deviceId);
        if (this.activeDeviceId === deviceId) {
            const remaining = Array.from(this.sessions.keys());
            if (remaining.length > 0) {
                this.activeDeviceId = remaining[remaining.length - 1];
                this._renderTabs();
                this._renderOutput();
                this._updatePrompt();
            } else {
                this.close();
            }
        } else {
            this._renderTabs();
        }
    }

    _createSession(device) {
        const isIOSDevice = ['router', 'switch', 'firewall'].includes(device.type);
        const session = {
            deviceId: device.id,
            deviceName: device.name,
            deviceType: device.type,
            isIOS: isIOSDevice,
            mode: isIOSDevice ? 'user' : 'prompt', // user, privileged, config, interface, prompt
            configInterface: null,
            output: [],
            hostname: device.hostname || device.name
        };

        // Welcome message
        if (isIOSDevice) {
            session.output.push('');
            session.output.push(`${session.hostname} Console`);
            session.output.push('');
            session.output.push('Press RETURN to get started.');
            session.output.push('');
        } else {
            session.output.push(`ComNet PC Command Prompt [${device.name}]`);
            session.output.push('Type "help" for available commands.');
            session.output.push('');
        }

        return session;
    }

    _getSession() {
        return this.sessions.get(this.activeDeviceId);
    }

    _getDevice() {
        return this.app.devices.get(this.activeDeviceId);
    }

    _updatePrompt() {
        const session = this._getSession();
        if (!session) return;

        let prompt;
        if (session.isIOS) {
            switch (session.mode) {
                case 'user': prompt = `${session.hostname}>`; break;
                case 'privileged': prompt = `${session.hostname}#`; break;
                case 'config': prompt = `${session.hostname}(config)#`; break;
                case 'interface': prompt = `${session.hostname}(config-if)#`; break;
                default: prompt = `${session.hostname}>`;
            }
        } else {
            prompt = `C:\\>`;
        }
        this.promptEl.textContent = prompt;
    }

    _renderTabs() {
        this.tabsEl.innerHTML = '';
        for (const [deviceId, session] of this.sessions) {
            const tab = document.createElement('div');
            tab.className = 'cli-tab' + (deviceId === this.activeDeviceId ? ' active' : '');
            tab.innerHTML = `<span>${session.deviceName}</span><span class="close-tab">&times;</span>`;
            tab.querySelector('span:first-child').addEventListener('click', () => {
                this.activeDeviceId = deviceId;
                this._renderTabs();
                this._renderOutput();
                this._updatePrompt();
            });
            tab.querySelector('.close-tab').addEventListener('click', (e) => {
                e.stopPropagation();
                this.closeTab(deviceId);
            });
            this.tabsEl.appendChild(tab);
        }
    }

    _renderOutput() {
        const session = this._getSession();
        if (!session) return;
        this.output.innerHTML = session.output.map(line => {
            if (typeof line === 'object') {
                return `<span class="cli-${line.type}">${Utils.escapeHtml(line.text)}</span>`;
            }
            return Utils.escapeHtml(line);
        }).join('\n');
        // Scroll to bottom
        const terminal = document.getElementById('cli-terminal');
        terminal.scrollTop = terminal.scrollHeight;
    }

    _addOutput(text, type = null) {
        const session = this._getSession();
        if (!session) return;
        if (type) {
            session.output.push({ text, type });
        } else {
            session.output.push(text);
        }
    }

    _onKeyDown(e) {
        const session = this._getSession();
        if (!session) return;

        if (e.key === 'Enter') {
            const cmd = this.input.value;
            this.input.value = '';

            // Show the command in output
            const prompt = this.promptEl.textContent;
            this._addOutput(prompt + cmd);

            if (cmd.trim()) {
                this.commandHistory.push(cmd);
                this.historyIndex = this.commandHistory.length;
                this._executeCommand(cmd.trim(), session);
            }

            this._renderOutput();
            this._updatePrompt();
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (this.historyIndex > 0) {
                this.historyIndex--;
                this.input.value = this.commandHistory[this.historyIndex];
            }
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (this.historyIndex < this.commandHistory.length - 1) {
                this.historyIndex++;
                this.input.value = this.commandHistory[this.historyIndex];
            } else {
                this.historyIndex = this.commandHistory.length;
                this.input.value = '';
            }
        } else if (e.key === 'Tab') {
            e.preventDefault();
            this._autocomplete(session);
        }
    }

    _executeCommand(cmd, session) {
        const device = this._getDevice();
        if (!device) return;

        if (session.isIOS) {
            this._executeIOSCommand(cmd, session, device);
        } else {
            this._executePCCommand(cmd, session, device);
        }
    }

    // === IOS-like Commands ===
    _executeIOSCommand(cmd, session, device) {
        const parts = cmd.toLowerCase().split(/\s+/);
        const command = parts[0];

        switch (session.mode) {
            case 'user':
                this._iosUserMode(command, parts, cmd, session, device);
                break;
            case 'privileged':
                this._iosPrivilegedMode(command, parts, cmd, session, device);
                break;
            case 'config':
                this._iosConfigMode(command, parts, cmd, session, device);
                break;
            case 'interface':
                this._iosInterfaceMode(command, parts, cmd, session, device);
                break;
        }
    }

    _iosUserMode(command, parts, rawCmd, session, device) {
        switch (command) {
            case 'enable':
            case 'en':
                session.mode = 'privileged';
                break;
            case 'ping':
                this._doPing(parts[1], device);
                break;
            case 'traceroute':
            case 'tracert':
                this._doTraceroute(parts[1], device);
                break;
            case 'show':
                this._iosShow(parts, session, device);
                break;
            case 'exit':
            case 'quit':
                this.closeTab(device.id);
                break;
            case '?':
            case 'help':
                this._addOutput('Available commands:');
                this._addOutput('  enable        Enter privileged EXEC mode');
                this._addOutput('  ping          Send ICMP echo');
                this._addOutput('  traceroute    Trace route to destination');
                this._addOutput('  show          Show running information');
                this._addOutput('  exit          Close terminal');
                break;
            default:
                this._addOutput(`% Unknown command "${command}"`, 'error');
        }
    }

    _iosPrivilegedMode(command, parts, rawCmd, session, device) {
        switch (command) {
            case 'configure':
            case 'conf':
                if (parts[1] === 'terminal' || parts[1] === 't' || !parts[1]) {
                    session.mode = 'config';
                    this._addOutput('Enter configuration commands, one per line. End with CNTL/Z.');
                }
                break;
            case 'show':
                this._iosShow(parts, session, device);
                break;
            case 'ping':
                this._doPing(parts[1], device);
                break;
            case 'traceroute':
            case 'tracert':
                this._doTraceroute(parts[1], device);
                break;
            case 'copy':
                this._addOutput('[OK] Configuration saved.', 'success');
                break;
            case 'write':
                this._addOutput('[OK] Configuration saved.', 'success');
                break;
            case 'clear':
                if (parts[1] === 'arp-cache' || parts[1] === 'arp') {
                    device.arpTable.clear();
                    this._addOutput('ARP cache cleared.', 'success');
                } else if (parts[1] === 'mac-address-table' || parts[1] === 'mac') {
                    device.macTable.clear();
                    this._addOutput('MAC address table cleared.', 'success');
                } else {
                    session.output = [];
                }
                break;
            case 'disable':
                session.mode = 'user';
                break;
            case 'exit':
                session.mode = 'user';
                break;
            case '?':
            case 'help':
                this._addOutput('Available commands:');
                this._addOutput('  configure     Enter configuration mode');
                this._addOutput('  show          Show running information');
                this._addOutput('  ping          Send ICMP echo');
                this._addOutput('  traceroute    Trace route to destination');
                this._addOutput('  copy          Copy configuration');
                this._addOutput('  write         Save configuration');
                this._addOutput('  clear         Clear counters/tables');
                this._addOutput('  disable       Return to user mode');
                this._addOutput('  exit          Return to user mode');
                break;
            default:
                this._addOutput(`% Unknown command "${command}"`, 'error');
        }
    }

    _iosConfigMode(command, parts, rawCmd, session, device) {
        switch (command) {
            case 'hostname':
                if (parts[1]) {
                    device.hostname = parts[1];
                    device.name = parts[1];
                    session.hostname = parts[1];
                    session.deviceName = parts[1];
                    this._renderTabs();
                } else {
                    this._addOutput('% Incomplete command.', 'error');
                }
                break;
            case 'interface':
            case 'int':
                const ifaceName = rawCmd.substring(rawCmd.indexOf(' ') + 1).trim();
                const iface = this._findInterface(device, ifaceName);
                if (iface) {
                    session.mode = 'interface';
                    session.configInterface = iface.name;
                } else {
                    this._addOutput(`% Invalid interface "${ifaceName}"`, 'error');
                }
                break;
            case 'ip':
                if (parts[1] === 'route') {
                    // ip route <network> <mask> <next-hop> [interface]
                    if (parts.length >= 5) {
                        device.routingTable.push({
                            network: parts[2],
                            mask: parts[3],
                            gateway: parts[4],
                            interface: parts[5] || null
                        });
                        this._addOutput('Static route added.', 'success');
                    } else {
                        this._addOutput('% Usage: ip route <network> <mask> <next-hop>', 'error');
                    }
                }
                break;
            case 'no':
                if (parts[1] === 'ip' && parts[2] === 'route') {
                    const idx = device.routingTable.findIndex(r =>
                        r.network === parts[3] && r.mask === parts[4]
                    );
                    if (idx !== -1) {
                        device.routingTable.splice(idx, 1);
                        this._addOutput('Route removed.', 'success');
                    }
                }
                break;
            case 'end':
                session.mode = 'privileged';
                break;
            case 'exit':
                session.mode = 'privileged';
                break;
            case '?':
            case 'help':
                this._addOutput('Available commands:');
                this._addOutput('  hostname      Set device hostname');
                this._addOutput('  interface     Configure interface');
                this._addOutput('  ip route      Add static route');
                this._addOutput('  no            Negate a command');
                this._addOutput('  end           Return to privileged mode');
                this._addOutput('  exit          Return to privileged mode');
                break;
            default:
                this._addOutput(`% Unknown command "${command}"`, 'error');
        }
    }

    _iosInterfaceMode(command, parts, rawCmd, session, device) {
        const iface = device.getInterface(session.configInterface);
        if (!iface) {
            this._addOutput('% Interface not found', 'error');
            session.mode = 'config';
            return;
        }

        switch (command) {
            case 'ip':
                if (parts[1] === 'address') {
                    if (parts[2] === 'dhcp') {
                        iface.dhcpEnabled = true;
                        this._addOutput('DHCP enabled on interface.', 'success');
                    } else if (parts[2] && parts[3]) {
                        if (Utils.isValidIPv4(parts[2]) && Utils.isValidIPv4(parts[3])) {
                            iface.ipAddress = parts[2];
                            iface.subnetMask = parts[3];
                            iface.dhcpEnabled = false;
                            this._addOutput(`IP address set to ${parts[2]} ${parts[3]}`, 'success');
                        } else {
                            this._addOutput('% Invalid IP address or mask', 'error');
                        }
                    } else {
                        this._addOutput('% Usage: ip address <ip> <mask> | dhcp', 'error');
                    }
                }
                break;
            case 'no':
                if (parts[1] === 'shutdown') {
                    iface.status = 'up';
                    this._addOutput(`%LINK-3-UPDOWN: Interface ${iface.name}, changed state to up`, 'success');
                } else if (parts[1] === 'ip' && parts[2] === 'address') {
                    iface.ipAddress = '';
                    iface.subnetMask = '255.255.255.0';
                    this._addOutput('IP address removed.', 'info');
                }
                break;
            case 'shutdown':
                iface.status = 'down';
                this._addOutput(`%LINK-3-UPDOWN: Interface ${iface.name}, changed state to down`, 'warning');
                break;
            case 'description':
                iface.description = rawCmd.substring(rawCmd.indexOf(' ') + 1);
                this._addOutput('Description set.', 'success');
                break;
            case 'speed':
                iface.speed = parts[1] || 'auto';
                this._addOutput(`Speed set to ${iface.speed}`, 'success');
                break;
            case 'duplex':
                iface.duplex = parts[1] || 'auto';
                this._addOutput(`Duplex set to ${iface.duplex}`, 'success');
                break;
            case 'clock':
                if (parts[1] === 'rate' && parts[2]) {
                    iface.clockRate = parseInt(parts[2]);
                    this._addOutput(`Clock rate set to ${iface.clockRate}`, 'success');
                }
                break;
            case 'exit':
                session.mode = 'config';
                session.configInterface = null;
                break;
            case 'end':
                session.mode = 'privileged';
                session.configInterface = null;
                break;
            case '?':
            case 'help':
                this._addOutput('Available commands:');
                this._addOutput('  ip address    Set IP address');
                this._addOutput('  no shutdown   Enable interface');
                this._addOutput('  shutdown      Disable interface');
                this._addOutput('  description   Set description');
                this._addOutput('  speed         Set port speed');
                this._addOutput('  duplex        Set duplex mode');
                this._addOutput('  clock rate    Set clock rate (serial)');
                this._addOutput('  exit          Return to config mode');
                this._addOutput('  end           Return to privileged mode');
                break;
            default:
                this._addOutput(`% Unknown command "${command}"`, 'error');
        }
    }

    // === Show Commands ===
    _iosShow(parts, session, device) {
        const subCmd = parts.slice(1).join(' ');
        switch (parts[1]) {
            case 'ip':
                if (parts[2] === 'interface' && parts[3] === 'brief') {
                    this._showIPInterfaceBrief(device);
                } else if (parts[2] === 'route') {
                    this._showIPRoute(device);
                } else if (parts[2] === 'arp') {
                    this._showARPTable(device);
                } else {
                    this._showIPInterfaceBrief(device);
                }
                break;
            case 'interfaces':
            case 'interface':
                if (parts[2]) {
                    this._showInterfaceDetail(device, parts.slice(2).join(' '));
                } else {
                    this._showIPInterfaceBrief(device);
                }
                break;
            case 'running-config':
            case 'run':
                this._showRunningConfig(device, session);
                break;
            case 'mac-address-table':
            case 'mac':
                this._showMACTable(device);
                break;
            case 'arp':
                this._showARPTable(device);
                break;
            case 'version':
                this._addOutput('ComNet IOS Simulator');
                this._addOutput(`Hostname: ${device.hostname}`);
                this._addOutput(`Type: ${device.type}`);
                this._addOutput(`Interfaces: ${device.interfaces.length}`);
                break;
            case 'vlan':
                if (device.vlans) {
                    this._addOutput('VLAN  Name              Status');
                    this._addOutput('----  ----------------  ------');
                    for (const [id, vlan] of Object.entries(device.vlans)) {
                        this._addOutput(`${String(id).padEnd(6)}${vlan.name.padEnd(18)}active`);
                    }
                }
                break;
            case '?':
            case undefined:
                this._addOutput('  ip interface brief   Show IP interface summary');
                this._addOutput('  ip route             Show IP routing table');
                this._addOutput('  ip arp               Show ARP table');
                this._addOutput('  running-config       Show running configuration');
                this._addOutput('  mac-address-table    Show MAC address table');
                this._addOutput('  interfaces           Show interface details');
                this._addOutput('  version              Show system version');
                this._addOutput('  vlan                 Show VLANs');
                break;
            default:
                this._addOutput(`% Unknown show command "${subCmd}"`, 'error');
        }
    }

    _showIPInterfaceBrief(device) {
        this._addOutput('Interface              IP-Address      OK? Method Status                Protocol');
        this._addOutput('-'.repeat(80));
        for (const iface of device.interfaces) {
            const name = iface.name.padEnd(23);
            const ip = (iface.ipAddress || 'unassigned').padEnd(16);
            const ok = 'YES'.padEnd(4);
            const method = (iface.dhcpEnabled ? 'DHCP' : 'manual').padEnd(7);
            const status = (iface.isConnected() ? (iface.status === 'up' ? 'up' : 'admin down') : 'down').padEnd(22);
            const proto = iface.isConnected() && iface.status === 'up' ? 'up' : 'down';
            this._addOutput(`${name}${ip}${ok}${method}${status}${proto}`);
        }
    }

    _showIPRoute(device) {
        this._addOutput('Codes: C - connected, S - static, R - RIP, O - OSPF');
        this._addOutput('');
        // Connected routes
        for (const iface of device.interfaces) {
            if (iface.ipAddress && iface.isUp()) {
                const net = Utils.getNetworkAddress(iface.ipAddress, iface.subnetMask);
                const cidr = Utils.maskToCIDR(iface.subnetMask);
                this._addOutput(`C    ${net}/${cidr} is directly connected, ${iface.name}`);
            }
        }
        // Static routes
        for (const route of device.routingTable) {
            const cidr = Utils.maskToCIDR(route.mask);
            this._addOutput(`S    ${route.network}/${cidr} [1/0] via ${route.gateway}${route.interface ? ', ' + route.interface : ''}`);
        }
    }

    _showARPTable(device) {
        this._addOutput('Protocol  Address          Age (min)  Hardware Addr   Type');
        this._addOutput('-'.repeat(65));
        for (const [ip, mac] of device.arpTable) {
            this._addOutput(`Internet  ${ip.padEnd(17)}0          ${mac}  ARPA`);
        }
        if (device.arpTable.size === 0) {
            this._addOutput('(ARP table is empty)');
        }
    }

    _showMACTable(device) {
        this._addOutput('Mac Address Table');
        this._addOutput('-'.repeat(50));
        this._addOutput('Vlan    Mac Address       Type      Ports');
        this._addOutput('----    -----------       --------  -----');
        for (const [mac, port] of device.macTable) {
            this._addOutput(`1       ${mac}  DYNAMIC   ${port}`);
        }
        if (device.macTable.size === 0) {
            this._addOutput('(MAC address table is empty)');
        }
    }

    _showRunningConfig(device, session) {
        this._addOutput('Building configuration...');
        this._addOutput('');
        this._addOutput('Current configuration:');
        this._addOutput('!');
        this._addOutput(`hostname ${device.hostname}`);
        this._addOutput('!');
        for (const iface of device.interfaces) {
            this._addOutput(`interface ${iface.name}`);
            if (iface.description) this._addOutput(` description ${iface.description}`);
            if (iface.ipAddress) {
                this._addOutput(` ip address ${iface.ipAddress} ${iface.subnetMask}`);
            } else {
                this._addOutput(' no ip address');
            }
            if (iface.status === 'down') this._addOutput(' shutdown');
            else this._addOutput(' no shutdown');
            this._addOutput('!');
        }
        for (const route of device.routingTable) {
            this._addOutput(`ip route ${route.network} ${route.mask} ${route.gateway}`);
        }
        this._addOutput('!');
        this._addOutput('end');
    }

    _showInterfaceDetail(device, ifaceName) {
        const iface = this._findInterface(device, ifaceName);
        if (!iface) {
            this._addOutput(`% Invalid interface "${ifaceName}"`, 'error');
            return;
        }
        this._addOutput(`${iface.name} is ${iface.status === 'up' ? 'up' : 'administratively down'}`);
        this._addOutput(`  Hardware is ${iface.type}, address is ${iface.macAddress}`);
        if (iface.description) this._addOutput(`  Description: ${iface.description}`);
        if (iface.ipAddress) {
            this._addOutput(`  Internet address is ${iface.ipAddress}/${Utils.maskToCIDR(iface.subnetMask)}`);
        }
        this._addOutput(`  MTU 1500 bytes, BW ${iface.speed}, DLY 100 usec`);
        this._addOutput(`  Duplex: ${iface.duplex}`);
        this._addOutput(`  Encapsulation: ${iface.type === 'serial' ? 'HDLC' : '802.3'}`);
    }

    _findInterface(device, nameStr) {
        const lower = nameStr.toLowerCase();
        // Try exact match first
        let match = device.interfaces.find(i => i.name.toLowerCase() === lower);
        if (match) return match;

        // Try abbreviation match
        match = device.interfaces.find(i => i.name.toLowerCase().startsWith(lower));
        if (match) return match;

        // Try partial
        const abbrevMap = {
            'fa': 'fastethernet', 'gi': 'gigabitethernet', 'gig': 'gigabitethernet',
            'se': 'serial', 'lo': 'loopback', 'eth': 'ethernet', 'e': 'ethernet',
            'wlan': 'wireless', 'wi': 'wireless'
        };

        for (const [abbr, full] of Object.entries(abbrevMap)) {
            if (lower.startsWith(abbr)) {
                const remainder = nameStr.substring(abbr.length);
                match = device.interfaces.find(i =>
                    i.name.toLowerCase().startsWith(full) && i.name.includes(remainder)
                );
                if (match) return match;
            }
        }

        return null;
    }

    // === PC Commands ===
    _executePCCommand(cmd, session, device) {
        const parts = cmd.split(/\s+/);
        const command = parts[0].toLowerCase();

        switch (command) {
            case 'ping':
                this._doPing(parts[1], device);
                break;
            case 'tracert':
            case 'traceroute':
                this._doTraceroute(parts[1], device);
                break;
            case 'ipconfig':
            case 'ifconfig':
                this._doIPConfig(parts, device);
                break;
            case 'arp':
                if (parts[1] === '-a') {
                    this._showARPTable(device);
                } else if (parts[1] === '-d') {
                    device.arpTable.clear();
                    this._addOutput('ARP cache flushed.', 'success');
                } else {
                    this._showARPTable(device);
                }
                break;
            case 'nslookup':
                this._addOutput('DNS lookup not yet configured.');
                break;
            case 'netstat':
                this._addOutput('Active Connections:');
                this._addOutput('  (none)');
                break;
            case 'cls':
            case 'clear':
                session.output = [];
                break;
            case 'help':
            case '?':
                this._addOutput('Available commands:');
                this._addOutput('  ping <ip>            Send ICMP echo request');
                this._addOutput('  tracert <ip>         Trace route to destination');
                this._addOutput('  ipconfig [/all]      Show IP configuration');
                this._addOutput('  arp -a               Show ARP table');
                this._addOutput('  arp -d               Clear ARP table');
                this._addOutput('  nslookup             DNS lookup');
                this._addOutput('  netstat              Show connections');
                this._addOutput('  cls                  Clear screen');
                this._addOutput('  help                 Show this help');
                break;
            default:
                this._addOutput(`'${command}' is not recognized as a command.`, 'error');
        }
    }

    // === Ping Implementation ===
    _doPing(targetIP, device) {
        if (!targetIP) {
            this._addOutput('Usage: ping <destination IP>', 'error');
            return;
        }

        if (!Utils.isValidIPv4(targetIP)) {
            this._addOutput(`% Invalid IP address: ${targetIP}`, 'error');
            return;
        }

        const srcIP = device.getPrimaryIP();
        if (!srcIP) {
            this._addOutput('% No IP address configured on this device.', 'error');
            return;
        }

        this._addOutput('');
        this._addOutput(`Pinging ${targetIP} with 32 bytes of data:`);
        this._addOutput('');

        const result = this.app.networkEngine.ping(device, targetIP);

        if (result.success) {
            for (let i = 0; i < 4; i++) {
                this._addOutput(`Reply from ${targetIP}: bytes=32 time<1ms TTL=128`, 'success');
            }
            this._addOutput('');
            this._addOutput(`Ping statistics for ${targetIP}:`);
            this._addOutput('    Packets: Sent = 4, Received = 4, Lost = 0 (0% loss)');

            // Animate
            const destDevice = this.app.networkEngine._findDeviceByIP(targetIP);
            if (destDevice) {
                this.app.packetAnimator.animatePing(device, destDevice, result.path, true);
                this.app.networkEngine.logEvent('ICMP', device.name, destDevice.name, 'ICMP', `Ping ${targetIP} - Success`, 'success');
            }
        } else {
            for (let i = 0; i < 4; i++) {
                this._addOutput(`Request timed out.`, 'error');
            }
            this._addOutput('');
            this._addOutput(`Ping statistics for ${targetIP}:`);
            this._addOutput('    Packets: Sent = 4, Received = 0, Lost = 4 (100% loss)');
            this._addOutput('');
            this._addOutput(`Reason: ${result.message}`, 'warning');

            this.app.networkEngine.logEvent('ICMP', device.name, targetIP, 'ICMP', `Ping ${targetIP} - Failed: ${result.message}`, 'failed');
        }
    }

    _doTraceroute(targetIP, device) {
        if (!targetIP) {
            this._addOutput('Usage: traceroute <destination IP>', 'error');
            return;
        }

        this._addOutput('');
        this._addOutput(`Tracing route to ${targetIP}:`);
        this._addOutput('');

        const result = this.app.networkEngine.traceroute(device, targetIP);

        for (let i = 0; i < result.hops.length; i++) {
            const hop = result.hops[i];
            const ip = hop.ip || '*';
            const status = (i === result.hops.length - 1 && result.success) ? '' : '';
            this._addOutput(`  ${(i + 1).toString().padStart(2)}   <1ms    ${ip.padEnd(18)} [${hop.deviceName}]`);
        }

        if (result.success) {
            this._addOutput('');
            this._addOutput('Trace complete.', 'success');
        } else {
            this._addOutput('');
            this._addOutput(`Trace incomplete: ${result.message}`, 'error');
        }
    }

    _doIPConfig(parts, device) {
        const showAll = parts[1] && parts[1].toLowerCase() === '/all';

        for (const iface of device.interfaces) {
            this._addOutput('');
            this._addOutput(`${iface.type === 'wireless' ? 'Wireless' : 'Ethernet'} adapter ${iface.name}:`);
            this._addOutput('');

            if (showAll) {
                this._addOutput(`   Description . . . . . . : ${iface.description || iface.name}`);
                this._addOutput(`   Physical Address. . . . : ${iface.macAddress}`);
                this._addOutput(`   DHCP Enabled. . . . . . : ${iface.dhcpEnabled ? 'Yes' : 'No'}`);
            }

            if (iface.ipAddress) {
                this._addOutput(`   IPv4 Address. . . . . . : ${iface.ipAddress}`);
                this._addOutput(`   Subnet Mask . . . . . . : ${iface.subnetMask}`);
                if (iface.defaultGateway) {
                    this._addOutput(`   Default Gateway . . . . : ${iface.defaultGateway}`);
                }
                if (showAll && iface.dnsServer) {
                    this._addOutput(`   DNS Server. . . . . . . : ${iface.dnsServer}`);
                }
            } else {
                this._addOutput('   Media State . . . . . . : Not configured');
            }

            this._addOutput(`   Link Status . . . . . . : ${iface.isConnected() ? (iface.isUp() ? 'Up' : 'Down') : 'Disconnected'}`);
        }
    }

    // Autocomplete
    _autocomplete(session) {
        const current = this.input.value.toLowerCase();
        if (!current) return;

        let commands = [];
        if (session.isIOS) {
            switch (session.mode) {
                case 'user': commands = ['enable', 'ping', 'traceroute', 'show', 'exit']; break;
                case 'privileged': commands = ['configure terminal', 'show', 'ping', 'traceroute', 'copy', 'write', 'clear', 'disable', 'exit']; break;
                case 'config': commands = ['hostname', 'interface', 'ip route', 'no', 'end', 'exit']; break;
                case 'interface': commands = ['ip address', 'no shutdown', 'shutdown', 'description', 'speed', 'duplex', 'clock rate', 'exit', 'end']; break;
            }
        } else {
            commands = ['ping', 'tracert', 'ipconfig', 'arp', 'nslookup', 'netstat', 'cls', 'help'];
        }

        const matches = commands.filter(c => c.startsWith(current));
        if (matches.length === 1) {
            this.input.value = matches[0] + ' ';
        } else if (matches.length > 1) {
            this._addOutput(this.promptEl.textContent + current);
            this._addOutput(matches.join('  '));
            this._renderOutput();
        }
    }
}
