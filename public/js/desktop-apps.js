/* ComNet - Desktop Applications for End Devices */

const DesktopApps = {
    buildDesktopView(container, device) {
        container.innerHTML = '';
        const grid = document.createElement('div');
        grid.className = 'desktop-grid';
        const apps = this._getApps(device);
        apps.forEach(app => {
            const icon = document.createElement('div');
            icon.className = 'desktop-app-icon';
            icon.innerHTML = `<span class="app-emoji">${app.icon}</span><span class="app-label">${app.name}</span>`;
            icon.addEventListener('click', () => this._openApp(container, device, app));
            grid.appendChild(icon);
        });
        container.appendChild(grid);
    },

    _getApps(device) {
        const base = [
            { id:'ipconfig', name:'IP Configuration', icon:'🌐' },
            { id:'cmd', name:'Command Prompt', icon:'⬛' },
            { id:'browser', name:'Web Browser', icon:'🔍' },
            { id:'texteditor', name:'Text Editor', icon:'📝' },
        ];
        if (device.type==='server') {
            base.push({ id:'services', name:'Services', icon:'⚙️' });
        }
        base.push({ id:'terminal', name:'Terminal', icon:'💻' });
        base.push({ id:'traffic', name:'Traffic Monitor', icon:'📊' });
        return base;
    },

    _openApp(container, device, app) {
        container.innerHTML = '';
        const back = document.createElement('button');
        back.className = 'desktop-app-back';
        back.innerHTML = '← Back to Desktop';
        back.addEventListener('click', () => this.buildDesktopView(container, device));
        container.appendChild(back);

        const win = document.createElement('div');
        win.className = 'desktop-app-window';
        container.appendChild(win);

        switch (app.id) {
            case 'ipconfig': this._appIPConfig(win, device); break;
            case 'cmd': this._appCmdPrompt(win, device); break;
            case 'browser': this._appBrowser(win, device); break;
            case 'texteditor': this._appTextEditor(win, device); break;
            case 'services': this._appServices(win, device); break;
            case 'terminal': this._appTerminal(win, device); break;
            case 'traffic': this._appTraffic(win, device); break;
        }
    },

    _appIPConfig(container, device) {
        const ifaces = device.interfaces.filter(i => i.type !== 'console' && i.type !== 'vlan');
        let selectedIf = ifaces[0];

        const render = () => {
            container.innerHTML = `<div class="ip-config">
                <div class="config-section-title">IP Configuration</div>
                <div class="config-field iface-select"><label>Interface</label>
                    <select id="ipconf-iface">${ifaces.map(i => `<option value="${Utils.escapeHtml(i.name)}" ${i===selectedIf?'selected':''}>${Utils.escapeHtml(i.name)}</option>`).join('')}</select></div>
                <div class="config-field"><label>DHCP</label><button class="btn-small" id="ipconf-dhcp">Request DHCP</button></div>
                <div class="config-field"><label>IP Address</label><input id="ipconf-ip" value="${selectedIf?.ipAddress||''}"></div>
                <div class="config-field"><label>Subnet Mask</label><input id="ipconf-mask" value="${selectedIf?.subnetMask||'255.255.255.0'}"></div>
                <div class="config-field"><label>Default Gateway</label><input id="ipconf-gw" value="${selectedIf?.gateway||''}"></div>
                <div class="config-field"><label>MAC Address</label><span style="font-family:var(--font-mono);font-size:11px">${selectedIf?.macAddress||''}</span></div>
                <button class="btn-accent" id="ipconf-apply">Apply</button>
            </div>`;

            container.querySelector('#ipconf-iface').addEventListener('change', e => {
                selectedIf = ifaces.find(i => i.name === e.target.value);
                render();
            });

            container.querySelector('#ipconf-apply').addEventListener('click', () => {
                if (!selectedIf) return;
                selectedIf.ipAddress = container.querySelector('#ipconf-ip').value;
                selectedIf.subnetMask = container.querySelector('#ipconf-mask').value;
                selectedIf.gateway = container.querySelector('#ipconf-gw').value;
                Utils.notify(`${selectedIf.name}: IP set to ${selectedIf.ipAddress}`, 'success');
            });

            container.querySelector('#ipconf-dhcp').addEventListener('click', () => {
                if (!selectedIf) return;
                const result = ComNetApp.network.requestDHCP(device);
                if (result.success) {
                    selectedIf.ipAddress = result.ip;
                    selectedIf.subnetMask = result.mask;
                    selectedIf.gateway = result.gateway;
                    Utils.notify(`DHCP: Assigned ${result.ip}`, 'success');
                    render();
                } else {
                    Utils.notify(result.message, 'error');
                }
            });
        };
        render();
    },

    _appCmdPrompt(container, device) {
        container.innerHTML = `<div class="cmd-container">
            <div class="cmd-output" id="cmd-output">ComNet Command Prompt v3.0\nType 'help' for commands.\n\nC:\\></div>
            <div style="display:flex"><span style="color:var(--text);font-family:var(--font-mono);font-size:11px">C:\\></span>
            <input class="cmd-input" id="cmd-input" autofocus spellcheck="false"></div></div>`;

        const output = container.querySelector('#cmd-output');
        const input = container.querySelector('#cmd-input');

        input.addEventListener('keydown', e => {
            if (e.key !== 'Enter') return;
            const cmd = input.value.trim();
            input.value = '';
            output.textContent += `C:\\>${cmd}\n`;

            const parts = cmd.split(/\s+/);
            const c = parts[0]?.toLowerCase();
            let result = '';

            if (c === 'ping' && parts[1]) {
                if (!Utils.isValidIP(parts[1])) { result = `Bad parameter: ${parts[1]}`; }
                else {
                    const r = ComNetApp.network.ping(device, parts[1]);
                    result = r.success
                        ? `Pinging ${parts[1]}:\nReply from ${parts[1]}: time<1ms TTL=${r.ttl||64}\nReply from ${parts[1]}: time<1ms TTL=${r.ttl||64}\nReply from ${parts[1]}: time<1ms TTL=${r.ttl||64}\nReply from ${parts[1]}: time<1ms TTL=${r.ttl||64}\n\nPing statistics: Sent=4 Received=4 Lost=0 (0% loss)`
                        : `Pinging ${parts[1]}:\nRequest timed out.\n${r.message}\n\nPing statistics: Sent=4 Received=0 Lost=4 (100% loss)`;
                }
            } else if (c === 'ipconfig') {
                result = '';
                device.interfaces.filter(i=>i.type!=='console'&&i.type!=='vlan').forEach(i => {
                    result += `\n${i.name}:\n   IP Address: ${i.ipAddress||'Not configured'}\n   Subnet Mask: ${i.subnetMask}\n   Default Gateway: ${i.gateway||'Not configured'}\n   MAC Address: ${i.macAddress}\n`;
                });
            } else if (c === 'tracert' && parts[1]) {
                const r = ComNetApp.network.traceroute(device, parts[1]);
                result = `Tracing route to ${parts[1]}:\n`;
                r.hops.forEach((h,i) => { result += `  ${i+1}  <1ms  ${h.name}\n`; });
                result += r.success ? 'Trace complete.' : `Trace failed: ${r.message}`;
            } else if (c === 'nslookup' && parts[1]) {
                const r = ComNetApp.network.dnsLookup(device, parts[1]);
                result = r.success ? `Server: ${r.server}\nAddress: ${r.ip}` : r.message;
            } else if (c === 'arp') {
                result = 'Internet Address    Physical Address\n';
                device.arpTable.forEach(e => { result += `${e.ip.padEnd(20)}${e.mac}\n`; });
                if (!device.arpTable.length) result += '(empty)';
            } else if (c === 'netstat') {
                result = 'Active Connections: None (simulated)';
            } else if (c === 'cls') {
                output.textContent = 'C:\\>';
                return;
            } else if (c === 'help') {
                result = 'ping <ip>       - Ping a host\nipconfig        - Show IP configuration\ntracert <ip>    - Trace route\nnslookup <name> - DNS lookup\narp             - Show ARP table\nnetstat         - Network statistics\ncls             - Clear screen\nhelp            - Show this help';
            } else if (c) {
                result = `'${c}' is not recognized as a command.`;
            }

            if (result) output.textContent += result + '\n';
            output.textContent += '\n';
            output.scrollTop = output.scrollHeight;
        });
        setTimeout(() => input.focus(), 50);
    },

    _appBrowser(container, device) {
        container.innerHTML = `<div class="browser-bar"><input id="browser-url" placeholder="http://" value=""><button id="browser-go">Go</button></div>
            <div class="browser-content" id="browser-content">Enter a URL and click Go. The browser queries HTTP servers in the simulated network.</div>`;

        container.querySelector('#browser-go').addEventListener('click', () => {
            const url = container.querySelector('#browser-url').value.trim();
            if (!url) return;
            const content = container.querySelector('#browser-content');

            // Try to find a server with HTTP enabled
            let found = false;
            for (const [id, dev] of ComNetApp.devices) {
                if (dev.services?.http?.enabled) {
                    // Check if reachable
                    const ip = dev.getPrimaryIP();
                    if (!ip) continue;
                    const ping = ComNetApp.network.ping(device, ip);
                    if (ping.success) {
                        // Use textContent for safety (no XSS)
                        content.textContent = '';
                        const info = document.createElement('div');
                        info.style.cssText = 'color:var(--subtext);font-size:10px;margin-bottom:8px';
                        info.textContent = `Connected to ${dev.name} (${ip})`;
                        content.appendChild(info);
                        const body = document.createElement('div');
                        const rawHTML = dev.services.http.content || 'No content';
                        // Basic safe tags only
                        const safeHTML = rawHTML.replace(/<(?!\/?(h[1-6]|p|br|b|i|em|strong|ul|ol|li|a|div|span)\b)[^>]*>/gi, '');
                        body.innerHTML = safeHTML;
                        content.appendChild(body);
                        found = true;
                        break;
                    }
                }
            }
            if (!found) content.textContent = `Error: Could not connect to ${url}. No reachable HTTP server found.`;
        });

        container.querySelector('#browser-url').addEventListener('keydown', e => {
            if (e.key === 'Enter') container.querySelector('#browser-go').click();
        });
    },

    _appTextEditor(container, device) {
        container.innerHTML = `<div class="config-section-title">Text Editor</div>
            <textarea style="width:100%;height:250px;background:var(--crust);color:var(--text);border:1px solid var(--surface1);border-radius:4px;padding:8px;font-family:var(--font-mono);font-size:12px;resize:vertical" placeholder="Type here..."></textarea>`;
    },

    _appServices(container, device) {
        container.innerHTML = '<div class="config-section-title">Server Services</div>';
        for (const [name, svc] of Object.entries(device.services || {})) {
            const div = document.createElement('div');
            div.className = 'config-field';
            div.innerHTML = `<label style="text-transform:uppercase;min-width:80px">${Utils.escapeHtml(name)}</label>
                <label><input type="checkbox" ${svc.enabled?'checked':''} data-svc="${Utils.escapeHtml(name)}"> Enabled</label>
                <span style="color:${svc.enabled?'var(--green)':'var(--red)'}">${svc.enabled?'●':'●'}</span>`;
            div.querySelector('input').addEventListener('change', e => {
                svc.enabled = e.target.checked;
                this._appServices(container, device);
            });
            container.appendChild(div);
        }
    },

    _appTerminal(container, device) {
        container.innerHTML = `<div class="config-section-title">Remote Terminal</div>
            <div class="config-field"><label>Host IP</label><input id="term-ip" placeholder="10.0.0.1">
            <label>Protocol</label><select id="term-proto"><option>SSH</option><option>Telnet</option></select>
            <button class="btn-accent" id="term-connect">Connect</button></div>
            <div class="cmd-container" style="height:200px"><div class="cmd-output" id="term-output">Ready. Enter host IP and connect.</div></div>`;

        container.querySelector('#term-connect').addEventListener('click', () => {
            const ip = container.querySelector('#term-ip').value;
            const proto = container.querySelector('#term-proto').value;
            const output = container.querySelector('#term-output');
            if (!ip) { output.textContent += '\nError: No host specified.'; return; }
            const result = ComNetApp.network.ping(device, ip);
            if (result.success) {
                output.textContent += `\nConnecting to ${ip} via ${proto}...\nConnected. (Simulated session)\n\nRemote>${' '}`;
            } else {
                output.textContent += `\nConnection to ${ip} failed: ${result.message}`;
            }
        });
    },

    _appTraffic(container, device) {
        container.innerHTML = `<div class="config-section-title">Traffic Monitor</div>`;
        const ifaces = device.interfaces.filter(i => i.type !== 'console' && i.type !== 'vlan');
        let html = '<table style="width:100%;font-size:11px;font-family:var(--font-mono)"><tr><th style="text-align:left;padding:4px">Interface</th><th>Status</th><th>TX Pkts</th><th>RX Pkts</th></tr>';
        ifaces.forEach(i => {
            html += `<tr><td style="padding:4px">${Utils.escapeHtml(i.name)}</td><td style="color:${i.isUp()?'var(--green)':'var(--red)'}">${i.isUp()?'UP':'DOWN'}</td><td>${i.txPackets}</td><td>${i.rxPackets}</td></tr>`;
        });
        html += '</table>';
        container.innerHTML += html;
    },
};
