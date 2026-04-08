/* ComNet - Canvas Renderer with pan, zoom, device/connection rendering, animations */

class CanvasRenderer {
    constructor(canvasId, app) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.app = app;
        this.offsetX = 0; this.offsetY = 0; this.scale = 1;
        this.isPanning = false; this.isDragging = false;
        this.lastX = 0; this.lastY = 0;
        this.dragDevice = null; this.dragOX = 0; this.dragOY = 0;
        this.animations = [];
        this.gridEnabled = true;
        this._handlers = {};
        this._resize();
        window.addEventListener('resize', () => this._resize());
        this._bindEvents();
        this._startLoop();
    }

    _resize() {
        const r = this.canvas.parentElement.getBoundingClientRect();
        this.canvas.width = r.width; this.canvas.height = r.height;
    }

    screenToWorld(sx, sy) { return { x:(sx-this.offsetX)/this.scale, y:(sy-this.offsetY)/this.scale }; }
    worldToScreen(wx, wy) { return { x:wx*this.scale+this.offsetX, y:wy*this.scale+this.offsetY }; }

    _bindEvents() {
        const h = (name, fn) => { this._handlers[name] = fn; this.canvas.addEventListener(name, fn); };
        h('mousedown', e => this._onDown(e));
        h('mousemove', e => this._onMove(e));
        h('mouseup', e => this._onUp(e));
        h('dblclick', e => this._onDbl(e));
        h('wheel', e => this._onWheel(e));
        h('contextmenu', e => this._onCtx(e));
    }

    _pos(e) { const r = this.canvas.getBoundingClientRect(); return { sx:e.clientX-r.left, sy:e.clientY-r.top }; }

    _onDown(e) {
        const {sx,sy} = this._pos(e);
        const w = this.screenToWorld(sx, sy);

        if (DrawingTools.isActive()) { DrawingTools.startDraw(w.x, w.y); return; }
        if (this.app.connectionMode) { this.app.handleConnectionClick(w.x, w.y); return; }
        if (this.app.pduMode) { this.app.handlePDUClick(w.x, w.y); return; }

        if (e.button === 1 || (e.button === 0 && e.altKey)) {
            this.isPanning = true; this.lastX = sx; this.lastY = sy;
            this.canvas.style.cursor = 'grab'; return;
        }

        const dev = this._hitDevice(w.x, w.y);
        if (dev) {
            this.isDragging = true; this.dragDevice = dev;
            this.dragOX = w.x - dev.x; this.dragOY = w.y - dev.y;
            this.app.selectDevice(dev); return;
        }

        const conn = this.app.connectionManager.hitTest(w.x, w.y, this.app.devices);
        if (conn) { this.app.selectConnection(conn); return; }

        if (DrawingTools.selectAt(w.x, w.y)) return;
        this.app.deselectAll();
        this.isPanning = true; this.lastX = sx; this.lastY = sy; this.canvas.style.cursor = 'grab';
    }

    _onMove(e) {
        const {sx,sy} = this._pos(e);
        const w = this.screenToWorld(sx, sy);

        if (DrawingTools.drawing) { DrawingTools.moveDraw(w.x, w.y); return; }
        if (this.isPanning) { this.offsetX += sx-this.lastX; this.offsetY += sy-this.lastY; this.lastX=sx; this.lastY=sy; return; }
        if (this.isDragging && this.dragDevice) { this.dragDevice.x = w.x-this.dragOX; this.dragDevice.y = w.y-this.dragOY; return; }

        const el = document.getElementById('coord-display');
        if (el) el.textContent = `${Math.round(w.x)}, ${Math.round(w.y)}`;
    }

    _onUp(e) {
        const {sx,sy} = this._pos(e);
        if (DrawingTools.drawing) DrawingTools.endDraw(...Object.values(this.screenToWorld(sx,sy)));
        this.isDragging = false; this.isPanning = false; this.dragDevice = null;
        this.canvas.style.cursor = 'default';
    }

    _onDbl(e) {
        const w = this.screenToWorld(...Object.values(this._pos(e)));
        const dev = this._hitDevice(w.x, w.y);
        if (dev) DeviceConfigPanel.open(dev);
    }

    _onWheel(e) {
        e.preventDefault();
        const {sx,sy} = this._pos(e);
        const f = e.deltaY < 0 ? 1.1 : 0.9;
        const ns = Utils.clamp(this.scale*f, 0.1, 5);
        const wb = this.screenToWorld(sx, sy);
        this.scale = ns;
        const wa = this.screenToWorld(sx, sy);
        this.offsetX += (wa.x-wb.x)*this.scale;
        this.offsetY += (wa.y-wb.y)*this.scale;
    }

    _onCtx(e) {
        e.preventDefault();
        const w = this.screenToWorld(...Object.values(this._pos(e)));
        const dev = this._hitDevice(w.x, w.y);
        if (dev) this.app.showContextMenu(e.clientX, e.clientY, dev);
    }

    _hitDevice(x, y) {
        for (const [id, d] of this.app.devices) if (d.containsPoint(x, y)) return d;
        return null;
    }

    _startLoop() { const loop = () => { this.render(); requestAnimationFrame(loop); }; loop(); }

    render() {
        const ctx = this.ctx, w = this.canvas.width, h = this.canvas.height;
        // Get theme colors from CSS variables
        const style = getComputedStyle(document.documentElement);
        const bgColor = style.getPropertyValue('--base').trim() || '#1e1e2e';
        const gridColor = style.getPropertyValue('--surface0').trim() || '#313244';
        const textColor = style.getPropertyValue('--text').trim() || '#cdd6f4';
        const subtextColor = style.getPropertyValue('--subtext').trim() || '#a6adc8';
        const overlayColor = style.getPropertyValue('--overlay0').trim() || '#6c7086';

        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, w, h);
        ctx.save();
        ctx.translate(this.offsetX, this.offsetY);
        ctx.scale(this.scale, this.scale);

        // Grid
        if (this.gridEnabled) {
            const gs = 30;
            ctx.strokeStyle = gridColor; ctx.lineWidth = 0.5;
            const tl = this.screenToWorld(0,0), br = this.screenToWorld(w,h);
            const sx = Math.floor(tl.x/gs)*gs, sy = Math.floor(tl.y/gs)*gs;
            ctx.beginPath();
            for (let x=sx;x<br.x;x+=gs){ ctx.moveTo(x,tl.y); ctx.lineTo(x,br.y); }
            for (let y=sy;y<br.y;y+=gs){ ctx.moveTo(tl.x,y); ctx.lineTo(br.x,y); }
            ctx.stroke();
        }

        // Connections
        for (const conn of this.app.connectionManager.toArray()) this._drawConn(ctx, conn, textColor);

        // Devices
        for (const [id, dev] of this.app.devices) this._drawDev(ctx, dev, textColor, subtextColor);

        // Drawing objects
        DrawingTools.render(ctx);

        // Animations (legacy)
        this._renderAnims(ctx);

        // PT-style packet animations
        PacketAnimator.render(ctx);

        ctx.restore();

        // Status
        ctx.fillStyle = overlayColor; ctx.font = '11px monospace';
        ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
        ctx.fillText(`Zoom: ${Math.round(this.scale*100)}%`, w-10, h-5);
    }

    _drawDev(ctx, dev, textColor, subtextColor) {
        const x=dev.x, y=dev.y, w=dev.width, h=dev.height, cx=x+w/2, cy=y+h/2;
        // Shadow
        ctx.fillStyle = 'rgba(0,0,0,0.18)';
        ctx.beginPath(); this._roundRect(ctx, x+3, y+3, w, h, 8); ctx.fill();
        // Body
        ctx.fillStyle = dev.powered ? (dev.color||'#89b4fa') : '#585b70';
        ctx.strokeStyle = dev.selected ? '#f9e2af' : 'rgba(128,128,128,0.3)';
        ctx.lineWidth = dev.selected ? 2.5 : 1;
        ctx.beginPath(); this._roundRect(ctx, x, y, w, h, 8); ctx.fill(); ctx.stroke();
        // Selection glow
        if (dev.selected) {
            ctx.shadowColor = '#f9e2af';
            ctx.shadowBlur = 12;
            ctx.beginPath(); this._roundRect(ctx, x, y, w, h, 8); ctx.stroke();
            ctx.shadowBlur = 0;
        }
        // SVG Icon (fallback to emoji)
        const iconSize = Math.min(w, h) - 10;
        const iconDrawn = DeviceIcons.drawOnCanvas(ctx, dev.type, cx - iconSize/2, cy - iconSize/2 - 2, iconSize);
        if (!iconDrawn) {
            ctx.font = '24px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillStyle = '#1e1e2e';
            ctx.fillText(dev.img||'❓', cx, cy-2);
        }
        // Label
        ctx.font = '10px "Fira Code", monospace';
        ctx.fillStyle = textColor;
        ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        ctx.fillText(dev.name, cx, y+h+4);
        // Power off overlay
        if (!dev.powered) {
            ctx.fillStyle = 'rgba(0,0,0,0.45)';
            ctx.beginPath(); this._roundRect(ctx, x, y, w, h, 8); ctx.fill();
            ctx.fillStyle = '#f38ba8'; ctx.font = '10px sans-serif'; ctx.textAlign='center'; ctx.textBaseline='middle';
            ctx.fillText('OFF', cx, cy);
        }
        // Port count badge
        const cp = dev.getConnectedPorts().length, tp = dev.interfaces.filter(i=>i.type!=='console'&&i.type!=='vlan').length;
        if (tp>0) {
            ctx.font='8px monospace'; ctx.fillStyle=subtextColor; ctx.textAlign='right'; ctx.textBaseline='bottom';
            ctx.fillText(`${cp}/${tp}`, x+w-2, y-2);
        }
        // Link status indicator
        if (dev.powered && cp > 0) {
            ctx.fillStyle = '#a6e3a1'; ctx.beginPath(); ctx.arc(x+w-4, y+4, 3, 0, Math.PI*2); ctx.fill();
        } else if (dev.powered) {
            ctx.fillStyle = '#fab387'; ctx.beginPath(); ctx.arc(x+w-4, y+4, 3, 0, Math.PI*2); ctx.fill();
        }
    }

    _drawConn(ctx, conn, textColor) {
        const dA = this.app.devices.get(conn.deviceA), dB = this.app.devices.get(conn.deviceB);
        if (!dA||!dB) return;
        const ax=dA.getCenterX(), ay=dA.getCenterY(), bx=dB.getCenterX(), by=dB.getCenterY();
        const st = conn.getStyle();
        ctx.strokeStyle = conn.selected ? '#f9e2af' : st.color;
        ctx.lineWidth = conn.selected ? 3 : st.width;
        ctx.setLineDash(st.dash||[]);
        ctx.beginPath(); ctx.moveTo(ax,ay); ctx.lineTo(bx,by); ctx.stroke();
        ctx.setLineDash([]);
        // Status dots
        const ifA=dA.getInterface(conn.interfaceA), ifB=dB.getInterface(conn.interfaceB);
        const dx=bx-ax, dy=by-ay, len=Math.hypot(dx,dy);
        if(len>0){ const nx=dx/len, ny=dy/len;
            ctx.fillStyle=(ifA?.isUp())?'#a6e3a1':'#f38ba8'; ctx.beginPath(); ctx.arc(ax+nx*20,ay+ny*20,3,0,Math.PI*2); ctx.fill();
            ctx.fillStyle=(ifB?.isUp())?'#a6e3a1':'#f38ba8'; ctx.beginPath(); ctx.arc(bx-nx*20,by-ny*20,3,0,Math.PI*2); ctx.fill();
        }
        // Label
        if(conn.selected||this.scale>0.8){ const mx=(ax+bx)/2, my=(ay+by)/2; ctx.font='8px monospace'; ctx.fillStyle='#6c7086'; ctx.textAlign='center'; ctx.textBaseline='bottom'; ctx.fillText(conn.cableType,mx,my-4); }
    }

    _roundRect(ctx, x, y, w, h, r) { ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r); ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath(); }

    animatePacket(from, to, color='#f9e2af', dur=1000) {
        // Route through PacketAnimator if available (preferred)
        if (typeof PacketAnimator !== 'undefined') {
            PacketAnimator.createPDU(from, to, { color, duration:dur, protocol:'', label:'' });
            return;
        }
        this.animations.push({ fx:from.getCenterX(), fy:from.getCenterY(), tx:to.getCenterX(), ty:to.getCenterY(), color, start:Date.now(), dur, progress:0 });
    }

    animatePing(from, to, hops, success) {
        const color = success ? '#a6e3a1' : '#f38ba8';
        if (typeof PacketAnimator !== 'undefined' && hops?.length > 1) {
            PacketAnimator.createMultiHopPDU(hops, this.app, { color, protocol:'ICMP', hopDelay:400 });
            return;
        }
        if (hops?.length > 1) {
            for (let i=0;i<hops.length-1;i++) {
                const a=this.app.devices.get(hops[i].deviceId), b=this.app.devices.get(hops[i+1].deviceId);
                if(a&&b) setTimeout(()=>this.animatePacket(a,b,color,600), i*400);
            }
        } else this.animatePacket(from, to, color, 800);
    }

    _renderAnims(ctx) {
        // Legacy fallback animation (only used if PacketAnimator is unavailable)
        const now = Date.now();
        this.animations = this.animations.filter(a => {
            a.progress = Math.min((now-a.start)/a.dur, 1);
            if (a.progress>=1) return false;
            const x = a.fx+(a.tx-a.fx)*a.progress, y = a.fy+(a.ty-a.fy)*a.progress;
            ctx.fillStyle = a.color; ctx.beginPath(); ctx.arc(x,y,5,0,Math.PI*2); ctx.fill();
            ctx.fillStyle = a.color+'40'; ctx.beginPath(); ctx.arc(x,y,10,0,Math.PI*2); ctx.fill();
            return true;
        });
    }

    resetView() { this.offsetX=0; this.offsetY=0; this.scale=1; }
    fitToContent() {
        const devs = [...this.app.devices.values()]; if(!devs.length) return;
        let x1=Infinity,y1=Infinity,x2=-Infinity,y2=-Infinity;
        devs.forEach(d=>{x1=Math.min(x1,d.x);y1=Math.min(y1,d.y);x2=Math.max(x2,d.x+d.width);y2=Math.max(y2,d.y+d.height);});
        const p=80;
        this.scale = Math.min((this.canvas.width-p*2)/((x2-x1)||1),(this.canvas.height-p*2)/((y2-y1)||1),2);
        this.offsetX = this.canvas.width/2-((x1+x2)/2)*this.scale;
        this.offsetY = this.canvas.height/2-((y1+y2)/2)*this.scale;
    }

    destroy() { for(const[n,fn] of Object.entries(this._handlers)) this.canvas.removeEventListener(n,fn); }
}
