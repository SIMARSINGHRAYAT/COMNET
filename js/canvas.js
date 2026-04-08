/* ============================================
   ComNet Simulator - Canvas Renderer & Editor
   ============================================ */

class CanvasRenderer {
    constructor(canvasElement, app) {
        this.canvas = canvasElement;
        this.ctx = canvasElement.getContext('2d');
        this.app = app;

        // Camera / viewport
        this.offsetX = 0;
        this.offsetY = 0;
        this.zoom = 1;
        this.minZoom = 0.2;
        this.maxZoom = 3;

        // Grid
        this.showGrid = true;
        this.gridSize = 30;
        this.showLabels = true;
        this.showPortLabels = false;

        // Interaction state
        this.isDragging = false;
        this.isPanning = false;
        this.dragDevice = null;
        this.dragOffsetX = 0;
        this.dragOffsetY = 0;
        this.selectionRect = null;
        this.connectingFrom = null; // { device, interface }
        this.tempLineEnd = null;
        this.hoveredDevice = null;
        this.hoveredConnection = null;
        this.pduSource = null;

        // Port selector popup
        this.portSelector = null;

        // Packets being animated
        this.animatedPackets = [];

        // Resize
        this._resize();
        window.addEventListener('resize', () => this._resize());

        // Mouse events
        this.canvas.addEventListener('mousedown', (e) => this._onMouseDown(e));
        this.canvas.addEventListener('mousemove', (e) => this._onMouseMove(e));
        this.canvas.addEventListener('mouseup', (e) => this._onMouseUp(e));
        this.canvas.addEventListener('dblclick', (e) => this._onDoubleClick(e));
        this.canvas.addEventListener('wheel', (e) => this._onWheel(e));
        this.canvas.addEventListener('contextmenu', (e) => this._onContextMenu(e));

        // Start render loop
        this._render();
    }

    _resize() {
        const container = this.canvas.parentElement;
        this.canvas.width = container.clientWidth * window.devicePixelRatio;
        this.canvas.height = container.clientHeight * window.devicePixelRatio;
        this.canvas.style.width = container.clientWidth + 'px';
        this.canvas.style.height = container.clientHeight + 'px';
        this.ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
        this.viewWidth = container.clientWidth;
        this.viewHeight = container.clientHeight;
    }

    // Convert screen coords to world coords
    screenToWorld(sx, sy) {
        return {
            x: (sx - this.offsetX) / this.zoom,
            y: (sy - this.offsetY) / this.zoom
        };
    }

    // Convert world coords to screen coords
    worldToScreen(wx, wy) {
        return {
            x: wx * this.zoom + this.offsetX,
            y: wy * this.zoom + this.offsetY
        };
    }

    // === Rendering ===
    _render() {
        const ctx = this.ctx;
        ctx.save();
        ctx.setTransform(window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0);

        // Clear
        ctx.fillStyle = '#1e1e2e';
        ctx.fillRect(0, 0, this.viewWidth, this.viewHeight);

        // Apply camera transform
        ctx.save();
        ctx.translate(this.offsetX, this.offsetY);
        ctx.scale(this.zoom, this.zoom);

        // Draw grid
        if (this.showGrid) this._drawGrid(ctx);

        // Draw connections
        this._drawConnections(ctx);

        // Draw temp connection line
        if (this.connectingFrom && this.tempLineEnd) {
            this._drawTempLine(ctx);
        }

        // Draw devices
        this._drawDevices(ctx);

        // Draw animated packets
        this._drawPacketAnimations(ctx);

        // Draw selection rectangle
        if (this.selectionRect) {
            this._drawSelectionRect(ctx);
        }

        ctx.restore();

        // Draw HUD (not affected by zoom)
        this._drawHUD(ctx);

        ctx.restore();

        requestAnimationFrame(() => this._render());
    }

