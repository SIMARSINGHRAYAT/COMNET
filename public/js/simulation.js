/* ComNet - Simulation Mode Engine (PT-style play/pause/step/timeline) */

const SimulationEngine = {
    mode: 'realtime',  // 'realtime' | 'simulation'
    playing: false,
    speed: 1,          // playback speed multiplier
    currentTime: 0,    // simulation time in ms
    stepInterval: null,
    eventQueue: [],     // pending simulation events
    scenarioEvents: [], // all events in current scenario
    currentEventIdx: 0,
    maxTime: 30000,     // 30 second timeline default
    _app: null,
    _timelineEl: null,
    _controlsEl: null,

    init(app) {
        this._app = app;
        this._buildModeToggle();
    },

    _buildModeToggle() {
        const statusBar = document.querySelector('.status-bar');
        if (!statusBar) return;

        const toggle = document.createElement('div');
        toggle.className = 'sim-mode-toggle';
        toggle.id = 'sim-mode-toggle';
        toggle.innerHTML = `
            <button class="sim-mode-btn active" data-mode="realtime" title="Realtime Mode">
                <i class="fas fa-clock"></i> Realtime
            </button>
            <button class="sim-mode-btn" data-mode="simulation" title="Simulation Mode">
                <i class="fas fa-play-circle"></i> Simulation
            </button>`;
        statusBar.insertBefore(toggle, statusBar.firstChild);

        toggle.querySelectorAll('.sim-mode-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.setMode(btn.dataset.mode);
            });
        });
    },

    setMode(mode) {
        this.mode = mode;
        this.playing = false;
        this.currentTime = 0;
        this.currentEventIdx = 0;
        clearInterval(this.stepInterval);

        document.querySelectorAll('.sim-mode-btn').forEach(b =>
            b.classList.toggle('active', b.dataset.mode === mode));

        const bottomToolbar = document.querySelector('.bottom-toolbar');
        if (mode === 'simulation') {
            this._showSimControls();
            bottomToolbar?.classList.add('sim-active');
            Utils.notify('Simulation Mode — Use controls to step through packet flow', 'info');
        } else {
            this._hideSimControls();
            bottomToolbar?.classList.remove('sim-active');
            Utils.notify('Realtime Mode', 'info');
        }
    },

    _showSimControls() {
        let bar = document.getElementById('sim-controls');
        if (bar) bar.remove();

        bar = document.createElement('div');
        bar.id = 'sim-controls';
        bar.className = 'sim-controls';
        bar.innerHTML = `
            <div class="sim-transport">
                <button class="sim-btn" id="sim-reset" title="Reset"><i class="fas fa-backward-fast"></i></button>
                <button class="sim-btn" id="sim-step-back" title="Step Back"><i class="fas fa-backward-step"></i></button>
                <button class="sim-btn sim-btn-play" id="sim-play" title="Play/Pause"><i class="fas fa-play" id="sim-play-icon"></i></button>
                <button class="sim-btn" id="sim-step-fwd" title="Step Forward"><i class="fas fa-forward-step"></i></button>
                <button class="sim-btn" id="sim-end" title="Go to End"><i class="fas fa-forward-fast"></i></button>
            </div>
            <div class="sim-timeline-wrap">
                <span class="sim-time" id="sim-time-current">0.000s</span>
                <div class="sim-timeline" id="sim-timeline">
                    <div class="sim-timeline-track" id="sim-timeline-track"></div>
                    <div class="sim-timeline-cursor" id="sim-timeline-cursor"></div>
                </div>
                <span class="sim-time" id="sim-time-total">0.000s</span>
            </div>
            <div class="sim-speed-control">
                <label>Speed</label>
                <input type="range" id="sim-speed" min="0.25" max="4" step="0.25" value="1">
                <span id="sim-speed-label">1x</span>
            </div>
            <div class="sim-event-filters">
                <button class="sim-filter-btn active" data-filter="all" title="All Events">All</button>
                <button class="sim-filter-btn" data-filter="icmp" title="ICMP Only">ICMP</button>
                <button class="sim-filter-btn" data-filter="arp" title="ARP Only">ARP</button>
                <button class="sim-filter-btn" data-filter="tcp" title="TCP Only">TCP</button>
                <button class="sim-filter-btn" data-filter="dhcp" title="DHCP Only">DHCP</button>
            </div>`;

        const mainArea = document.querySelector('.main-area');
        if (mainArea) mainArea.parentElement.insertBefore(bar, mainArea.nextSibling);
        else document.body.appendChild(bar);

        this._controlsEl = bar;
        this._bindSimControls(bar);
    },

    _hideSimControls() {
        const bar = document.getElementById('sim-controls');
        if (bar) bar.remove();
        this._controlsEl = null;
    },

    _bindSimControls(bar) {
        bar.querySelector('#sim-play').addEventListener('click', () => this.togglePlay());
        bar.querySelector('#sim-reset').addEventListener('click', () => this.reset());
        bar.querySelector('#sim-step-fwd').addEventListener('click', () => this.stepForward());
        bar.querySelector('#sim-step-back').addEventListener('click', () => this.stepBack());
        bar.querySelector('#sim-end').addEventListener('click', () => this.goToEnd());

        bar.querySelector('#sim-speed').addEventListener('input', e => {
            this.speed = parseFloat(e.target.value);
            bar.querySelector('#sim-speed-label').textContent = this.speed + 'x';
        });

        bar.querySelectorAll('.sim-filter-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                bar.querySelectorAll('.sim-filter-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
        });

        const timeline = bar.querySelector('#sim-timeline');
        timeline.addEventListener('click', e => {
            const rect = timeline.getBoundingClientRect();
            const pct = (e.clientX - rect.left) / rect.width;
            this.seekTo(pct * this.maxTime);
        });
    },

    togglePlay() {
        this.playing = !this.playing;
        const icon = document.getElementById('sim-play-icon');
        if (icon) icon.className = this.playing ? 'fas fa-pause' : 'fas fa-play';

        if (this.playing) {
            this.stepInterval = setInterval(() => {
                this.currentTime += 100 * this.speed;
                if (this.currentTime >= this.maxTime) {
                    this.currentTime = this.maxTime;
                    this.playing = false;
                    if (icon) icon.className = 'fas fa-play';
                    clearInterval(this.stepInterval);
                }
                this._processEventsUpTo(this.currentTime);
                this._updateTimeline();
            }, 100);
        } else {
            clearInterval(this.stepInterval);
        }
    },

    stepForward() {
        if (this.currentEventIdx < this.scenarioEvents.length) {
            const evt = this.scenarioEvents[this.currentEventIdx];
            this.currentTime = evt.time;
            this._processEvent(evt);
            this.currentEventIdx++;
            this._updateTimeline();
        }
    },

    stepBack() {
        if (this.currentEventIdx > 0) {
            this.currentEventIdx--;
            this.currentTime = this.currentEventIdx > 0
                ? this.scenarioEvents[this.currentEventIdx - 1].time
                : 0;
            this._updateTimeline();
        }
    },

    reset() {
        this.currentTime = 0;
        this.currentEventIdx = 0;
        this.playing = false;
        clearInterval(this.stepInterval);
        const icon = document.getElementById('sim-play-icon');
        if (icon) icon.className = 'fas fa-play';
        this._updateTimeline();
    },

    goToEnd() {
        this.currentTime = this.maxTime;
        this._processEventsUpTo(this.maxTime);
        this.currentEventIdx = this.scenarioEvents.length;
        this.playing = false;
        clearInterval(this.stepInterval);
        const icon = document.getElementById('sim-play-icon');
        if (icon) icon.className = 'fas fa-play';
        this._updateTimeline();
    },

    seekTo(time) {
        this.currentTime = Math.max(0, Math.min(time, this.maxTime));
        this.currentEventIdx = 0;
        this._processEventsUpTo(this.currentTime);
        this._updateTimeline();
    },

    addScenarioEvent(evt) {
        this.scenarioEvents.push(evt);
        this.scenarioEvents.sort((a, b) => a.time - b.time);
        if (evt.time > this.maxTime) this.maxTime = evt.time + 5000;
        this._updateTimeline();
    },

    clearScenario() {
        this.scenarioEvents = [];
        this.eventQueue = [];
        this.currentEventIdx = 0;
        this.currentTime = 0;
        this._updateTimeline();
    },

    // Create a ping scenario for simulation mode
    createPingScenario(srcDevice, dstIP) {
        const result = this._app.network._tracePath(srcDevice, dstIP);
        this.clearScenario();
        const hops = result.hops || [];

        let time = 0;
        for (let i = 0; i < hops.length; i++) {
            // ARP request at each hop
            this.addScenarioEvent({
                time: time,
                type: 'arp-request',
                protocol: 'ARP',
                srcDevice: hops[i].deviceId,
                dstDevice: hops[Math.min(i + 1, hops.length - 1)]?.deviceId,
                description: `ARP Request: Who has ${dstIP}?`,
                status: 'info'
            });
            time += 500;

            // ARP reply
            if (i < hops.length - 1) {
                this.addScenarioEvent({
                    time: time,
                    type: 'arp-reply',
                    protocol: 'ARP',
                    srcDevice: hops[i + 1].deviceId,
                    dstDevice: hops[i].deviceId,
                    description: `ARP Reply`,
                    status: 'success'
                });
                time += 300;
            }

            // ICMP forward
            this.addScenarioEvent({
                time: time,
                type: 'icmp-echo',
                protocol: 'ICMP',
                srcDevice: hops[i].deviceId,
                dstDevice: hops[Math.min(i + 1, hops.length - 1)]?.deviceId,
                description: `ICMP Echo Request → ${dstIP}`,
                status: result.success ? 'success' : 'failed'
            });
            time += 400;
        }

        // ICMP reply path (reverse)
        if (result.success) {
            for (let i = hops.length - 1; i > 0; i--) {
                this.addScenarioEvent({
                    time: time,
                    type: 'icmp-reply',
                    protocol: 'ICMP',
                    srcDevice: hops[i].deviceId,
                    dstDevice: hops[i - 1].deviceId,
                    description: 'ICMP Echo Reply',
                    status: 'success'
                });
                time += 400;
            }
        }

        this.maxTime = time + 2000;
        this._updateTimeline();
        return result;
    },

    // Create a DHCP scenario: Discover → Offer → Request → Ack
    createDHCPScenario(clientDevice) {
        this.clearScenario();
        const app = this._app;
        let serverDev = null;
        for (const [id, dev] of app.devices) {
            if (dev.services?.dhcp?.enabled || dev._dhcpPools) { serverDev = dev; break; }
        }
        if (!serverDev) {
            Utils.notify('No DHCP server found on network', 'warning');
            return { success: false, message: 'No DHCP server' };
        }

        let time = 0;

        // DHCP Discover (broadcast)
        this.addScenarioEvent({ time, type:'dhcp-discover', protocol:'DHCP', srcDevice:clientDevice.id,
            dstDevice:serverDev.id, description:'DHCP Discover (broadcast)', status:'info' });
        time += 600;

        // DHCP Offer
        this.addScenarioEvent({ time, type:'dhcp-offer', protocol:'DHCP', srcDevice:serverDev.id,
            dstDevice:clientDevice.id, description:'DHCP Offer', status:'success' });
        time += 600;

        // DHCP Request
        this.addScenarioEvent({ time, type:'dhcp-request', protocol:'DHCP', srcDevice:clientDevice.id,
            dstDevice:serverDev.id, description:'DHCP Request', status:'info' });
        time += 600;

        // DHCP Ack
        const dhcpResult = app.network.requestDHCP(clientDevice);
        this.addScenarioEvent({ time, type:'dhcp-ack', protocol:'DHCP', srcDevice:serverDev.id,
            dstDevice:clientDevice.id, description:`DHCP ACK — Assigned ${dhcpResult.ip||'N/A'}`, status: dhcpResult.success?'success':'failed' });
        time += 400;

        // Apply IP if successful
        if (dhcpResult.success) {
            const iface = clientDevice.interfaces.find(i => i.type === 'ethernet' || i.type === 'wireless');
            if (iface) {
                iface.ipAddress = dhcpResult.ip;
                iface.subnetMask = dhcpResult.mask || '255.255.255.0';
            }
        }

        this.maxTime = time + 2000;
        this._updateTimeline();
        return dhcpResult;
    },

    // Create a DNS scenario: Query → Response
    createDNSScenario(clientDevice, domain) {
        this.clearScenario();
        const app = this._app;
        let dnsDev = null;
        for (const [id, dev] of app.devices) {
            if (dev.services?.dns?.enabled) { dnsDev = dev; break; }
        }
        if (!dnsDev) {
            Utils.notify('No DNS server found on network', 'warning');
            return { success: false, message: 'No DNS server' };
        }

        let time = 0;

        // DNS Query
        this.addScenarioEvent({ time, type:'dns-query', protocol:'DNS', srcDevice:clientDevice.id,
            dstDevice:dnsDev.id, description:`DNS Query: ${domain}`, status:'info' });
        time += 500;

        // DNS Response
        const dnsResult = app.network.dnsLookup(clientDevice, domain);
        this.addScenarioEvent({ time, type:'dns-response', protocol:'DNS', srcDevice:dnsDev.id,
            dstDevice:clientDevice.id, description: dnsResult.success ? `DNS Response: ${domain} → ${dnsResult.ip}` : `DNS: ${domain} not found`,
            status: dnsResult.success ? 'success' : 'failed' });
        time += 400;

        this.maxTime = time + 2000;
        this._updateTimeline();
        return dnsResult;
    },

    // Create a TCP handshake scenario: SYN → SYN-ACK → ACK → Data → FIN
    createTCPScenario(srcDevice, dstIP, port) {
        const result = this._app.network._tracePath(srcDevice, dstIP);
        this.clearScenario();
        if (!result.success) return result;
        const dstDev = this._app.network.findDeviceByIP(dstIP);
        if (!dstDev) return { success: false, message: 'Destination not found' };

        let time = 0;

        // SYN
        this.addScenarioEvent({ time, type:'tcp-syn', protocol:'TCP', srcDevice:srcDevice.id,
            dstDevice:dstDev.id, description:`TCP SYN → ${dstIP}:${port}`, status:'info' });
        time += 400;

        // SYN-ACK
        this.addScenarioEvent({ time, type:'tcp-synack', protocol:'TCP', srcDevice:dstDev.id,
            dstDevice:srcDevice.id, description:'TCP SYN-ACK', status:'success' });
        time += 400;

        // ACK
        this.addScenarioEvent({ time, type:'tcp-ack', protocol:'TCP', srcDevice:srcDevice.id,
            dstDevice:dstDev.id, description:'TCP ACK — Connection Established', status:'success' });
        time += 300;

        // Data
        this.addScenarioEvent({ time, type:'tcp-data', protocol:'TCP', srcDevice:srcDevice.id,
            dstDevice:dstDev.id, description:`TCP DATA → port ${port}`, status:'success' });
        time += 500;

        // Data ACK
        this.addScenarioEvent({ time, type:'tcp-ack', protocol:'TCP', srcDevice:dstDev.id,
            dstDevice:srcDevice.id, description:'TCP ACK', status:'success' });
        time += 300;

        // FIN
        this.addScenarioEvent({ time, type:'tcp-fin', protocol:'TCP', srcDevice:srcDevice.id,
            dstDevice:dstDev.id, description:'TCP FIN', status:'info' });
        time += 300;

        // FIN-ACK
        this.addScenarioEvent({ time, type:'tcp-finack', protocol:'TCP', srcDevice:dstDev.id,
            dstDevice:srcDevice.id, description:'TCP FIN-ACK — Connection Closed', status:'success' });
        time += 300;

        this.maxTime = time + 2000;
        this._updateTimeline();
        return { success: true, hops: result.hops };
    },

    _processEventsUpTo(time) {
        while (this.currentEventIdx < this.scenarioEvents.length &&
               this.scenarioEvents[this.currentEventIdx].time <= time) {
            this._processEvent(this.scenarioEvents[this.currentEventIdx]);
            this.currentEventIdx++;
        }
    },

    _processEvent(evt) {
        // Animate & log
        const srcDev = this._app.devices.get(evt.srcDevice);
        const dstDev = this._app.devices.get(evt.dstDevice);

        const color = evt.status === 'success' ? '#a6e3a1'
            : evt.status === 'failed' ? '#f38ba8'
            : evt.protocol === 'ARP' ? '#f9e2af'
            : '#89b4fa';

        if (srcDev && dstDev) {
            this._app.canvas.animatePacket(srcDev, dstDev, color, 600 / this.speed);
        }

        this._app.network.logEvent(
            evt.protocol, srcDev?.name || '?', dstDev?.name || '?',
            evt.protocol, evt.description, evt.status
        );

        // Add timeline marker
        this._addTimelineMarker(evt);
    },

    _addTimelineMarker(evt) {
        const track = document.getElementById('sim-timeline-track');
        if (!track) return;
        const pct = (evt.time / this.maxTime) * 100;
        const marker = document.createElement('div');
        marker.className = `sim-timeline-marker ${evt.status}`;
        marker.style.left = pct + '%';
        marker.title = `${(evt.time / 1000).toFixed(3)}s - ${evt.protocol}: ${evt.description}`;
        track.appendChild(marker);
    },

    _updateTimeline() {
        const cur = document.getElementById('sim-time-current');
        const tot = document.getElementById('sim-time-total');
        const cursor = document.getElementById('sim-timeline-cursor');

        if (cur) cur.textContent = (this.currentTime / 1000).toFixed(3) + 's';
        if (tot) tot.textContent = (this.maxTime / 1000).toFixed(3) + 's';
        if (cursor) cursor.style.left = ((this.currentTime / this.maxTime) * 100) + '%';
    },

    isSimMode() { return this.mode === 'simulation'; },
};
