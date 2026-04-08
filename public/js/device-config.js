/* ComNet - Device Configuration Panel (PT-style tabbed window) */

const DeviceConfigPanel = {
    _panel: null, _device: null, _cli: null, _dragState: null,

    open(device) {
        this.close();
        this._device = device;
        const panel = document.createElement('div');
        panel.className = 'config-panel';
        panel.id = 'config-panel';

        const eName = Utils.escapeHtml(device.hostname);
        panel.innerHTML = `
            <div class="config-panel-titlebar" id="config-titlebar">
                <span>${device.img} ${eName} — ${Utils.escapeHtml(device.model)}</span>
                <button class="config-panel-close" id="config-close-btn">&times;</button>
            </div>
            <div class="config-tabs" id="config-tabs"></div>
            <div class="config-body" id="config-body"></div>`;
        document.body.appendChild(panel);
        this._panel = panel;

        // Tabs
        const tabs = ['Physical','Config','CLI','Desktop','Attributes'];
        const tabBar = panel.querySelector('#config-tabs');
        tabs.forEach(t => {
            if (t === 'CLI' && !device.hasCLI()) return;
            if (t === 'Desktop' && !device.hasDesktop()) return;
            const el = document.createElement('div');
            el.className = 'config-tab'; el.textContent = t; el.dataset.tab = t;
            el.addEventListener('click', () => this.switchTab(t));
            tabBar.appendChild(el);
        });

        panel.querySelector('#config-close-btn').addEventListener('click', () => this.close());
        this._enableDrag(panel.querySelector('#config-titlebar'), panel);
        this.switchTab('Physical');
    },

    close() {
        this._panel?.remove(); this._panel = null; this._device = null; this._cli = null;
    },

    switchTab(tabName) {
        if (!this._panel || !this._device) return;
        this._panel.querySelectorAll('.config-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tabName));
        const body = this._panel.querySelector('#config-body');
        body.innerHTML = '';

        switch (tabName) {
            case 'Physical': this._buildPhysical(body); break;
            case 'Config': this._buildConfig(body); break;
            case 'CLI': this._buildCLI(body); break;
            case 'Desktop': DesktopApps.buildDesktopView(body, this._device); break;
            case 'Attributes': this._buildAttributes(body); break;
        }
    },

    _buildPhysical(body) {
        const d = this._device;
        body.innerHTML = `<div class="physical-view">
            <div class="device-chassis">
                <div class="device-big-icon">${d.img}</div>
                <div class="power-indicator ${d.powered?'on':'off'}">${d.powered?'⏻ ON':'⏻ OFF'}</div>
                <button class="btn-small" id="toggle-power-btn">${d.powered?'Power Off':'Power On'}</button>
                <div class="config-section-title">Module Slots</div>
                <div class="module-slots">
                    <div class="module-slot">Slot 0: ${d.model} Mainboard</div>
                    <div class="module-slot">Slot 1: Empty — drag module here</div>
                </div>
            </div>
            <div class="port-panel"><div class="config-section-title">Interfaces</div><div id="port-list"></div></div>
        </div>`;
        body.querySelector('#toggle-power-btn').addEventListener('click', () => {
            d.powered = !d.powered; this.switchTab('Physical');
        });
        const portList = body.querySelector('#port-list');
        for (const i of d.interfaces) {
            if (i.type === 'console' || i.type === 'vlan') continue;
            const el = document.createElement('div');
            el.className = 'port-item';
            el.innerHTML = `<span>${Utils.escapeHtml(i.name)}</span><span class="port-dot ${i.isUp()?'up':'down'}"></span><span style="font-size:10px;color:var(--subtext)">${i.ipAddress||'—'}</span>`;
            portList.appendChild(el);
        }
    },

    _buildConfig(body) {
        const d = this._device;
        body.innerHTML = `<div class="config-tree"><div class="config-nav" id="config-nav"></div><div class="config-content" id="config-content"></div></div>`;
        const nav = body.querySelector('#config-nav');
        const content = body.querySelector('#config-content');

        const sections = ['Global Settings'];
        d.interfaces.filter(i=>i.type!=='console'&&i.type!=='vlan').forEach(i => sections.push(i.name));
        if (d.type==='router'||d.type==='l3switch') sections.push('Routing');
        if (d.type==='switch'||d.type==='l3switch') sections.push('VLANs');
        if (d.services && Object.keys(d.services).length) sections.push('Services');

        sections.forEach((s,idx) => {
            const el = document.createElement('div');
            el.className = 'config-nav-item' + (idx===0?' active':'') + (s!=='Global Settings'&&s!=='Routing'&&s!=='VLANs'&&s!=='Services'?' indent':'');
            el.textContent = s;
            el.addEventListener('click', () => {
                nav.querySelectorAll('.config-nav-item').forEach(n=>n.classList.remove('active'));
                el.classList.add('active');
                this._renderConfigSection(content, s);
            });
            nav.appendChild(el);
        });
        this._renderConfigSection(content, 'Global Settings');
    },

    _renderConfigSection(container, section) {
        const d = this._device;
        container.innerHTML = '';

        if (section === 'Global Settings') {
            container.innerHTML = `
                <div class="config-section-title">Global Settings</div>
                <div class="config-field"><label>Hostname</label><input id="cfg-hostname" value="${Utils.escapeHtml(d.hostname)}"></div>
                <div class="config-field"><label>Display Name</label><input id="cfg-name" value="${Utils.escapeHtml(d.name)}"></div>
                <div class="config-field"><label>Enable Secret</label><input id="cfg-secret" type="password" value=""></div>`;
            container.querySelector('#cfg-secret').value = d.enableSecret;
            container.querySelector('#cfg-hostname').addEventListener('change', e => { d.hostname = e.target.value; });
            container.querySelector('#cfg-name').addEventListener('change', e => { d.name = e.target.value; });
            container.querySelector('#cfg-secret').addEventListener('change', e => { d.enableSecret = e.target.value; });
            return;
        }

        if (section === 'Routing') {
            container.innerHTML = `<div class="config-section-title">Static Routes</div><div id="routes-list"></div>
                <div class="config-field"><label>Network</label><input id="rt-net" placeholder="0.0.0.0" size="15">
                <label>Mask</label><input id="rt-mask" placeholder="0.0.0.0" size="15">
                <label>Next Hop</label><input id="rt-nh" placeholder="10.0.0.1" size="15">
                <button class="btn-accent" id="rt-add">Add</button></div>`;
            const list = container.querySelector('#routes-list');
            d.routingTable.forEach((r,i) => {
                const row = document.createElement('div');
                row.className = 'config-field';
                row.innerHTML = `<span style="font-family:var(--font-mono);font-size:11px">${r.network} ${r.mask} via ${r.nextHop}</span><button class="btn-small" data-idx="${i}">✕</button>`;
                row.querySelector('button').addEventListener('click', () => { d.routingTable.splice(i,1); this._renderConfigSection(container,'Routing'); });
                list.appendChild(row);
            });
            container.querySelector('#rt-add').addEventListener('click', () => {
                const net=container.querySelector('#rt-net').value, mask=container.querySelector('#rt-mask').value, nh=container.querySelector('#rt-nh').value;
                if (net&&mask&&nh) { d.routingTable.push({network:net,mask,nextHop:nh}); this._renderConfigSection(container,'Routing'); }
            });
            return;
        }

        if (section === 'VLANs') {
            container.innerHTML = `<div class="config-section-title">VLANs</div><div id="vlan-list"></div>
                <div class="config-field"><label>VLAN ID</label><input id="vl-id" type="number" min="2" max="4094" size="5">
                <label>Name</label><input id="vl-name" placeholder="name">
                <button class="btn-accent" id="vl-add">Add</button></div>`;
            const list = container.querySelector('#vlan-list');
            d.vlans.forEach(v => {
                const row = document.createElement('div'); row.className = 'config-field';
                row.innerHTML = `<span>${v.id} — ${Utils.escapeHtml(v.name)}</span>`;
                list.appendChild(row);
            });
            container.querySelector('#vl-add').addEventListener('click', () => {
                const id=parseInt(container.querySelector('#vl-id').value), name=container.querySelector('#vl-name').value||`VLAN${id}`;
                if (id>=2&&id<=4094&&!d.vlans.find(v=>v.id===id)) { d.vlans.push({id,name}); this._renderConfigSection(container,'VLANs'); }
            });
            return;
        }

        if (section === 'Services') {
            container.innerHTML = '<div class="config-section-title">Services</div>';
            for (const [name, svc] of Object.entries(d.services)) {
                const div = document.createElement('div');
                div.className = 'config-field';
                div.innerHTML = `<label style="text-transform:uppercase">${Utils.escapeHtml(name)}</label>
                    <label><input type="checkbox" ${svc.enabled?'checked':''} data-svc="${name}"> Enabled</label>`;
                div.querySelector('input').addEventListener('change', e => { svc.enabled = e.target.checked; });
                container.appendChild(div);

                if (name==='dhcp') {
                    const extra = document.createElement('div');
                    extra.innerHTML = `<div class="config-field"><label>Pool Start</label><input value="${svc.poolStart||''}" data-dhcp="poolStart"></div>
                        <div class="config-field"><label>Pool End</label><input value="${svc.poolEnd||''}" data-dhcp="poolEnd"></div>
                        <div class="config-field"><label>Gateway</label><input value="${svc.gateway||''}" data-dhcp="gateway"></div>
                        <div class="config-field"><label>DNS</label><input value="${svc.dns||''}" data-dhcp="dns"></div>`;
                    extra.querySelectorAll('[data-dhcp]').forEach(inp => { inp.addEventListener('change', e => { svc[e.target.dataset.dhcp]=e.target.value; }); });
                    container.appendChild(extra);
                }
                if (name==='dns') {
                    const extra = document.createElement('div');
                    extra.innerHTML = `<div class="config-section-title" style="font-size:11px">DNS Records</div><div id="dns-records"></div>
                        <div class="config-field"><input id="dns-name" placeholder="domain" size="15"><input id="dns-addr" placeholder="IP" size="15"><button class="btn-small" id="dns-add">+</button></div>`;
                    const recList = extra.querySelector('#dns-records');
                    (svc.records||[]).forEach(r => {
                        const row = document.createElement('div'); row.className='config-field';
                        row.innerHTML = `<span style="font-size:10px;font-family:var(--font-mono)">${Utils.escapeHtml(r.name)} → ${Utils.escapeHtml(r.address)}</span>`;
                        recList.appendChild(row);
                    });
                    container.appendChild(extra);
                    extra.querySelector('#dns-add')?.addEventListener('click', () => {
                        const n=extra.querySelector('#dns-name').value, a=extra.querySelector('#dns-addr').value;
                        if(n&&a){ svc.records=svc.records||[]; svc.records.push({name:n,type:'A',address:a}); this._renderConfigSection(container,'Services'); }
                    });
                }
            }
            return;
        }

        // Interface configuration
        const iface = d.getInterface(section);
        if (!iface) return;
        container.innerHTML = `
            <div class="config-section-title">${Utils.escapeHtml(iface.name)}</div>
            <div class="config-field"><label>IP Address</label><input id="if-ip" value="${iface.ipAddress}"></div>
            <div class="config-field"><label>Subnet Mask</label><input id="if-mask" value="${iface.subnetMask}"></div>
            <div class="config-field"><label>Gateway</label><input id="if-gw" value="${iface.gateway}"></div>
            <div class="config-field"><label>MAC Address</label><span style="font-family:var(--font-mono);font-size:11px">${iface.macAddress}</span></div>
            <div class="config-field"><label>Status</label>
                <select id="if-admin"><option value="up" ${iface.adminStatus==='up'?'selected':''}>Up</option><option value="down" ${iface.adminStatus==='down'?'selected':''}>Down</option></select></div>
            <div class="config-field"><label>Speed</label><input id="if-speed" value="${iface.speed}" size="10"></div>
            <div class="config-field"><label>Duplex</label>
                <select id="if-duplex"><option ${iface.duplex==='auto'?'selected':''}>auto</option><option ${iface.duplex==='full'?'selected':''}>full</option><option ${iface.duplex==='half'?'selected':''}>half</option></select></div>
            ${iface.type==='ethernet'?`<div class="config-field"><label>VLAN</label><input id="if-vlan" type="number" value="${iface.vlan}" min="1" max="4094" size="5"></div>
            <div class="config-field"><label>Trunk</label><input id="if-trunk" type="checkbox" ${iface.trunkMode?'checked':''}></div>`:''}
            <div class="config-field"><label>Description</label><input id="if-desc" value="${Utils.escapeHtml(iface.description)}"></div>
            <button class="btn-accent" id="if-apply">Apply</button>`;

        container.querySelector('#if-apply').addEventListener('click', () => {
            iface.ipAddress = container.querySelector('#if-ip').value;
            iface.subnetMask = container.querySelector('#if-mask').value;
            iface.gateway = container.querySelector('#if-gw').value;
            iface.adminStatus = container.querySelector('#if-admin').value;
            if (iface.adminStatus==='up' && iface.isConnected()) iface.status='up';
            else if (iface.adminStatus==='down') iface.status='down';
            iface.speed = container.querySelector('#if-speed').value;
            iface.duplex = container.querySelector('#if-duplex').value;
            iface.description = container.querySelector('#if-desc').value;
            const vlanEl = container.querySelector('#if-vlan');
            if (vlanEl) iface.vlan = parseInt(vlanEl.value)||1;
            const trunkEl = container.querySelector('#if-trunk');
            if (trunkEl) iface.trunkMode = trunkEl.checked;
            Utils.notify(`${iface.name} configuration applied`, 'success');
        });
    },

    _buildCLI(body) {
        const d = this._device;
        if (!this._cli || this._cli.device !== d) this._cli = new CLISession(d, ComNetApp.network);
        body.innerHTML = `<div class="cli-container"><div class="cli-output" id="cli-output"></div>
            <div class="cli-input-line"><span class="cli-prompt" id="cli-prompt"></span><input class="cli-input" id="cli-input" autofocus spellcheck="false"></div></div>`;
        const output = body.querySelector('#cli-output');
        const input = body.querySelector('#cli-input');
        const prompt = body.querySelector('#cli-prompt');
        output.textContent = this._cli.output;
        prompt.textContent = this._cli.getPrompt() + ' ';
        output.scrollTop = output.scrollHeight;

        input.addEventListener('keydown', e => {
            if (e.key === 'Enter') {
                const cmd = input.value;
                this._cli.output += prompt.textContent + cmd + '\n';
                const result = this._cli.execute(cmd);
                if (result) this._cli.output += result + '\n';
                output.textContent = this._cli.output;
                prompt.textContent = this._cli.getPrompt() + ' ';
                input.value = '';
                output.scrollTop = output.scrollHeight;
            } else if (e.key === 'Tab') {
                e.preventDefault();
                const matches = this._cli.tabComplete(input.value);
                if (matches.length === 1) input.value = matches[0] + ' ';
                else if (matches.length > 1) {
                    this._cli.output += prompt.textContent + input.value + '\n' + matches.join('  ') + '\n';
                    output.textContent = this._cli.output;
                    output.scrollTop = output.scrollHeight;
                }
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                if (this._cli.historyIndex > 0) { this._cli.historyIndex--; input.value = this._cli.history[this._cli.historyIndex]; }
            } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                if (this._cli.historyIndex < this._cli.history.length-1) { this._cli.historyIndex++; input.value = this._cli.history[this._cli.historyIndex]; }
                else { this._cli.historyIndex = this._cli.history.length; input.value = ''; }
            }
        });
        setTimeout(() => input.focus(), 50);
    },

    _buildAttributes(body) {
        const d = this._device;
        let html = '<div class="config-section-title">Device Attributes</div><table style="font-size:11px;font-family:var(--font-mono);width:100%">';
        const attrs = [['ID',d.id],['Type',d.type],['Model',d.model],['Name',d.name],['Hostname',d.hostname],
            ['Position',`${Math.round(d.x)}, ${Math.round(d.y)}`],['Power',d.powered?'ON':'OFF'],
            ['Interfaces',d.interfaces.length],['Connected Ports',d.getConnectedPorts().length]];
        attrs.forEach(([k,v]) => { html += `<tr><td style="padding:3px 8px;color:var(--subtext)">${k}</td><td style="padding:3px 8px">${Utils.escapeHtml(String(v))}</td></tr>`; });
        html += '</table>';
        body.innerHTML = html;
    },

    _enableDrag(handle, panel) {
        let ox=0,oy=0,sx=0,sy=0;
        handle.addEventListener('mousedown', e => {
            sx=e.clientX; sy=e.clientY;
            const onMove = e2 => { ox=e2.clientX-sx; oy=e2.clientY-sy; sx=e2.clientX; sy=e2.clientY;
                panel.style.left = (panel.offsetLeft+ox)+'px'; panel.style.top = (panel.offsetTop+oy)+'px'; panel.style.transform='none'; };
            const onUp = () => { document.removeEventListener('mousemove',onMove); document.removeEventListener('mouseup',onUp); };
            document.addEventListener('mousemove',onMove);
            document.addEventListener('mouseup',onUp);
        });
    },
};