    _drawGrid(ctx) {
        const gs = this.gridSize;
        const startX = Math.floor(-this.offsetX / this.zoom / gs) * gs;
        const startY = Math.floor(-this.offsetY / this.zoom / gs) * gs;
        const endX = startX + this.viewWidth / this.zoom + gs * 2;
        const endY = startY + this.viewHeight / this.zoom + gs * 2;

        ctx.strokeStyle = '#25253a';
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        for (let x = startX; x < endX; x += gs) {
            ctx.moveTo(x, startY);
            ctx.lineTo(x, endY);
        }
        for (let y = startY; y < endY; y += gs) {
            ctx.moveTo(startX, y);
            ctx.lineTo(endX, y);
        }
        ctx.stroke();
    }

    _drawConnections(ctx) {
        const connections = this.app.connectionManager.getAll();
        for (const conn of connections) {
            const devA = this.app.devices.get(conn.deviceA);
            const devB = this.app.devices.get(conn.deviceB);
            if (!devA || !devB) continue;

            const ax = devA.getCenterX(), ay = devA.getCenterY();
            const bx = devB.getCenterX(), by = devB.getCenterY();

            // Draw cable
            ctx.beginPath();
            ctx.moveTo(ax, ay);
            ctx.lineTo(bx, by);

            if (conn.selected || conn === this.hoveredConnection) {
                ctx.strokeStyle = '#89b4fa';
                ctx.lineWidth = 3;
            } else {
                ctx.strokeStyle = conn.color;
                ctx.lineWidth = conn.status === 'up' ? 2 : 1;
                if (conn.status === 'down') {
                    ctx.setLineDash([5, 5]);
                }
            }
            ctx.stroke();
            ctx.setLineDash([]);

            // Draw port status indicators (small dots at connection points)
            const ifaceA = devA.getInterface(conn.interfaceA);
            const ifaceB = devB.getInterface(conn.interfaceB);

            // Calculate positions near devices
            const angle = Math.atan2(by - ay, bx - ax);
            const offsetDist = 35;

            const dotAx = ax + Math.cos(angle) * offsetDist;
            const dotAy = ay + Math.sin(angle) * offsetDist;
            const dotBx = bx - Math.cos(angle) * offsetDist;
            const dotBy = by - Math.sin(angle) * offsetDist;

            // Port status dots
            this._drawStatusDot(ctx, dotAx, dotAy, ifaceA ? ifaceA.status : 'down');
            this._drawStatusDot(ctx, dotBx, dotBy, ifaceB ? ifaceB.status : 'down');

            // Port labels
            if (this.showPortLabels) {
                ctx.font = '9px sans-serif';
                ctx.fillStyle = '#6c7086';
                ctx.textAlign = 'center';
                if (ifaceA) ctx.fillText(conn.interfaceA, dotAx, dotAy - 8);
                if (ifaceB) ctx.fillText(conn.interfaceB, dotBx, dotBy - 8);
            }
        }
    }

    _drawStatusDot(ctx, x, y, status) {
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fillStyle = status === 'up' ? '#a6e3a1' : '#f38ba8';
        ctx.fill();
    }

