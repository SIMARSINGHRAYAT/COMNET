/* ============================================
   ComNet Simulator - Main Application
   Ties all modules together
   ============================================ */

class ComNetApp {
    constructor() {
        this.devices = new Map();
        this.connectionManager = new ConnectionManager();
        this.currentTool = 'select';
        this.mode = 'realtime'; // realtime, simulation
        this.selectedCableType = 'ethernet';

        // Initialize engines
        this.networkEngine = new NetworkEngine(this);
        this.packetAnimator = new PacketAnimator(this);
        this.cli = new CLITerminal(this);

        // Initialize canvas renderer
        this.renderer = new CanvasRenderer(
            document.getElementById('network-canvas'),
            this
        );

        // Bind UI events
        this._bindToolbar();
        this._bindPalette();
        this._bindMenuActions();
        this._bindModalEvents();
        this._bindModeToggle();
        this._bindKeyboard();
        this._bindDragDrop();
        this._bindZoomControls();
        this._bindCLIPanel();
        this._bindSimulationControls();

        this.updateStatusBar();
        console.log('ComNet Simulator initialized.');
    }

    // === Toolbar ===
    _bindToolbar() {
        const tools = ['select', 'move', 'connect', 'delete', 'note', 'inspect', 'pdu'];
        tools.forEach(tool => {
            const btn = document.getElementById(`tool-${tool}`);
            if (btn) {
                btn.addEventListener('click', () => this.setTool(tool));
            }
        });
    }

    setTool(tool) {
        this.currentTool = tool;
        document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
        const btn = document.getElementById(`tool-${tool}`);
        if (btn) btn.classList.add('active');

        // Update canvas cursor class
        const container = document.getElementById('canvas-container');
        container.className = '';
        container.classList.add(`tool-${tool}`);

        // Reset connection state
        if (tool !== 'connect') {
            this.renderer.connectingFrom = null;
            this.renderer.tempLineEnd = null;
        }
        if (tool !== 'pdu') {
            this.renderer.pduSource = null;
        }

        document.getElementById('status-tool').textContent = `Tool: ${tool.charAt(0).toUpperCase() + tool.slice(1)}`;
    }

    // === Palette (Drag & Drop) ===
    _bindPalette() {
        // Category collapse
        document.querySelectorAll('.category-header').forEach(header => {
            header.addEventListener('click', () => {
                header.parentElement.classList.toggle('collapsed');
            });
        });

        // Cable type selection
        document.querySelectorAll('.connection-template').forEach(template => {
            template.addEventListener('click', () => {
                const cableType = template.dataset.cableType;
                this.selectedCableType = cableType;
                this.setTool('connect');
                Utils.notify(`Cable: ${cableType}. Click source device, then target.`, 'info');
            });
        });
    }

