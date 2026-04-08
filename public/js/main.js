/* ComNet - Main Application Controller (Final) */

const ComNetApp = {
    devices: new Map(),
    connectionManager: new ConnectionManager(),
    network: null,
    canvas: null,

    selectedDevice: null,
    selectedConnection: null,
    connectionMode: false,
    connectionCableType: null,
    connectionSource: null,
    connectionSourceIface: null,
    pduMode: null,
    pduSource: null,
    activeCategory: null,
    selectedModel: null,

    init() {
        this.network = new NetworkEngine(this);
        this.canvas = new CanvasRenderer('main-canvas', this);
        this._buildBottomToolbar();
        this._buildTopToolbar();
        this._bindKeyboard();
        this._bindDragDrop();
        this._bindThemeToggle();
        this._startStatusLoop();
        // Apply saved theme
        const saved = localStorage.getItem('comnet-theme') || 'dark';
        document.documentElement.setAttribute('data-theme', saved);
        const icon = document.getElementById('theme-icon');
        if (icon) icon.className = saved === 'dark' ? 'fas fa-moon' : 'fas fa-sun';
        Utils.notify('ComNet Network Simulator ready', 'info');
    },

    // ===== MODAL SYSTEM (replaces prompt/confirm/alert) =====
    _showModal(options) {
        return new Promise(resolve => {
            const overlay = document.createElement('div');
            overlay.className = 'modal-overlay';
            const box = document.createElement('div');
            box.className = 'modal-box';

            let html = `<div class="modal-title">${Utils.escapeHtml(options.title || '')}</div>`;
            if (options.message) html += `<p style="color:var(--subtext);font-size:13px;margin-bottom:12px">${Utils.escapeHtml(options.message)}</p>`;
            if (options.input !== undefined) html += `<input class="modal-input" id="modal-input" value="${Utils.escapeHtml(options.input)}" placeholder="${Utils.escapeHtml(options.placeholder || '')}" autofocus>`;
            if (options.list) {
                html += '<div class="modal-list" id="modal-list">';
                options.list.forEach((item, i) => {
                    html += `<div class="modal-list-item" data-idx="${i}" data-value="${Utils.escapeHtml(item.value || item)}">${Utils.escapeHtml(item.label || item)}</div>`;
                });
                html += '</div>';
            }
            html += '<div class="modal-actions">';
            if (options.cancel !== false) html += '<button class="modal-btn modal-btn-secondary" id="modal-cancel">Cancel</button>';
            html += `<button class="modal-btn modal-btn-primary" id="modal-ok">${Utils.escapeHtml(options.okLabel || 'OK')}</button>`;
            html += '</div>';
            box.innerHTML = html;
            overlay.appendChild(box);
            document.body.appendChild(overlay);

            let selectedValue = null;

            const close = (val) => { overlay.remove(); resolve(val); };

            overlay.querySelector('#modal-cancel')?.addEventListener('click', () => close(null));
            overlay.querySelector('#modal-ok')?.addEventListener('click', () => {
                const inp = overlay.querySelector('#modal-input');
                if (inp) return close(inp.value);
                if (selectedValue !== null) return close(selectedValue);
                close(true);
            });
            overlay.addEventListener('click', e => { if (e.target === overlay) close(null); });

            // List selection
            overlay.querySelectorAll('.modal-list-item').forEach(el => {
                el.addEventListener('click', () => {
                    overlay.querySelectorAll('.modal-list-item').forEach(e => e.classList.remove('selected'));
                    el.classList.add('selected');
                    selectedValue = el.dataset.value;
                });
                el.addEventListener('dblclick', () => {
                    selectedValue = el.dataset.value;
                    close(selectedValue);
                });
            });

            // Focus & keyboard
            const inp = overlay.querySelector('#modal-input');
            if (inp) {
                setTimeout(() => { inp.focus(); inp.select(); }, 50);
                inp.addEventListener('keydown', e => {
                    if (e.key === 'Enter') close(inp.value);
                    if (e.key === 'Escape') close(null);
                });
            }
            overlay.addEventListener('keydown', e => {
                if (e.key === 'Escape') close(null);
            });
        });
    },

    // ===== STATUS BAR =====
    _startStatusLoop() {
        setInterval(() => {
            const devEl = document.getElementById('status-devices');
            const connEl = document.getElementById('status-connections');
            const zoomEl = document.getElementById('status-zoom');
            if (devEl) devEl.textContent = `Devices: ${this.devices.size}`;
            if (connEl) connEl.textContent = `Connections: ${this.connectionManager.toArray().length}`;
            if (zoomEl && this.canvas) zoomEl.textContent = `Zoom: ${Math.round(this.canvas.scale*100)}%`;
        }, 500);
    },

    // ===== THEME =====
    _bindThemeToggle() {
        const btn = document.getElementById('btn-theme');
        if (!btn) return;
        btn.addEventListener('click', () => {
            const current = document.documentElement.getAttribute('data-theme') || 'dark';
            const next = current === 'dark' ? 'light' : 'dark';
            document.documentElement.setAttribute('data-theme', next);
            localStorage.setItem('comnet-theme', next);
            const icon = document.getElementById('theme-icon');
            if (icon) icon.className = next === 'dark' ? 'fas fa-moon' : 'fas fa-sun';
        });
    },

    // ===== BOTTOM TOOLBAR =====
    _buildBottomToolbar() {
        const catBar = document.getElementById('category-bar');
        if (!catBar) return;
        catBar.innerHTML = '';
        for (const cat of DeviceCatalog.categories) {
            const btn = document.createElement('div');
            btn.className = 'cat-btn'; btn.dataset.catId = cat.id;
            btn.innerHTML = `<i class="fas ${cat.icon}"></i><span>${cat.name}</span>`;
            btn.addEventListener('click', () => this._selectCategory(cat));
            catBar.appendChild(btn);
        }
        const drawBtn = document.createElement('div');
        drawBtn.className = 'cat-btn';
        drawBtn.innerHTML = '<i class="fas fa-pencil-alt"></i><span>Drawing</span>';
        drawBtn.addEventListener('click', () => this._showDrawingTools());
        catBar.appendChild(drawBtn);
        const pduBtn = document.createElement('div');
        pduBtn.className = 'cat-btn';
        pduBtn.innerHTML = '<i class="fas fa-envelope"></i><span>PDU</span>';
        pduBtn.addEventListener('click', () => this._showPDUTools());
        catBar.appendChild(pduBtn);
    },

    _selectCategory(cat) {
        this.activeCategory = cat; this.selectedModel = null;
        this.connectionMode = false; this.pduMode = null;
        DrawingTools.setTool('select');
        document.querySelectorAll('.cat-btn').forEach(b => b.classList.toggle('active', b.dataset.catId === cat.id));
        const subBar = document.getElementById('subcategory-bar');
        subBar.innerHTML = '';
        for (const sub of cat.subcategories) {
            const btn = document.createElement('div');
            btn.className = 'sub-btn'; btn.dataset.subId = sub.id;
            btn.innerHTML = `<i class="fas ${sub.icon}"></i><span>${sub.name}</span>`;
            btn.addEventListener('click', () => this._selectSubcategory(sub));
            subBar.appendChild(btn);
        }
        subBar.style.display = 'flex';
        if (cat.subcategories.length) this._selectSubcategory(cat.subcategories[0]);
    },

    _selectSubcategory(sub) {
        this.selectedModel = null;
        document.querySelectorAll('.sub-btn').forEach(b => b.classList.toggle('active', b.dataset.subId === sub.id));
        const modelBar = document.getElementById('model-bar');
        modelBar.innerHTML = '';
        for (const dev of sub.devices) {
            const item = document.createElement('div');
            item.className = 'model-item'; item.dataset.model = dev.model;
            item.draggable = dev.type !== 'cable';
            item.innerHTML = `<span class="model-icon">${dev.img}</span><span class="model-label">${dev.label}</span>`;
            item.title = dev.desc;
            if (dev.type === 'cable') {
                item.addEventListener('click', () => this._startConnectionMode(dev));
            } else {
                item.addEventListener('click', () => this._selectModel(dev));
                item.addEventListener('dragstart', e => {
                    e.dataTransfer.setData('text/plain', JSON.stringify({ type:dev.type, model:dev.model }));
                    e.dataTransfer.effectAllowed = 'copy';
                });
            }
            modelBar.appendChild(item);
        }
        modelBar.style.display = 'flex';
    },

    _selectModel(dev) {
        this.selectedModel = dev; this.connectionMode = false;
        document.querySelectorAll('.model-item').forEach(m => m.classList.toggle('active', m.dataset.model === dev.model));
        Utils.notify(`Selected: ${dev.desc}. Click canvas to place.`, 'info');
    },

    _startConnectionMode(cableDef) {
        this.connectionMode = true; this.connectionCableType = cableDef.cableType;
        this.connectionSource = null; this.connectionSourceIface = null; this.selectedModel = null;
        document.querySelectorAll('.model-item').forEach(m => m.classList.toggle('active', m.dataset.model === cableDef.model));
        this.canvas.canvas.style.cursor = 'crosshair';
        Utils.notify(`${cableDef.desc}: Click source then destination device.`, 'info');
    },

    _showDrawingTools() {
        this.activeCategory = null; this.connectionMode = false; this.selectedModel = null; this.pduMode = null;
        document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
        document.getElementById('subcategory-bar').innerHTML = '';
        const modelBar = document.getElementById('model-bar');
        modelBar.innerHTML = '';
        for (const tool of DeviceCatalog.drawingTools) {
            const item = document.createElement('div');
            item.className = 'model-item';
            item.innerHTML = `<i class="fas ${tool.icon}"></i><span class="model-label">${tool.label}</span>`;
            item.addEventListener('click', () => {
                DrawingTools.setTool(tool.id);
                modelBar.querySelectorAll('.model-item').forEach(m => m.classList.remove('active'));
                item.classList.add('active');
            });
            modelBar.appendChild(item);
        }
        modelBar.style.display = 'flex';
    },

    _showPDUTools() {
        this.activeCategory = null; this.connectionMode = false; this.selectedModel = null;
        DrawingTools.setTool('select');
        document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
        document.getElementById('subcategory-bar').innerHTML = '';
        const modelBar = document.getElementById('model-bar');
        modelBar.innerHTML = '';
        for (const pdu of DeviceCatalog.pduTools) {
            const item = document.createElement('div');
            item.className = 'model-item';
            item.innerHTML = `<i class="fas ${pdu.icon}"></i><span class="model-label">${pdu.label}</span>`;
            item.title = pdu.desc;
            item.addEventListener('click', () => {
                this.pduMode = pdu.id; this.pduSource = null;
                modelBar.querySelectorAll('.model-item').forEach(m => m.classList.remove('active'));
                item.classList.add('active');
                this.canvas.canvas.style.cursor = 'crosshair';
                Utils.notify(pdu.desc, 'info');
            });
            modelBar.appendChild(item);
        }
        modelBar.style.display = 'flex';
    },

    // ===== TOP TOOLBAR =====
    _buildTopToolbar() {
        document.getElementById('btn-new')?.addEventListener('click', () => this.newTopology());
        document.getElementById('btn-open')?.addEventListener('click', () => this.loadTopology());
        document.getElementById('btn-save')?.addEventListener('click', () => this.saveTopology());
        document.getElementById('btn-zoom-in')?.addEventListener('click', () => { this.canvas.scale = Math.min(this.canvas.scale*1.2,5); });
        document.getElementById('btn-zoom-out')?.addEventListener('click', () => { this.canvas.scale = Math.max(this.canvas.scale*0.8,0.1); });
        document.getElementById('btn-fit')?.addEventListener('click', () => this.canvas.fitToContent());
        document.getElementById('btn-reset-view')?.addEventListener('click', () => this.canvas.resetView());
        document.getElementById('btn-delete')?.addEventListener('click', () => this.deleteSelected());
        document.getElementById('btn-power')?.addEventListener('click', () => this.toggleSelectedPower());
        document.getElementById('btn-grid')?.addEventListener('click', () => {
            if (this.canvas) { this.canvas.gridEnabled = !this.canvas.gridEnabled; Utils.notify(`Grid ${this.canvas.gridEnabled?'ON':'OFF'}`, 'info'); }
        });
        document.getElementById('btn-clear-events')?.addEventListener('click', () => {
            this.network.clearLog();
            const list = document.getElementById('event-list-body'); if (list) list.innerHTML = '';
            Utils.notify('Events cleared', 'info');
        });
    },

    // ===== DRAG & DROP =====
    _bindDragDrop() {
        this.canvas.canvas.addEventListener('dragover', e => { e.preventDefault(); e.dataTransfer.dropEffect='copy'; });
        this.canvas.canvas.addEventListener('drop', e => {
            e.preventDefault();
            try {
                const data = JSON.parse(e.dataTransfer.getData('text/plain'));
                const {x,y} = this.canvas.screenToWorld(...Object.values(this.canvas._pos(e)));
                this.addDevice(data.type, x-30, y-30, data.model);
            } catch(err){}
        });
        this.canvas.canvas.addEventListener('click', e => {
            if (this.selectedModel && !this.connectionMode) {
                const {x,y} = this.canvas.screenToWorld(...Object.values(this.canvas._pos(e)));
                let hit = false;
                for (const [id,d] of this.devices) if (d.containsPoint(x,y)) { hit=true; break; }
                if (!hit) this.addDevice(this.selectedModel.type, x-30, y-30, this.selectedModel.model);
            }
        });
    },

    // ===== KEYBOARD =====
    _bindKeyboard() {
        document.addEventListener('keydown', e => {
            if (e.target.tagName==='INPUT'||e.target.tagName==='TEXTAREA'||e.target.tagName==='SELECT') return;
            if (e.target.closest('.config-panel')||e.target.closest('.desktop-app-window')||e.target.closest('.modal-overlay')) return;
            switch(e.key) {
                case 'Delete': case 'Backspace': this.deleteSelected(); DrawingTools.deleteSelected(); break;
                case 'Escape':
                    this.connectionMode=false; this.connectionSource=null; this.pduMode=null; this.pduSource=null;
                    this.selectedModel=null; DrawingTools.setTool('select');
                    this.canvas.canvas.style.cursor='default';
                    document.querySelectorAll('.model-item').forEach(m=>m.classList.remove('active')); break;
                case 's': if(e.ctrlKey){e.preventDefault();this.saveTopology();} break;
                case 'o': if(e.ctrlKey){e.preventDefault();this.loadTopology();} break;
                case 'n': if(e.ctrlKey){e.preventDefault();this.newTopology();} break;
            }
        });
    },

    // ===== DEVICE OPS =====
    addDevice(type, x, y, model) {
        const dev = DeviceFactory.create(type, x, y, model);
        if (!dev) { Utils.notify(`Unknown type: ${type}`, 'error'); return null; }
        this.devices.set(dev.id, dev);
        Utils.notify(`Added ${dev.name}`, 'success');
        return dev;
    },

    removeDevice(id) {
        this.connectionManager.removeByDevice(id, this.devices);
        this.devices.delete(id);
        if (this.selectedDevice?.id === id) this.selectedDevice = null;
    },

    selectDevice(dev) { this.deselectAll(); dev.selected = true; this.selectedDevice = dev; this._updateProps(dev); },
    selectConnection(conn) { this.deselectAll(); conn.selected = true; this.selectedConnection = conn; },
    deselectAll() {
        for (const [,d] of this.devices) d.selected = false;
        for (const c of this.connectionManager.toArray()) c.selected = false;
        DrawingTools.objects.forEach(o => o.selected = false);
        this.selectedDevice = null; this.selectedConnection = null;
    },

    deleteSelected() {
        if (this.selectedDevice) { this.removeDevice(this.selectedDevice.id); Utils.notify('Device deleted','info'); }
        if (this.selectedConnection) { this.connectionManager.disconnect(this.selectedConnection.id, this.devices); this.selectedConnection=null; Utils.notify('Connection removed','info'); }
    },

    toggleSelectedPower() {
        if (this.selectedDevice) { this.selectedDevice.powered = !this.selectedDevice.powered; Utils.notify(`${this.selectedDevice.name} power ${this.selectedDevice.powered?'ON':'OFF'}`, 'info'); }
    },

    // ===== CONNECTION WORKFLOW =====
    handleConnectionClick(x, y) {
        let clicked = null;
        for (const [,d] of this.devices) if (d.containsPoint(x,y)) { clicked=d; break; }
        if (!clicked) return;

        if (!this.connectionSource) {
            this.connectionSource = clicked;
            const port = clicked.getFirstAvailablePort(this.connectionCableType);
            if (!port) { Utils.notify(`${clicked.name}: No available ports`, 'error'); this.connectionSource=null; return; }
            this.connectionSourceIface = port;
            this.selectDevice(clicked);
            Utils.notify(`Source: ${clicked.name} (${port.name}). Click destination.`, 'info');
        } else {
            if (clicked.id === this.connectionSource.id) { Utils.notify('Cannot connect to itself', 'warning'); return; }
            let ct = this.connectionCableType;
            if (ct === 'auto') ct = DeviceCatalog.autoDetectCable(this.connectionSource, clicked);
            const dp = clicked.getFirstAvailablePort(ct);
            if (!dp) { Utils.notify(`${clicked.name}: No available ports for ${ct}`, 'error'); return; }
            const conn = this.connectionManager.createConnection(this.connectionSource, this.connectionSourceIface, clicked, dp, ct);
            if (conn) {
                Utils.notify(`Connected ${this.connectionSource.name}:${this.connectionSourceIface.name} ↔ ${clicked.name}:${dp.name}`, 'success');
                this.network.logEvent('LINK', this.connectionSource.name, clicked.name, ct, 'Connected', 'success');
            } else Utils.notify('Connection failed — ports may already be in use', 'error');
            this.connectionSource = null; this.connectionSourceIface = null; this.deselectAll();
        }
    },

    // ===== PDU WORKFLOW =====
    handlePDUClick(x, y) {
        let clicked = null;
        for (const [,d] of this.devices) if (d.containsPoint(x,y)) { clicked=d; break; }
        if (!clicked) return;

        if (!this.pduSource) {
            this.pduSource = clicked; this.selectDevice(clicked);
            Utils.notify(`PDU Source: ${clicked.name}. Click destination.`, 'info');
        } else {
            const destIP = clicked.getPrimaryIP();
            if (!destIP) { Utils.notify(`${clicked.name} has no IP address`, 'error'); this.pduSource=null; return; }

            if (this.pduMode === 'simple-pdu') {
                const r = this.network.ping(this.pduSource, destIP);
                Utils.notify(`PDU: ${this.pduSource.name} → ${clicked.name} ${r.success?'SUCCESS':'FAILED'}`, r.success?'success':'error');
                this.canvas.animatePing(this.pduSource, clicked, r.hops || r.path, r.success);
            } else if (this.pduMode === 'complex-pdu') {
                this._showComplexPDU(this.pduSource, clicked, destIP);
            }
            this.pduSource = null; this.deselectAll();
        }
    },

    _showComplexPDU(src, dst, dstIP) {
        const srcIP = src.getPrimaryIP() || '';
        const d = document.createElement('div');
        d.className = 'complex-pdu-dialog';
        d.innerHTML = `<div class="config-panel-titlebar"><span>Complex PDU</span><button class="config-panel-close" id="cpdu-close">&times;</button></div>
            <div style="padding:16px">
            <div class="config-field"><label>Source IP</label><input value="${Utils.escapeHtml(srcIP)}" readonly></div>
            <div class="config-field"><label>Dest IP</label><input id="cpdu-dst" value="${Utils.escapeHtml(dstIP)}"></div>
            <div class="config-field"><label>Protocol</label><select id="cpdu-proto"><option>ICMP</option><option>TCP</option><option>UDP</option></select></div>
            <div class="config-field"><label>Dest Port</label><input id="cpdu-port" type="number" value="80"></div>
            <button class="btn-accent" id="cpdu-send">Send PDU</button></div>`;
        document.body.appendChild(d);
        d.querySelector('#cpdu-close').addEventListener('click', () => d.remove());
        d.querySelector('#cpdu-send').addEventListener('click', () => {
            const ip = d.querySelector('#cpdu-dst').value;
            const proto = d.querySelector('#cpdu-proto').value;
            const r = this.network.ping(src, ip);
            this.network.logEvent('PDU', src.name, ip, proto, r.success?'Success':r.message, r.success?'success':'failed');
            Utils.notify(`Complex PDU (${proto}): ${r.success?'Success':'Failed'}`, r.success?'success':'error');
            if (dst) this.canvas.animatePacket(src, dst, r.success?'#6cb6ff':'#ff6b81', 800);
            d.remove();
        });
    },

    // ===== CONTEXT MENU =====
    showContextMenu(clientX, clientY, device) {
        document.getElementById('context-menu')?.remove();
        const menu = document.createElement('div');
        menu.id = 'context-menu'; menu.className = 'context-menu';
        const items = [
            { label:'🔧 Properties', fn:() => DeviceConfigPanel.open(device) },
            { label:'📝 Rename', fn:() => {
                this._showModal({ title:'Rename Device', input: device.name, placeholder:'New name' }).then(n => {
                    if (n) { device.name = n; device.hostname = n; this._updateProps(device); Utils.notify(`Renamed to ${n}`, 'success'); }
                });
            }},
            { label:device.powered?'⏻ Power Off':'⏻ Power On', fn:() => { device.powered=!device.powered; } },
            { label:'🗑 Delete', fn:() => { this.removeDevice(device.id); Utils.notify('Device deleted', 'info'); } },
            { label:'📋 Copy IP', fn:() => { const ip=device.getPrimaryIP(); if(ip) { navigator.clipboard?.writeText(ip); Utils.notify(`Copied: ${ip}`, 'info'); } else Utils.notify('No IP address', 'warning'); } },
        ];
        if (device.hasCLI()) items.splice(1,0,{ label:'💻 CLI', fn:() => { DeviceConfigPanel.open(device); setTimeout(()=>DeviceConfigPanel.switchTab('CLI'),50); }});
        if (device.hasDesktop()) items.splice(1,0,{ label:'🖥 Desktop', fn:() => { DeviceConfigPanel.open(device); setTimeout(()=>DeviceConfigPanel.switchTab('Desktop'),50); }});
        items.forEach(item => {
            const el = document.createElement('div'); el.className = 'context-menu-item'; el.textContent = item.label;
            el.addEventListener('click', () => { item.fn(); menu.remove(); });
            menu.appendChild(el);
        });
        menu.style.left = clientX+'px'; menu.style.top = clientY+'px';
        document.body.appendChild(menu);
        setTimeout(() => document.addEventListener('click', () => menu.remove(), {once:true}), 10);
    },

    // ===== PROPERTIES PANEL =====
    _updateProps(device) {
        const p = document.getElementById('properties-content'); if (!p) return;
        const name = Utils.escapeHtml(device.name), model = Utils.escapeHtml(device.model);
        let html = `<div class="prop-header">${device.img} ${name} <span style="color:var(--overlay0)">(${model})</span></div>
            <div class="prop-row"><span>Type:</span><span>${device.type}</span></div>
            <div class="prop-row"><span>Power:</span><span class="${device.powered?'text-green':'text-red'}">${device.powered?'ON':'OFF'}</span></div>`;
        device.interfaces.filter(i=>i.type!=='console').forEach(i => {
            html += `<div class="prop-row"><span>${Utils.escapeHtml(i.name)}:</span><span>${i.ipAddress||'—'} <span style="color:${i.isConnected()&&i.isUp()?'var(--green)':'var(--red)'}">●</span></span></div>`;
        });
        p.innerHTML = html;
    },

    // ===== EVENT LIST =====
    addPacketToEventList(evt) {
        const list = document.getElementById('event-list-body'); if (!list) return;
        const row = document.createElement('tr');
        row.className = evt.status==='success'?'event-success':evt.status==='failed'?'event-failed':'';
        row.innerHTML = `<td>${evt.id}</td><td>${Utils.escapeHtml(evt.time)}</td><td>${Utils.escapeHtml(evt.source)}</td><td>${Utils.escapeHtml(evt.dest)}</td><td>${Utils.escapeHtml(evt.type)}</td><td>${Utils.escapeHtml(evt.info)}</td>`;
        list.insertBefore(row, list.firstChild);
        while (list.children.length > 200) list.removeChild(list.lastChild);
    },

    // ===== SAVE / LOAD (with modal dialogs) =====
    async saveTopology() {
        const name = await this._showModal({ title:'Save Topology', input:'My Network', placeholder:'Topology name', okLabel:'Save' });
        if (!name) return;
        const data = { name, devices:[...this.devices.values()].map(d=>d.serialize()), connections:this.connectionManager.serialize(), drawings:DrawingTools.serialize(), timestamp:new Date().toISOString() };
        try {
            const r = await fetch('/api/topologies', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data) });
            if (r.ok) Utils.notify(`Saved "${name}"`, 'success');
            else Utils.notify('Save failed', 'error');
        } catch(e) {
            // Fallback: download file
            const blob = new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
            const a = document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=`${name}.comnet.json`; a.click();
            Utils.notify(`Downloaded "${name}"`, 'success');
        }
    },

    async loadTopology() {
        try {
            const r = await fetch('/api/topologies');
            if (r.ok) {
                const { topologies } = await r.json();
                if (topologies?.length) {
                    const list = topologies.map(t => ({ label: `${t.name} (${t.devices} devices, ${t.connections} connections)`, value: t.id }));
                    const selected = await this._showModal({ title:'Load Topology', message:'Select a topology to load:', list, okLabel:'Load' });
                    if (selected) {
                        const r2 = await fetch(`/api/topologies/${selected}`);
                        if (r2.ok) { this._load(await r2.json()); return; }
                    }
                    if (selected === null) return;
                }
            }
        } catch(e) {}
        // Fallback: file picker
        const input = document.createElement('input'); input.type='file'; input.accept='.json,.comnet';
        input.addEventListener('change', e => {
            const file = e.target.files[0]; if (!file) return;
            const reader = new FileReader();
            reader.onload = ev => { try { this._load(JSON.parse(ev.target.result)); } catch(err) { Utils.notify('Invalid file','error'); } };
            reader.readAsText(file);
        });
        input.click();
    },

    _load(data) {
        this.devices.clear(); this.connectionManager.connections.clear(); Utils._counters = {};
        (data.devices||[]).forEach(d => { const dev = NetworkDevice.deserialize(d); if (dev) this.devices.set(dev.id, dev); });
        if (data.connections) this.connectionManager.deserialize(data.connections);
        if (data.drawings) DrawingTools.deserialize(data.drawings);
        this.deselectAll(); this.canvas.fitToContent();
        Utils.notify(`Loaded "${data.name||'Unknown'}" (${this.devices.size} devices)`, 'success');
    },

    async newTopology() {
        if (this.devices.size) {
            const ok = await this._showModal({ title:'New Topology', message:'Clear current topology? Unsaved changes will be lost.', okLabel:'Clear', cancel:true });
            if (!ok) return;
        }
        this.devices.clear(); this.connectionManager.connections.clear();
        DrawingTools.clear(); this.network.clearLog(); Utils._counters = {};
        this.deselectAll(); this.canvas.resetView();
        const list = document.getElementById('event-list-body'); if (list) list.innerHTML = '';
        Utils.notify('New topology created', 'info');
    },
};

document.addEventListener('DOMContentLoaded', () => ComNetApp.init());