    _drawTempLine(ctx) {
        const dev = this.app.devices.get(this.connectingFrom.deviceId);
        if (!dev) return;
        ctx.beginPath();
        ctx.moveTo(dev.getCenterX(), dev.getCenterY());
        ctx.lineTo(this.tempLineEnd.x, this.tempLineEnd.y);
        ctx.strokeStyle = '#89b4fa';
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 4]);
        ctx.stroke();
        ctx.setLineDash([]);
    }

    _drawDevices(ctx) {
        for (const [id, device] of this.app.devices) {
            this._drawDevice(ctx, device);
        }
    }

    _drawDevice(ctx, device) {
        const x = device.x;
        const y = device.y;
        const w = device.width;
        const h = device.height;
        const cx = x + w / 2;
        const cy = y + h / 2;

        // Selection glow
        if (device.selected) {
            ctx.save();
            ctx.shadowColor = '#89b4fa';
            ctx.shadowBlur = 15;
            ctx.fillStyle = 'rgba(137, 180, 250, 0.1)';
            ctx.fillRect(x - 4, y - 4, w + 8, h + 8);
            ctx.restore();
        }

        // Hover highlight
        if (device === this.hoveredDevice && !device.selected) {
            ctx.fillStyle = 'rgba(137, 180, 250, 0.05)';
            ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
        }

        // Device body
        ctx.fillStyle = device.powered ? '#313244' : '#1e1e2e';
        ctx.strokeStyle = device.selected ? '#89b4fa' :
                          device === this.hoveredDevice ? '#585b70' : '#45475a';
        ctx.lineWidth = device.selected ? 2 : 1;
        ctx.beginPath();
        ctx.roundRect(x, y, w, h, 8);
        ctx.fill();
        ctx.stroke();

        // Device icon (using text since we can't load FA in canvas directly)
        ctx.fillStyle = device.powered ? device.color : '#585b70';
        ctx.font = `${device.iconSize}px "Font Awesome 6 Free"`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Draw device type symbol instead of FA icon
        const symbol = this._getDeviceSymbol(device.type);
        ctx.font = `bold ${device.iconSize - 2}px sans-serif`;
        ctx.fillText(symbol, cx, cy - 2);

        // Power indicator
        if (!device.powered) {
            ctx.fillStyle = '#f38ba8';
            ctx.beginPath();
            ctx.arc(x + w - 6, y + 6, 4, 0, Math.PI * 2);
            ctx.fill();
        }

        // Device label
        if (this.showLabels) {
            ctx.font = '11px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.fillStyle = '#cdd6f4';
            ctx.fillText(device.name, cx, y + h + 4);

            // IP label (show first configured IP)
            const ip = device.getPrimaryIP();
            if (ip) {
                ctx.font = '9px monospace';
                ctx.fillStyle = '#a6adc8';
                ctx.fillText(ip, cx, y + h + 18);
            }
        }
    }

    _getDeviceSymbol(type) {
        const symbols = {
            'pc': '🖥',
            'laptop': '💻',
            'server': '🖳',
            'printer': '🖨',
            'smartphone': '📱',
            'router': '⬡',
            'switch': '⬢',
            'hub': '◎',
            'bridge': '⊞',
            'access-point': '📡',
            'firewall': '🛡'
        };
        return symbols[type] || '?';
    }

    _drawPacketAnimations(ctx) {
        const now = Date.now();
        for (let i = this.animatedPackets.length - 1; i >= 0; i--) {
            const pkt = this.animatedPackets[i];
            const elapsed = now - pkt.startTime;
            const progress = Math.min(elapsed / pkt.duration, 1);

            const x = pkt.fromX + (pkt.toX - pkt.fromX) * progress;
            const y = pkt.fromY + (pkt.toY - pkt.fromY) * progress;

            // Draw packet envelope
            ctx.save();
            ctx.beginPath();
            ctx.arc(x, y, 8, 0, Math.PI * 2);
            const colors = {
                'ICMP': '#a6e3a1', 'ARP': '#f9e2af', 'TCP': '#89b4fa',
                'UDP': '#cba6f7', 'DHCP': '#fab387', 'DNS': '#94e2d5'
            };
            ctx.fillStyle = colors[pkt.protocol] || '#89b4fa';
            ctx.shadowColor = ctx.fillStyle;
            ctx.shadowBlur = 10;
            ctx.fill();
            ctx.restore();

            // Label
            ctx.font = '8px monospace';
            ctx.textAlign = 'center';
            ctx.fillStyle = '#1e1e2e';
            ctx.fillText(pkt.protocol[0], x, y + 3);

            if (progress >= 1) {
                this.animatedPackets.splice(i, 1);
                if (pkt.onComplete) pkt.onComplete();
            }
        }
    }

    _drawSelectionRect(ctx) {
        const r = this.selectionRect;
        ctx.fillStyle = 'rgba(137, 180, 250, 0.1)';
        ctx.strokeStyle = '#89b4fa';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.fillRect(r.x, r.y, r.w, r.h);
        ctx.strokeRect(r.x, r.y, r.w, r.h);
        ctx.setLineDash([]);
    }

    _drawHUD(ctx) {
        // Nothing needed, HUD is HTML-based
    }

    // === Events ===
    _getMousePos(e) {
        const rect = this.canvas.getBoundingClientRect();
        return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }

    _onMouseDown(e) {
        const pos = this._getMousePos(e);
        const worldPos = this.screenToWorld(pos.x, pos.y);
        const tool = this.app.currentTool;

        // Close any port selector
        this._closePortSelector();

        if (e.button === 1 || (e.button === 0 && tool === 'move')) {
            // Middle click or move tool: start panning
            this.isPanning = true;
            this._panStartX = pos.x - this.offsetX;
            this._panStartY = pos.y - this.offsetY;
            this.canvas.parentElement.classList.add('panning');
            return;
        }

        if (e.button !== 0) return;

        if (tool === 'select') {
            // Check if clicking on a device
            const device = this._findDeviceAt(worldPos.x, worldPos.y);
            const conn = device ? null : this.app.connectionManager.findAtPoint(worldPos.x, worldPos.y, this.app.devices);

            if (device) {
                if (!e.shiftKey && !device.selected) {
                    this._deselectAll();
                }
                device.selected = true;
                this.isDragging = true;
                this.dragDevice = device;
                this.dragOffsetX = worldPos.x - device.x;
                this.dragOffsetY = worldPos.y - device.y;
                this.app.showProperties(device);
            } else if (conn) {
                this._deselectAll();
                conn.selected = true;
                this.app.showConnectionProperties(conn);
            } else {
                this._deselectAll();
                this.app.hideProperties();
                // Start selection rectangle
                this.selectionRect = { x: worldPos.x, y: worldPos.y, w: 0, h: 0, startX: worldPos.x, startY: worldPos.y };
            }
        } else if (tool === 'connect') {
            const device = this._findDeviceAt(worldPos.x, worldPos.y);
            if (device) {
                if (!this.connectingFrom) {
                    // Show port selector for source
                    this._showPortSelector(device, pos, 'source');
                } else {
                    // Show port selector for target
                    if (device.id !== this.connectingFrom.deviceId) {
                        this._showPortSelector(device, pos, 'target');
                    }
                }
            } else {
                this.connectingFrom = null;
                this.tempLineEnd = null;
            }
        } else if (tool === 'delete') {
            const device = this._findDeviceAt(worldPos.x, worldPos.y);
            if (device) {
                this.app.deleteDevice(device.id);
            } else {
                const conn = this.app.connectionManager.findAtPoint(worldPos.x, worldPos.y, this.app.devices);
                if (conn) {
                    this.app.deleteConnection(conn.id);
                }
            }
        } else if (tool === 'pdu') {
            const device = this._findDeviceAt(worldPos.x, worldPos.y);
            if (device) {
                if (!this.pduSource) {
                    this.pduSource = device;
                    Utils.notify(`PDU Source: ${device.name}. Click destination device.`, 'info');
                } else {
                    if (device.id !== this.pduSource.id) {
                        this.app.sendPing(this.pduSource, device);
                    }
                    this.pduSource = null;
                }
            }
        } else if (tool === 'inspect') {
            const device = this._findDeviceAt(worldPos.x, worldPos.y);
            if (device) {
                this.app.showDeviceConfig(device);
            } else {
                const conn = this.app.connectionManager.findAtPoint(worldPos.x, worldPos.y, this.app.devices);
                if (conn) {
                    this.app.showConnectionProperties(conn);
                }
            }
        }

        this.app.updateStatusBar();
    }

    _onMouseMove(e) {
        const pos = this._getMousePos(e);
        const worldPos = this.screenToWorld(pos.x, pos.y);

        // Update coords display
        document.getElementById('coords-display').textContent =
            `X: ${Math.round(worldPos.x)}, Y: ${Math.round(worldPos.y)}`;

        if (this.isPanning) {
            this.offsetX = pos.x - this._panStartX;
            this.offsetY = pos.y - this._panStartY;
            return;
        }

        if (this.isDragging && this.dragDevice) {
            this.dragDevice.x = worldPos.x - this.dragOffsetX;
            this.dragDevice.y = worldPos.y - this.dragOffsetY;

            // Snap to grid
            if (this.showGrid) {
                this.dragDevice.x = Math.round(this.dragDevice.x / this.gridSize) * this.gridSize;
                this.dragDevice.y = Math.round(this.dragDevice.y / this.gridSize) * this.gridSize;
            }
            return;
        }

        if (this.selectionRect) {
            this.selectionRect.w = worldPos.x - this.selectionRect.startX;
            this.selectionRect.h = worldPos.y - this.selectionRect.startY;
            this.selectionRect.x = Math.min(this.selectionRect.startX, worldPos.x);
            this.selectionRect.y = Math.min(this.selectionRect.startY, worldPos.y);
            this.selectionRect.w = Math.abs(this.selectionRect.w);
            this.selectionRect.h = Math.abs(this.selectionRect.h);
            return;
        }

        if (this.connectingFrom) {
            this.tempLineEnd = worldPos;
        }

        // Hover detection
        this.hoveredDevice = this._findDeviceAt(worldPos.x, worldPos.y);
        if (!this.hoveredDevice) {
            this.hoveredConnection = this.app.connectionManager.findAtPoint(worldPos.x, worldPos.y, this.app.devices);
        } else {
            this.hoveredConnection = null;
        }
    }

    _onMouseUp(e) {
        if (this.isPanning) {
            this.isPanning = false;
            this.canvas.parentElement.classList.remove('panning');
            return;
        }

        if (this.selectionRect) {
            // Select all devices within rectangle
            const r = this.selectionRect;
            for (const [id, device] of this.app.devices) {
                if (Utils.pointInRect(device.getCenterX(), device.getCenterY(), r.x, r.y, r.w, r.h)) {
                    device.selected = true;
                }
            }
            this.selectionRect = null;
        }

        this.isDragging = false;
        this.dragDevice = null;
    }

    _onDoubleClick(e) {
        const pos = this._getMousePos(e);
        const worldPos = this.screenToWorld(pos.x, pos.y);
        const device = this._findDeviceAt(worldPos.x, worldPos.y);

        if (device) {
            this.app.showDeviceConfig(device);
        }
    }

    _onWheel(e) {
        e.preventDefault();
        const pos = this._getMousePos(e);
        const worldBefore = this.screenToWorld(pos.x, pos.y);

        const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
        this.zoom = Utils.clamp(this.zoom * zoomFactor, this.minZoom, this.maxZoom);

        const worldAfter = this.screenToWorld(pos.x, pos.y);
        this.offsetX += (worldAfter.x - worldBefore.x) * this.zoom;
        this.offsetY += (worldAfter.y - worldBefore.y) * this.zoom;

        document.getElementById('zoom-level').textContent = Math.round(this.zoom * 100) + '%';
    }

    _onContextMenu(e) {
        e.preventDefault();
        const pos = this._getMousePos(e);
        const worldPos = this.screenToWorld(pos.x, pos.y);
        const device = this._findDeviceAt(worldPos.x, worldPos.y);

        this.app.showContextMenu(e.clientX, e.clientY, device);
    }

    _findDeviceAt(wx, wy) {
        // Reverse iterate so topmost device is found first
        const entries = Array.from(this.app.devices.entries()).reverse();
        for (const [id, device] of entries) {
            if (device.containsPoint(wx, wy)) return device;
        }
        return null;
    }

    _deselectAll() {
        for (const [id, device] of this.app.devices) {
            device.selected = false;
        }
        for (const conn of this.app.connectionManager.getAll()) {
            conn.selected = false;
        }
    }

    // Port Selector
    _showPortSelector(device, screenPos, role) {
        this._closePortSelector();

        const popup = document.createElement('div');
        popup.className = 'port-selector';
        popup.style.left = screenPos.x + 'px';
        popup.style.top = screenPos.y + 'px';

        const header = document.createElement('div');
        header.className = 'port-selector-header';
        header.textContent = `${device.name} - Select Port`;
        popup.appendChild(header);

        const ports = device.interfaces.filter(i => i.type !== 'console');
        for (const port of ports) {
            const option = document.createElement('div');
            option.className = 'port-option' + (port.isConnected() ? ' disabled' : '');
            option.innerHTML = `
                <span>${port.name}</span>
                <span class="port-status">${port.isConnected() ? 'In Use' : 'Available'}</span>
            `;

            if (!port.isConnected()) {
                option.addEventListener('click', () => {
                    this._closePortSelector();

                    if (role === 'source') {
                        this.connectingFrom = { deviceId: device.id, interfaceName: port.name };
                        Utils.notify(`From ${device.name}:${port.name}. Click target device.`, 'info');
                    } else {
                        // Complete connection
                        this.app.createConnection(
                            this.connectingFrom.deviceId,
                            this.connectingFrom.interfaceName,
                            device.id,
                            port.name
                        );
                        this.connectingFrom = null;
                        this.tempLineEnd = null;
                    }
                });
            }
            popup.appendChild(option);
        }

        document.body.appendChild(popup);
        this.portSelector = popup;

        // Close on click outside
        setTimeout(() => {
            document.addEventListener('mousedown', this._portSelectorClose = (e) => {
                if (!popup.contains(e.target)) {
                    this._closePortSelector();
                }
            }, { once: true });
        }, 50);
    }

    _closePortSelector() {
        if (this.portSelector) {
            this.portSelector.remove();
            this.portSelector = null;
        }
    }

    // Animate packet
    animatePacket(fromDevice, toDevice, protocol, duration = 1000, onComplete = null) {
        this.animatedPackets.push({
            fromX: fromDevice.getCenterX(),
            fromY: fromDevice.getCenterY(),
            toX: toDevice.getCenterX(),
            toY: toDevice.getCenterY(),
            protocol: protocol,
            startTime: Date.now(),
            duration: duration,
            onComplete: onComplete
        });
    }

    // Zoom methods
    zoomIn() {
        this.zoom = Utils.clamp(this.zoom * 1.2, this.minZoom, this.maxZoom);
        document.getElementById('zoom-level').textContent = Math.round(this.zoom * 100) + '%';
    }

    zoomOut() {
        this.zoom = Utils.clamp(this.zoom / 1.2, this.minZoom, this.maxZoom);
        document.getElementById('zoom-level').textContent = Math.round(this.zoom * 100) + '%';
    }

    zoomFit() {
        if (this.app.devices.size === 0) {
            this.offsetX = 0;
            this.offsetY = 0;
            this.zoom = 1;
            return;
        }

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const [id, dev] of this.app.devices) {
            minX = Math.min(minX, dev.x);
            minY = Math.min(minY, dev.y);
            maxX = Math.max(maxX, dev.x + dev.width);
            maxY = Math.max(maxY, dev.y + dev.height);
        }

        const padding = 80;
        const contentW = maxX - minX + padding * 2;
        const contentH = maxY - minY + padding * 2;

        this.zoom = Math.min(this.viewWidth / contentW, this.viewHeight / contentH, 2);
        this.offsetX = (this.viewWidth - contentW * this.zoom) / 2 - minX * this.zoom + padding * this.zoom;
        this.offsetY = (this.viewHeight - contentH * this.zoom) / 2 - minY * this.zoom + padding * this.zoom;

        document.getElementById('zoom-level').textContent = Math.round(this.zoom * 100) + '%';
    }

    // Export canvas as PNG
    exportPNG() {
        const dataURL = this.canvas.toDataURL('image/png');
        const link = document.createElement('a');
        link.download = 'comnet-topology.png';
        link.href = dataURL;
        link.click();
    }
}