    _bindDragDrop() {
        const canvas = document.getElementById('canvas-container');

        // Handle drag from palette
        document.querySelectorAll('.device-template').forEach(template => {
            template.addEventListener('dragstart', (e) => {
                e.dataTransfer.setData('text/plain', template.dataset.deviceType);
                e.dataTransfer.effectAllowed = 'copy';
                canvas.classList.add('dragging-device');
            });

            template.addEventListener('dragend', () => {
                canvas.classList.remove('dragging-device');
            });
        });

        canvas.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
        });

        canvas.addEventListener('drop', (e) => {
            e.preventDefault();
            canvas.classList.remove('dragging-device');
            const deviceType = e.dataTransfer.getData('text/plain');
            if (!deviceType) return;

            const rect = canvas.getBoundingClientRect();
            const screenX = e.clientX - rect.left;
            const screenY = e.clientY - rect.top;
            const worldPos = this.renderer.screenToWorld(screenX, screenY);

            this.addDevice(deviceType, worldPos.x - 30, worldPos.y - 30);
        });
    }

    // === Device Management ===
    addDevice(type, x, y) {
        const device = DeviceFactory.create(type, x, y);
        if (!device) return null;

        // Snap to grid
        if (this.renderer.showGrid) {
            device.x = Math.round(device.x / this.renderer.gridSize) * this.renderer.gridSize;
            device.y = Math.round(device.y / this.renderer.gridSize) * this.renderer.gridSize;
        }

        this.devices.set(device.id, device);
        this.updateStatusBar();
        Utils.notify(`Added ${device.name}`, 'success', 1500);
        return device;
    }

    deleteDevice(deviceId) {
        const device = this.devices.get(deviceId);
        if (!device) return;

        // Remove all connections involving this device
        const conns = this.connectionManager.getByDevice(deviceId);
        for (const conn of conns) {
            this._disconnectInterfaces(conn);
            this.connectionManager.remove(conn.id);
        }

        // Close CLI tab if open
        this.cli.closeTab(deviceId);

        this.devices.delete(deviceId);
        this.hideProperties();
        this.updateStatusBar();
        Utils.notify(`Deleted ${device.name}`, 'info', 1500);
    }

    // === Connection Management ===
    createConnection(deviceAId, ifaceAName, deviceBId, ifaceBName) {
        const devA = this.devices.get(deviceAId);
        const devB = this.devices.get(deviceBId);
        if (!devA || !devB) return null;

        const ifaceA = devA.getInterface(ifaceAName);
        const ifaceB = devB.getInterface(ifaceBName);
        if (!ifaceA || !ifaceB) return null;

        if (ifaceA.isConnected() || ifaceB.isConnected()) {
            Utils.notify('One or both ports are already connected!', 'warning');
            return null;
        }

        // Determine cable type
        const cableType = this.selectedCableType || Connection.autoCableType(devA, devB);

        const conn = new Connection(deviceAId, ifaceAName, deviceBId, ifaceBName, cableType);
        this.connectionManager.add(conn);

        // Mark interfaces as connected
        ifaceA.connectedTo = { deviceId: deviceBId, interfaceName: ifaceBName };
        ifaceA.status = 'up';
        ifaceB.connectedTo = { deviceId: deviceAId, interfaceName: ifaceAName };
        ifaceB.status = 'up';

        this.updateStatusBar();
        Utils.notify(`Connected ${devA.name}:${ifaceAName} → ${devB.name}:${ifaceBName}`, 'success', 2000);
        return conn;
    }

    deleteConnection(connId) {
        const conn = this.connectionManager.getAll().find(c => c.id === connId);
        if (!conn) return;

        this._disconnectInterfaces(conn);
        this.connectionManager.remove(connId);
        this.hideProperties();
        this.updateStatusBar();
        Utils.notify('Connection removed', 'info', 1500);
    }

    _disconnectInterfaces(conn) {
        const devA = this.devices.get(conn.deviceA);
        const devB = this.devices.get(conn.deviceB);
        if (devA) {
            const ifaceA = devA.getInterface(conn.interfaceA);
            if (ifaceA) {
                ifaceA.connectedTo = null;
                ifaceA.status = 'down';
            }
        }
        if (devB) {
            const ifaceB = devB.getInterface(conn.interfaceB);
            if (ifaceB) {
                ifaceB.connectedTo = null;
                ifaceB.status = 'down';
            }
        }
    }

    // === Ping (Simple PDU) ===
    sendPing(sourceDevice, destDevice) {
        const destIP = destDevice.getPrimaryIP();
        if (!destIP) {
            Utils.notify(`${destDevice.name} has no IP configured.`, 'error');
            return;
        }

        const result = this.networkEngine.ping(sourceDevice, destIP);

        if (result.success) {
            Utils.notify(`Ping ${sourceDevice.name} → ${destDevice.name}: Success!`, 'success');
            this.packetAnimator.animatePing(sourceDevice, destDevice, result.path, true);
            this.networkEngine.logEvent('ICMP', sourceDevice.name, destDevice.name, 'ICMP', `Echo Request/Reply - Success`, 'success');
        } else {
            Utils.notify(`Ping ${sourceDevice.name} → ${destDevice.name}: Failed - ${result.message}`, 'error');
            this.packetAnimator.animatePing(sourceDevice, destDevice, result.path, false);
            this.networkEngine.logEvent('ICMP', sourceDevice.name, destDevice.name, 'ICMP', `Echo Request - Failed: ${result.message}`, 'failed');
        }
    }

    // === Properties Panel ===
    showProperties(device) {
        const panel = document.getElementById('properties-panel');
        const content = document.getElementById('panel-content');
        const title = document.getElementById('panel-title');

        panel.classList.remove('hidden');
        title.textContent = `${device.name} Properties`;

        content.innerHTML = this._buildPropertiesHTML(device);
        this._bindPropertyEvents(device);
    }

    _buildPropertiesHTML(device) {
        let html = '';

        // General
        html += `<div class="prop-group">
            <div class="prop-group-header">General</div>
            <div class="prop-row"><label>Name</label><input type="text" id="prop-name" value="${Utils.escapeHtml(device.name)}"></div>
            <div class="prop-row"><label>Type</label><input type="text" value="${device.type}" disabled></div>
            <div class="prop-row"><label>Hostname</label><input type="text" id="prop-hostname" value="${Utils.escapeHtml(device.hostname)}"></div>
            <div class="prop-row"><label>Powered</label><input type="checkbox" id="prop-powered" ${device.powered ? 'checked' : ''}></div>
        </div>`;

        // Interfaces
        html += `<div class="prop-group">
            <div class="prop-group-header">Interfaces</div>
            <table class="interface-table">
                <tr><th>Interface</th><th>IP Address</th><th>Status</th></tr>`;
        for (const iface of device.interfaces) {
            const statusClass = iface.isConnected() && iface.isUp() ? 'up' : 'down';
            html += `<tr>
                <td>${iface.name}</td>
                <td>${iface.ipAddress || '<em>none</em>'}</td>
                <td><span class="status-dot ${statusClass}"></span>${iface.status}</td>
            </tr>`;
        }
        html += `</table></div>`;

        // Quick IP Config for first interface
        const firstIface = device.interfaces[0];
        if (firstIface) {
            html += `<div class="prop-group">
                <div class="prop-group-header">Quick IP Config (${firstIface.name})</div>
                <div class="prop-row"><label>IP Address</label><input type="text" id="prop-ip" value="${firstIface.ipAddress}" placeholder="e.g. 192.168.1.1"></div>
                <div class="prop-row"><label>Subnet Mask</label><input type="text" id="prop-mask" value="${firstIface.subnetMask}" placeholder="255.255.255.0"></div>
                <div class="prop-row"><label>Gateway</label><input type="text" id="prop-gateway" value="${firstIface.defaultGateway}" placeholder="e.g. 192.168.1.1"></div>
                <div class="prop-row"><label>DNS</label><input type="text" id="prop-dns" value="${firstIface.dnsServer}" placeholder="e.g. 8.8.8.8"></div>
                <button class="prop-btn" id="prop-apply-ip">Apply IP Config</button>
            </div>`;
        }

        // Actions
        html += `<div class="prop-group">
            <div class="prop-group-header">Actions</div>
            <button class="prop-btn secondary" id="prop-open-cli">Open CLI / Terminal</button>
            <button class="prop-btn secondary" id="prop-open-config">Full Configuration</button>
            <button class="prop-btn danger" id="prop-delete-device">Delete Device</button>
        </div>`;

        // Notes
        html += `<div class="prop-group">
            <div class="prop-group-header">Notes</div>
            <textarea id="prop-notes" style="width:100%;height:60px;background:var(--bg-tertiary);border:1px solid var(--border-color);border-radius:var(--radius-sm);color:var(--text-primary);padding:6px;font-family:inherit;font-size:12px;resize:vertical;">${Utils.escapeHtml(device.notes || '')}</textarea>
        </div>`;

        return html;
    }

    _bindPropertyEvents(device) {
        // Name change
        const nameInput = document.getElementById('prop-name');
        if (nameInput) {
            nameInput.addEventListener('change', () => {
                device.name = nameInput.value;
                device.hostname = nameInput.value;
            });
        }

        // Hostname
        const hostnameInput = document.getElementById('prop-hostname');
        if (hostnameInput) {
            hostnameInput.addEventListener('change', () => {
                device.hostname = hostnameInput.value;
            });
        }

        // Powered
        const poweredInput = document.getElementById('prop-powered');
        if (poweredInput) {
            poweredInput.addEventListener('change', () => {
                device.powered = poweredInput.checked;
            });
        }

        // IP Config
        const applyBtn = document.getElementById('prop-apply-ip');
        if (applyBtn) {
            applyBtn.addEventListener('click', () => {
                const ip = document.getElementById('prop-ip').value.trim();
                const mask = document.getElementById('prop-mask').value.trim();
                const gw = document.getElementById('prop-gateway').value.trim();
                const dns = document.getElementById('prop-dns').value.trim();

                const iface = device.interfaces[0];
                if (!iface) return;

                if (ip && !Utils.isValidIPv4(ip)) {
                    Utils.notify('Invalid IP address', 'error');
                    return;
                }
                if (mask && !Utils.isValidSubnet(mask)) {
                    Utils.notify('Invalid subnet mask', 'error');
                    return;
                }
                if (gw && !Utils.isValidIPv4(gw)) {
                    Utils.notify('Invalid gateway', 'error');
                    return;
                }

                iface.ipAddress = ip;
                iface.subnetMask = mask || '255.255.255.0';
                iface.defaultGateway = gw;
                iface.dnsServer = dns;
                if (ip) iface.dhcpEnabled = false;

                Utils.notify(`IP configured: ${ip}/${mask}`, 'success');
                this.showProperties(device); // Refresh
            });
        }

        // Open CLI
        const cliBtn = document.getElementById('prop-open-cli');
        if (cliBtn) {
            cliBtn.addEventListener('click', () => {
                this.cli.open(device);
            });
        }

        // Full config
        const configBtn = document.getElementById('prop-open-config');
        if (configBtn) {
            configBtn.addEventListener('click', () => {
                this.showDeviceConfig(device);
            });
        }

        // Delete
        const deleteBtn = document.getElementById('prop-delete-device');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', () => {
                this.deleteDevice(device.id);
            });
        }

        // Notes
        const notesInput = document.getElementById('prop-notes');
        if (notesInput) {
            notesInput.addEventListener('input', () => {
                device.notes = notesInput.value;
            });
        }
    }

    showConnectionProperties(conn) {
        const panel = document.getElementById('properties-panel');
        const content = document.getElementById('panel-content');
        const title = document.getElementById('panel-title');

        panel.classList.remove('hidden');
        title.textContent = 'Connection Properties';

        const devA = this.devices.get(conn.deviceA);
        const devB = this.devices.get(conn.deviceB);

        content.innerHTML = `
            <div class="prop-group">
                <div class="prop-group-header">Connection</div>
                <div class="prop-row"><label>Cable Type</label><input value="${conn.cableType}" disabled></div>
                <div class="prop-row"><label>Status</label><input value="${conn.status}" disabled></div>
            </div>
            <div class="prop-group">
                <div class="prop-group-header">Endpoint A</div>
                <div class="prop-row"><label>Device</label><input value="${devA ? devA.name : 'Unknown'}" disabled></div>
                <div class="prop-row"><label>Interface</label><input value="${conn.interfaceA}" disabled></div>
            </div>
            <div class="prop-group">
                <div class="prop-group-header">Endpoint B</div>
                <div class="prop-row"><label>Device</label><input value="${devB ? devB.name : 'Unknown'}" disabled></div>
                <div class="prop-row"><label>Interface</label><input value="${conn.interfaceB}" disabled></div>
            </div>
            <button class="prop-btn danger" id="prop-delete-conn">Delete Connection</button>
        `;

        document.getElementById('prop-delete-conn').addEventListener('click', () => {
            this.deleteConnection(conn.id);
        });
    }

    hideProperties() {
        document.getElementById('properties-panel').classList.add('hidden');
    }

    // === Device Config Modal ===
    showDeviceConfig(device) {
        const modal = document.getElementById('config-modal');
        const title = document.getElementById('config-modal-title');
        const tabContent = document.getElementById('config-tab-content');

        modal.classList.remove('hidden');
        title.textContent = `${device.name} - Configuration`;

        // Show appropriate tabs
        const tabs = document.querySelectorAll('.config-tab');
        tabs.forEach(t => {
            t.classList.remove('active');
            // Hide desktop tab for network devices
            if (t.dataset.tab === 'desktop' && ['router', 'switch', 'hub', 'bridge'].includes(device.type)) {
                t.style.display = 'none';
            } else {
                t.style.display = '';
            }
        });
        tabs[0].classList.add('active');

        this._showConfigTab('physical', device);

        // Tab click handlers
        tabs.forEach(tab => {
            tab.onclick = () => {
                tabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                this._showConfigTab(tab.dataset.tab, device);
            };
        });
    }

    _showConfigTab(tabName, device) {
        const tabContent = document.getElementById('config-tab-content');

        switch (tabName) {
            case 'physical':
                tabContent.innerHTML = this._buildPhysicalTab(device);
                break;
            case 'config':
                tabContent.innerHTML = this._buildConfigTab(device);
                this._bindConfigTabEvents(device);
                break;
            case 'cli':
                tabContent.innerHTML = this._buildCLITab(device);
                this._bindCLITabEvents(device);
                break;
            case 'desktop':
                tabContent.innerHTML = this._buildDesktopTab(device);
                this._bindDesktopTabEvents(device);
                break;
        }
    }

    _buildPhysicalTab(device) {
        let html = `<div class="config-section">
            <h3>Device Information</h3>
            <div class="config-field"><label>Device Name:</label><input value="${device.name}" disabled></div>
            <div class="config-field"><label>Device Type:</label><input value="${device.type}" disabled></div>
            <div class="config-field"><label>Port Count:</label><input value="${device.interfaces.length}" disabled></div>
            <div class="config-field"><label>Power Status:</label><input value="${device.powered ? 'ON' : 'OFF'}" disabled></div>
        </div>`;

        html += `<div class="config-section">
            <h3>Physical Ports</h3>
            <table class="interface-table">
                <tr><th>Port</th><th>Type</th><th>Speed</th><th>MAC Address</th><th>Status</th><th>Connected To</th></tr>`;
        for (const iface of device.interfaces) {
            const connTo = iface.connectedTo ?
                `${this.devices.get(iface.connectedTo.deviceId)?.name || '?'}:${iface.connectedTo.interfaceName}` :
                'Not connected';
            html += `<tr>
                <td>${iface.name}</td>
                <td>${iface.type}</td>
                <td>${iface.speed}</td>
                <td style="font-family:monospace;font-size:11px">${iface.macAddress}</td>
                <td><span class="status-dot ${iface.isUp() ? 'up' : 'down'}"></span>${iface.status}</td>
                <td>${connTo}</td>
            </tr>`;
        }
        html += `</table></div>`;
        return html;
    }

    _buildConfigTab(device) {
        let html = '';

        // Interface config
        for (const iface of device.interfaces) {
            if (iface.type === 'console') continue;
            html += `<div class="config-section">
                <h3>${iface.name}</h3>
                <div class="config-field"><label>IP Address:</label>
                    <input type="text" class="iface-ip" data-iface="${iface.name}" value="${iface.ipAddress}" placeholder="e.g. 192.168.1.1">
                </div>
                <div class="config-field"><label>Subnet Mask:</label>
                    <input type="text" class="iface-mask" data-iface="${iface.name}" value="${iface.subnetMask}">
                </div>
                <div class="config-field"><label>Default Gateway:</label>
                    <input type="text" class="iface-gw" data-iface="${iface.name}" value="${iface.defaultGateway}">
                </div>
                <div class="config-field"><label>DNS Server:</label>
                    <input type="text" class="iface-dns" data-iface="${iface.name}" value="${iface.dnsServer}">
                </div>
                <div class="config-field"><label>DHCP:</label>
                    <input type="checkbox" class="iface-dhcp" data-iface="${iface.name}" ${iface.dhcpEnabled ? 'checked' : ''}>
                </div>
                <div class="config-field"><label>Status:</label>
                    <select class="iface-status" data-iface="${iface.name}">
                        <option value="up" ${iface.status === 'up' ? 'selected' : ''}>Up</option>
                        <option value="down" ${iface.status === 'down' ? 'selected' : ''}>Down</option>
                    </select>
                </div>
            </div>`;
        }

        // Routing table for routers
        if (device.canRoute && device.canRoute()) {
            html += `<div class="config-section">
                <h3>Static Routes</h3>
                <table class="interface-table" id="route-table">
                    <tr><th>Network</th><th>Mask</th><th>Next Hop</th><th>Interface</th><th></th></tr>`;
            for (let i = 0; i < device.routingTable.length; i++) {
                const r = device.routingTable[i];
                html += `<tr>
                    <td>${r.network}</td><td>${r.mask}</td><td>${r.gateway}</td><td>${r.interface || '-'}</td>
                    <td><button class="delete-route" data-idx="${i}" style="background:none;border:none;color:var(--accent-red);cursor:pointer"><i class="fas fa-trash"></i></button></td>
                </tr>`;
            }
            html += `</table>
                <div class="config-field" style="margin-top:8px">
                    <input id="new-route-net" placeholder="Network" style="flex:1;margin-right:4px;padding:4px 6px;background:var(--bg-tertiary);border:1px solid var(--border-color);border-radius:var(--radius-sm);color:var(--text-primary);font-size:12px">
                    <input id="new-route-mask" placeholder="Mask" style="flex:1;margin-right:4px;padding:4px 6px;background:var(--bg-tertiary);border:1px solid var(--border-color);border-radius:var(--radius-sm);color:var(--text-primary);font-size:12px">
                    <input id="new-route-gw" placeholder="Next Hop" style="flex:1;margin-right:4px;padding:4px 6px;background:var(--bg-tertiary);border:1px solid var(--border-color);border-radius:var(--radius-sm);color:var(--text-primary);font-size:12px">
                    <button class="prop-btn" id="add-route-btn" style="flex:0;width:auto;margin:0;padding:4px 12px">Add</button>
                </div>
            </div>`;
        }

        html += `<button class="prop-btn" id="apply-config-btn" style="margin-top:12px">Apply All Changes</button>`;
        return html;
    }

    _bindConfigTabEvents(device) {
        // Apply config
        const applyBtn = document.getElementById('apply-config-btn');
        if (applyBtn) {
            applyBtn.addEventListener('click', () => {
                // Gather all interface configs
                document.querySelectorAll('.iface-ip').forEach(input => {
                    const ifaceName = input.dataset.iface;
                    const iface = device.getInterface(ifaceName);
                    if (!iface) return;

                    const ip = input.value.trim();
                    const maskInput = document.querySelector(`.iface-mask[data-iface="${ifaceName}"]`);
                    const gwInput = document.querySelector(`.iface-gw[data-iface="${ifaceName}"]`);
                    const dnsInput = document.querySelector(`.iface-dns[data-iface="${ifaceName}"]`);
                    const dhcpInput = document.querySelector(`.iface-dhcp[data-iface="${ifaceName}"]`);
                    const statusInput = document.querySelector(`.iface-status[data-iface="${ifaceName}"]`);

                    if (ip && !Utils.isValidIPv4(ip)) {
                        Utils.notify(`Invalid IP on ${ifaceName}`, 'error');
                        return;
                    }

                    iface.ipAddress = ip;
                    if (maskInput) iface.subnetMask = maskInput.value.trim() || '255.255.255.0';
                    if (gwInput) iface.defaultGateway = gwInput.value.trim();
                    if (dnsInput) iface.dnsServer = dnsInput.value.trim();
                    if (dhcpInput) iface.dhcpEnabled = dhcpInput.checked;
                    if (statusInput) iface.status = statusInput.value;
                });

                Utils.notify('Configuration applied!', 'success');
            });
        }

        // Add route
        const addRouteBtn = document.getElementById('add-route-btn');
        if (addRouteBtn) {
            addRouteBtn.addEventListener('click', () => {
                const net = document.getElementById('new-route-net').value.trim();
                const mask = document.getElementById('new-route-mask').value.trim();
                const gw = document.getElementById('new-route-gw').value.trim();

                if (!net || !mask || !gw) {
                    Utils.notify('Fill in all route fields', 'error');
                    return;
                }

                device.routingTable.push({ network: net, mask: mask, gateway: gw, interface: null });
                Utils.notify('Route added', 'success');
                this._showConfigTab('config', device); // refresh
            });
        }

        // Delete route
        document.querySelectorAll('.delete-route').forEach(btn => {
            btn.addEventListener('click', () => {
                const idx = parseInt(btn.dataset.idx);
                device.routingTable.splice(idx, 1);
                this._showConfigTab('config', device);
            });
        });
    }

    _buildCLITab(device) {
        return `
            <div style="background:var(--bg-tertiary);border-radius:var(--radius);padding:12px;height:400px;display:flex;flex-direction:column">
                <div id="modal-cli-output" style="flex:1;overflow-y:auto;font-family:'Cascadia Code','Consolas',monospace;font-size:12px;line-height:1.5;white-space:pre-wrap;color:var(--text-primary);margin-bottom:8px"></div>
                <div style="display:flex;align-items:center;font-family:'Cascadia Code','Consolas',monospace;font-size:12px">
                    <span id="modal-cli-prompt" style="color:var(--accent-green)">${device.hostname}></span>
                    <input id="modal-cli-input" type="text" style="flex:1;background:transparent;border:none;outline:none;color:var(--text-primary);font-family:inherit;font-size:inherit;padding-left:4px" spellcheck="false">
                </div>
            </div>
        `;
    }

    _bindCLITabEvents(device) {
        const output = document.getElementById('modal-cli-output');
        const input = document.getElementById('modal-cli-input');
        const prompt = document.getElementById('modal-cli-prompt');

        if (!input) return;

        // Create a mini CLI session
        const session = {
            deviceId: device.id,
            deviceName: device.name,
            deviceType: device.type,
            isIOS: ['router', 'switch', 'firewall'].includes(device.type),
            mode: ['router', 'switch', 'firewall'].includes(device.type) ? 'user' : 'prompt',
            configInterface: null,
            output: [],
            hostname: device.hostname
        };

        const updatePrompt = () => {
            if (session.isIOS) {
                switch (session.mode) {
                    case 'user': prompt.textContent = `${session.hostname}>`; break;
                    case 'privileged': prompt.textContent = `${session.hostname}#`; break;
                    case 'config': prompt.textContent = `${session.hostname}(config)#`; break;
                    case 'interface': prompt.textContent = `${session.hostname}(config-if)#`; break;
                }
            } else {
                prompt.textContent = 'C:\\>';
            }
        };

        const render = () => {
            output.innerHTML = session.output.map(line => {
                if (typeof line === 'object') return `<span class="cli-${line.type}">${Utils.escapeHtml(line.text)}</span>`;
                return Utils.escapeHtml(line);
            }).join('\n');
            output.scrollTop = output.scrollHeight;
        };

        // Hook into CLI system temporarily
        const origSession = this.cli.sessions.get(device.id);
        this.cli.sessions.set(device.id, session);
        this.cli.activeDeviceId = device.id;

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                const cmd = input.value;
                input.value = '';
                session.output.push(prompt.textContent + cmd);
                if (cmd.trim()) {
                    this.cli._executeCommand(cmd.trim(), session);
                }
                render();
                updatePrompt();
            }
        });

        session.output.push(`${device.hostname} Console`);
        session.output.push('Type "?" or "help" for available commands.');
        session.output.push('');
        render();
        input.focus();
    }

    _buildDesktopTab(device) {
        return `
            <div class="desktop-apps">
                <div class="desktop-app" data-app="cmd">
                    <i class="fas fa-terminal"></i>
                    <span>Command Prompt</span>
                </div>
                <div class="desktop-app" data-app="ipconfig">
                    <i class="fas fa-cog"></i>
                    <span>IP Configuration</span>
                </div>
                <div class="desktop-app" data-app="browser">
                    <i class="fas fa-globe"></i>
                    <span>Web Browser</span>
                </div>
                <div class="desktop-app" data-app="email">
                    <i class="fas fa-envelope"></i>
                    <span>Email Client</span>
                </div>
            </div>
            <div id="desktop-app-window"></div>
        `;
    }

    _bindDesktopTabEvents(device) {
        document.querySelectorAll('.desktop-app').forEach(app => {
            app.addEventListener('click', () => {
                const appName = app.dataset.app;
                const window = document.getElementById('desktop-app-window');

                switch (appName) {
                    case 'cmd':
                        this.cli.open(device);
                        document.getElementById('config-modal').classList.add('hidden');
                        break;
                    case 'ipconfig':
                        window.innerHTML = this._buildIPConfigWindow(device);
                        this._bindIPConfigWindow(device, window);
                        break;
                    case 'browser':
                        window.innerHTML = `<div class="desktop-window">
                            <div class="desktop-window-header">Web Browser</div>
                            <div class="desktop-window-body" style="text-align:center;padding:40px">
                                <i class="fas fa-globe" style="font-size:48px;color:var(--accent-blue);margin-bottom:12px"></i>
                                <p style="color:var(--text-muted)">No web services configured yet.</p>
                            </div>
                        </div>`;
                        break;
                    case 'email':
                        window.innerHTML = `<div class="desktop-window">
                            <div class="desktop-window-header">Email Client</div>
                            <div class="desktop-window-body" style="text-align:center;padding:40px">
                                <i class="fas fa-envelope" style="font-size:48px;color:var(--accent-purple);margin-bottom:12px"></i>
                                <p style="color:var(--text-muted)">No email services configured yet.</p>
                            </div>
                        </div>`;
                        break;
                }
            });
        });
    }

    _buildIPConfigWindow(device) {
        const iface = device.interfaces[0];
        return `<div class="desktop-window">
            <div class="desktop-window-header">IP Configuration <button id="ip-config-close" style="background:none;border:none;color:var(--text-muted);cursor:pointer"><i class="fas fa-times"></i></button></div>
            <div class="desktop-window-body">
                <div class="config-field"><label style="width:120px">DHCP</label><input type="checkbox" id="desk-dhcp" ${iface?.dhcpEnabled ? 'checked' : ''}></div>
                <div class="config-field"><label style="width:120px">IP Address</label><input type="text" id="desk-ip" value="${iface?.ipAddress || ''}" placeholder="192.168.1.10"></div>
                <div class="config-field"><label style="width:120px">Subnet Mask</label><input type="text" id="desk-mask" value="${iface?.subnetMask || '255.255.255.0'}"></div>
                <div class="config-field"><label style="width:120px">Default Gateway</label><input type="text" id="desk-gw" value="${iface?.defaultGateway || ''}" placeholder="192.168.1.1"></div>
                <div class="config-field"><label style="width:120px">DNS Server</label><input type="text" id="desk-dns" value="${iface?.dnsServer || ''}" placeholder="8.8.8.8"></div>
                <button class="prop-btn" id="desk-apply" style="margin-top:12px">Apply</button>
            </div>
        </div>`;
    }

    _bindIPConfigWindow(device, container) {
        document.getElementById('desk-apply')?.addEventListener('click', () => {
            const iface = device.interfaces[0];
            if (!iface) return;
            const ip = document.getElementById('desk-ip').value.trim();
            const mask = document.getElementById('desk-mask').value.trim();
            const gw = document.getElementById('desk-gw').value.trim();
            const dns = document.getElementById('desk-dns').value.trim();
            const dhcp = document.getElementById('desk-dhcp').checked;

            if (ip && !Utils.isValidIPv4(ip)) { Utils.notify('Invalid IP', 'error'); return; }
            iface.ipAddress = ip;
            iface.subnetMask = mask || '255.255.255.0';
            iface.defaultGateway = gw;
            iface.dnsServer = dns;
            iface.dhcpEnabled = dhcp;
            Utils.notify('IP configuration saved!', 'success');
        });

        document.getElementById('ip-config-close')?.addEventListener('click', () => {
            container.innerHTML = '';
        });
    }

    // === Context Menu ===
    showContextMenu(x, y, device) {
        this._closeContextMenu();
        const menu = document.createElement('div');
        menu.className = 'context-menu';
        menu.style.left = x + 'px';
        menu.style.top = y + 'px';

        if (device) {
            menu.innerHTML = `
                <div class="context-menu-item" data-action="properties"><i class="fas fa-info-circle"></i>Properties</div>
                <div class="context-menu-item" data-action="config"><i class="fas fa-cog"></i>Configuration</div>
                <div class="context-menu-item" data-action="cli"><i class="fas fa-terminal"></i>Open CLI</div>
                <div class="context-menu-divider"></div>
                <div class="context-menu-item" data-action="ping-from"><i class="fas fa-satellite-dish"></i>Ping From Here</div>
                <div class="context-menu-divider"></div>
                <div class="context-menu-item" data-action="power"><i class="fas fa-power-off"></i>${device.powered ? 'Power Off' : 'Power On'}</div>
                <div class="context-menu-item" data-action="duplicate"><i class="fas fa-clone"></i>Duplicate</div>
                <div class="context-menu-item" data-action="delete"><i class="fas fa-trash"></i>Delete</div>
            `;
        } else {
            menu.innerHTML = `
                <div class="context-menu-item" data-action="paste"><i class="fas fa-paste"></i>Paste Device</div>
                <div class="context-menu-item" data-action="zoom-fit"><i class="fas fa-expand"></i>Fit to Screen</div>
                <div class="context-menu-item" data-action="select-all"><i class="fas fa-object-group"></i>Select All</div>
            `;
        }

        document.body.appendChild(menu);

        menu.querySelectorAll('.context-menu-item').forEach(item => {
            item.addEventListener('click', () => {
                this._handleContextAction(item.dataset.action, device);
                this._closeContextMenu();
            });
        });

        // Close on outside click
        setTimeout(() => {
            document.addEventListener('mousedown', this._contextMenuClose = () => {
                this._closeContextMenu();
            }, { once: true });
        }, 50);
    }

    _handleContextAction(action, device) {
        switch (action) {
            case 'properties': if (device) this.showProperties(device); break;
            case 'config': if (device) this.showDeviceConfig(device); break;
            case 'cli': if (device) this.cli.open(device); break;
            case 'power':
                if (device) {
                    device.powered = !device.powered;
                    Utils.notify(`${device.name} powered ${device.powered ? 'on' : 'off'}`, 'info');
                }
                break;
            case 'duplicate':
                if (device) {
                    const newDev = this.addDevice(device.type, device.x + 80, device.y + 80);
                    if (newDev) {
                        // Copy IP config from first interface
                        for (let i = 0; i < device.interfaces.length && i < newDev.interfaces.length; i++) {
                            newDev.interfaces[i].subnetMask = device.interfaces[i].subnetMask;
                        }
                    }
                }
                break;
            case 'delete': if (device) this.deleteDevice(device.id); break;
            case 'zoom-fit': this.renderer.zoomFit(); break;
            case 'select-all':
                for (const [id, dev] of this.devices) dev.selected = true;
                break;
            case 'ping-from':
                if (device) {
                    this.renderer.pduSource = device;
                    this.setTool('pdu');
                    Utils.notify(`PDU Source: ${device.name}. Click destination.`, 'info');
                }
                break;
        }
    }

    _closeContextMenu() {
        document.querySelectorAll('.context-menu').forEach(m => m.remove());
    }

    // === Menu Actions ===
    _bindMenuActions() {
        document.getElementById('btn-new')?.addEventListener('click', () => this.newTopology());
        document.getElementById('btn-save')?.addEventListener('click', () => this.saveTopology());
        document.getElementById('btn-open')?.addEventListener('click', () => document.getElementById('file-input').click());
        document.getElementById('btn-export-png')?.addEventListener('click', () => this.renderer.exportPNG());
        document.getElementById('btn-zoom-in')?.addEventListener('click', () => this.renderer.zoomIn());
        document.getElementById('btn-zoom-out')?.addEventListener('click', () => this.renderer.zoomOut());
        document.getElementById('btn-zoom-fit')?.addEventListener('click', () => this.renderer.zoomFit());
        document.getElementById('btn-toggle-grid')?.addEventListener('click', () => {
            this.renderer.showGrid = !this.renderer.showGrid;
        });
        document.getElementById('btn-toggle-labels')?.addEventListener('click', () => {
            this.renderer.showLabels = !this.renderer.showLabels;
        });
        document.getElementById('btn-toggle-ports')?.addEventListener('click', () => {
            this.renderer.showPortLabels = !this.renderer.showPortLabels;
        });
        document.getElementById('btn-delete-selected')?.addEventListener('click', () => this.deleteSelected());
        document.getElementById('btn-select-all')?.addEventListener('click', () => {
            for (const [id, dev] of this.devices) dev.selected = true;
        });

        // File input
        document.getElementById('file-input')?.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                this.loadTopology(e.target.files[0]);
                e.target.value = '';
            }
        });

        // Close panel
        document.getElementById('close-panel')?.addEventListener('click', () => this.hideProperties());
    }

    // === Modal Events ===
    _bindModalEvents() {
        document.querySelectorAll('.modal-close').forEach(btn => {
            btn.addEventListener('click', () => {
                btn.closest('.modal').classList.add('hidden');
            });
        });

        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) modal.classList.add('hidden');
            });
        });
    }

    // === Mode Toggle ===
    _bindModeToggle() {
        document.getElementById('btn-realtime')?.addEventListener('click', () => {
            this.mode = 'realtime';
            document.getElementById('btn-realtime').classList.add('active');
            document.getElementById('btn-simulation').classList.remove('active');
            document.getElementById('simulation-controls').classList.add('hidden');
            document.getElementById('packet-list-panel').classList.add('hidden');
            document.getElementById('status-mode').textContent = 'Mode: Realtime';
        });

        document.getElementById('btn-simulation')?.addEventListener('click', () => {
            this.mode = 'simulation';
            document.getElementById('btn-simulation').classList.add('active');
            document.getElementById('btn-realtime').classList.remove('active');
            document.getElementById('simulation-controls').classList.remove('hidden');
            document.getElementById('packet-list-panel').classList.remove('hidden');
            document.getElementById('status-mode').textContent = 'Mode: Simulation';
        });
    }

    // === Keyboard Shortcuts ===
    _bindKeyboard() {
        document.addEventListener('keydown', (e) => {
            // Don't handle if typing in input
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;

            switch (e.key.toLowerCase()) {
                case 'v': this.setTool('select'); break;
                case 'm': this.setTool('move'); break;
                case 'c': this.setTool('connect'); break;
                case 'n': this.setTool('note'); break;
                case 'p': this.setTool('pdu'); break;
                case 'i': this.setTool('inspect'); break;
                case 'delete':
                case 'backspace':
                    this.deleteSelected();
                    break;
                case 'escape':
                    this.renderer.connectingFrom = null;
                    this.renderer.tempLineEnd = null;
                    this.renderer.pduSource = null;
                    this._closeContextMenu();
                    break;
                case 'a':
                    if (e.ctrlKey) {
                        e.preventDefault();
                        for (const [id, dev] of this.devices) dev.selected = true;
                    }
                    break;
                case 's':
                    if (e.ctrlKey) {
                        e.preventDefault();
                        this.saveTopology();
                    }
                    break;
                case '=':
                case '+':
                    if (e.ctrlKey) { e.preventDefault(); this.renderer.zoomIn(); }
                    break;
                case '-':
                    if (e.ctrlKey) { e.preventDefault(); this.renderer.zoomOut(); }
                    break;
            }
        });
    }

    // === Zoom Controls ===
    _bindZoomControls() {
        document.getElementById('zoom-in')?.addEventListener('click', () => this.renderer.zoomIn());
        document.getElementById('zoom-out')?.addEventListener('click', () => this.renderer.zoomOut());
    }

    // === CLI Panel Controls ===
    _bindCLIPanel() {
        document.getElementById('cli-close')?.addEventListener('click', () => this.cli.close());
        document.getElementById('cli-minimize')?.addEventListener('click', () => {
            document.getElementById('cli-panel').classList.toggle('minimized');
        });
        document.getElementById('cli-maximize')?.addEventListener('click', () => {
            document.getElementById('cli-panel').classList.toggle('maximized');
        });
    }

    // === Simulation Controls ===
    _bindSimulationControls() {
        document.getElementById('sim-speed')?.addEventListener('input', (e) => {
            this.packetAnimator.setSpeed(parseInt(e.target.value));
        });

        document.getElementById('sim-reset')?.addEventListener('click', () => {
            this.networkEngine.clearLog();
            document.getElementById('packet-table-body').innerHTML = '';
        });

        document.getElementById('close-packet-list')?.addEventListener('click', () => {
            document.getElementById('packet-list-panel').classList.add('hidden');
        });
    }

    // === Event List ===
    addPacketToEventList(event) {
        const tbody = document.getElementById('packet-table-body');
        const row = document.createElement('tr');
        const statusClass = event.status === 'success' ? 'pkt-success' : event.status === 'failed' ? 'pkt-failed' : 'pkt-pending';
        row.innerHTML = `
            <td>${event.id}</td>
            <td>${event.time}</td>
            <td>${Utils.escapeHtml(event.source)}</td>
            <td>${Utils.escapeHtml(event.dest)}</td>
            <td>${event.type}</td>
            <td>${Utils.escapeHtml(event.info)}</td>
            <td class="${statusClass}">${event.status}</td>
        `;
        tbody.appendChild(row);
    }

    // === Topology Save/Load ===
    newTopology() {
        if (this.devices.size > 0) {
            if (!confirm('Create new topology? Current work will be lost.')) return;
        }
        this.devices.clear();
        this.connectionManager.clear();
        this.networkEngine.clearLog();
        this.cli.close();
        this.cli.sessions.clear();
        this.hideProperties();
        Utils._counters = {};
        document.getElementById('packet-table-body').innerHTML = '';
        this.renderer.offsetX = 0;
        this.renderer.offsetY = 0;
        this.renderer.zoom = 1;
        this.updateStatusBar();
        Utils.notify('New topology created', 'info');
    }

    saveTopology() {
        const data = {
            version: '1.0',
            appName: 'ComNet Simulator',
            timestamp: new Date().toISOString(),
            devices: Array.from(this.devices.values()).map(d => d.serialize()),
            connections: this.connectionManager.serialize(),
            camera: {
                offsetX: this.renderer.offsetX,
                offsetY: this.renderer.offsetY,
                zoom: this.renderer.zoom
            }
        };

        const json = JSON.stringify(data, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'topology.comnet';
        a.click();
        URL.revokeObjectURL(url);
        Utils.notify('Topology saved!', 'success');
    }

    loadTopology(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);
                this._applyTopology(data);
                Utils.notify('Topology loaded!', 'success');
            } catch (err) {
                Utils.notify('Failed to load file: ' + err.message, 'error');
            }
        };
        reader.readAsText(file);
    }

    _applyTopology(data) {
        this.devices.clear();
        this.connectionManager.clear();
        this.cli.sessions.clear();
        Utils._counters = {};

        // Load devices
        if (data.devices) {
            for (const devData of data.devices) {
                const device = NetworkDevice.deserialize(devData);
                this.devices.set(device.id, device);
            }
        }

        // Load connections
        if (data.connections) {
            this.connectionManager.deserialize(data.connections);
        }

        // Restore camera
        if (data.camera) {
            this.renderer.offsetX = data.camera.offsetX || 0;
            this.renderer.offsetY = data.camera.offsetY || 0;
            this.renderer.zoom = data.camera.zoom || 1;
        }

        this.updateStatusBar();
    }

    // === Delete Selected ===
    deleteSelected() {
        const selectedDevices = Array.from(this.devices.values()).filter(d => d.selected);
        const selectedConns = this.connectionManager.getAll().filter(c => c.selected);

        for (const conn of selectedConns) {
            this.deleteConnection(conn.id);
        }
        for (const dev of selectedDevices) {
            this.deleteDevice(dev.id);
        }
    }

    // === Status Bar ===
    updateStatusBar() {
        document.getElementById('status-devices').textContent = `Devices: ${this.devices.size}`;
        document.getElementById('status-connections').textContent = `Links: ${this.connectionManager.getAll().length}`;
    }
}

// === Initialize App ===
document.addEventListener('DOMContentLoaded', () => {
    window.app = new ComNetApp();
});
