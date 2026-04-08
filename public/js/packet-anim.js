/* ComNet - PT-style Packet / PDU Animation System */

const PacketAnimator = {
    packets: [],
    _nextId: 0,

    // PDU states matching Cisco PT
    PDU_STATES: {
        CREATED: 'created',
        IN_TRANSIT: 'in-transit',
        ACCEPTED: 'accepted',
        DROPPED: 'dropped',
        FORWARDED: 'forwarded',
        BUFFERED: 'buffered',
        COLLIDED: 'collided',
    },

    PDU_COLORS: {
        'created':    '#89b4fa',
        'in-transit': '#89b4fa',
        'accepted':   '#a6e3a1',
        'dropped':    '#f38ba8',
        'forwarded':  '#f9e2af',
        'buffered':   '#fab387',
        'collided':   '#f38ba8',
    },

    // Create an envelope-style PDU animation between two devices
    createPDU(srcDevice, dstDevice, options = {}) {
        const pdu = {
            id: this._nextId++,
            srcX: srcDevice.getCenterX(),
            srcY: srcDevice.getCenterY(),
            dstX: dstDevice.getCenterX(),
            dstY: dstDevice.getCenterY(),
            x: srcDevice.getCenterX(),
            y: srcDevice.getCenterY(),
            state: this.PDU_STATES.CREATED,
            protocol: options.protocol || 'ICMP',
            color: options.color || this.PDU_COLORS['in-transit'],
            size: options.size || 8,
            startTime: Date.now(),
            duration: options.duration || 800,
            progress: 0,
            label: options.label || '',
            trail: [],
            maxTrail: 8,
            onComplete: options.onComplete || null,
            // Envelope shape metadata
            envelope: true,
        };
        this.packets.push(pdu);
        return pdu;
    },

    // Multi-hop animation: animate a packet across multiple devices
    createMultiHopPDU(hops, app, options = {}) {
        if (!hops || hops.length < 2) return;
        const color = options.color || '#89b4fa';
        const protocol = options.protocol || 'ICMP';
        const hopDelay = options.hopDelay || 400;

        for (let i = 0; i < hops.length - 1; i++) {
            const srcDev = app.devices.get(hops[i].deviceId || hops[i]);
            const dstDev = app.devices.get(hops[i + 1].deviceId || hops[i + 1]);
            if (!srcDev || !dstDev) continue;

            setTimeout(() => {
                this.createPDU(srcDev, dstDev, {
                    protocol,
                    color,
                    duration: hopDelay * 1.5,
                    label: protocol,
                });
            }, i * hopDelay);
        }
    },

    // Create broadcast animation (flood from one device to all connected)
    createBroadcast(srcDevice, connectedDevices, options = {}) {
        const color = options.color || '#f9e2af';
        connectedDevices.forEach((dev, i) => {
            setTimeout(() => {
                this.createPDU(srcDevice, dev, {
                    protocol: options.protocol || 'ARP',
                    color,
                    duration: 600,
                    label: 'BC',
                });
            }, i * 50);
        });
    },

    render(ctx) {
        const now = Date.now();
        this.packets = this.packets.filter(pdu => {
            pdu.progress = Math.min((now - pdu.startTime) / pdu.duration, 1);

            // Easing function (ease-in-out)
            const t = pdu.progress;
            const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

            pdu.x = pdu.srcX + (pdu.dstX - pdu.srcX) * eased;
            pdu.y = pdu.srcY + (pdu.dstY - pdu.srcY) * eased;

            // Trail
            pdu.trail.push({ x: pdu.x, y: pdu.y });
            if (pdu.trail.length > pdu.maxTrail) pdu.trail.shift();

            // Draw trail
            if (pdu.trail.length > 1) {
                ctx.beginPath();
                ctx.moveTo(pdu.trail[0].x, pdu.trail[0].y);
                for (let i = 1; i < pdu.trail.length; i++) {
                    ctx.lineTo(pdu.trail[i].x, pdu.trail[i].y);
                }
                ctx.strokeStyle = pdu.color + '40';
                ctx.lineWidth = 2;
                ctx.stroke();
            }

            // Draw envelope shape
            if (pdu.envelope) {
                this._drawEnvelope(ctx, pdu.x, pdu.y, pdu.size, pdu.color, pdu.progress);
            } else {
                // Simple circle
                ctx.fillStyle = pdu.color;
                ctx.beginPath();
                ctx.arc(pdu.x, pdu.y, pdu.size, 0, Math.PI * 2);
                ctx.fill();
            }

            // Label
            if (pdu.label && pdu.size >= 6) {
                ctx.fillStyle = '#1e1e2e';
                ctx.font = '7px monospace';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(pdu.label, pdu.x, pdu.y);
            }

            // Glow effect
            const glow = ctx.createRadialGradient(pdu.x, pdu.y, 0, pdu.x, pdu.y, pdu.size * 2.5);
            glow.addColorStop(0, pdu.color + '30');
            glow.addColorStop(1, pdu.color + '00');
            ctx.fillStyle = glow;
            ctx.beginPath();
            ctx.arc(pdu.x, pdu.y, pdu.size * 2.5, 0, Math.PI * 2);
            ctx.fill();

            if (pdu.progress >= 1) {
                // Completion effect
                this._drawCompletionEffect(ctx, pdu.x, pdu.y, pdu.color, pdu.state);
                if (pdu.onComplete) pdu.onComplete(pdu);
                return false;
            }
            return true;
        });
    },

    _drawEnvelope(ctx, x, y, size, color, progress) {
        const w = size * 1.8;
        const h = size * 1.2;

        ctx.save();
        ctx.translate(x, y);

        // Envelope body
        ctx.fillStyle = color;
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.rect(-w / 2, -h / 2, w, h);
        ctx.fill();
        ctx.stroke();

        // Envelope flap
        ctx.fillStyle = color + 'CC';
        ctx.beginPath();
        ctx.moveTo(-w / 2, -h / 2);
        ctx.lineTo(0, 0);
        ctx.lineTo(w / 2, -h / 2);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Inner darker line
        ctx.strokeStyle = '#1e1e2e40';
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(-w / 2, -h / 2);
        ctx.lineTo(0, 0);
        ctx.lineTo(w / 2, -h / 2);
        ctx.stroke();

        ctx.restore();
    },

    _drawCompletionEffect(ctx, x, y, color, state) {
        // Ring burst effect on completion
        const r = 12;
        ctx.strokeStyle = color + '60';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.stroke();

        if (state === 'dropped') {
            // X mark for dropped
            ctx.strokeStyle = '#f38ba8';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(x - 6, y - 6);
            ctx.lineTo(x + 6, y + 6);
            ctx.moveTo(x + 6, y - 6);
            ctx.lineTo(x - 6, y + 6);
            ctx.stroke();
        } else if (state === 'accepted') {
            // Checkmark for accepted
            ctx.strokeStyle = '#a6e3a1';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(x - 5, y);
            ctx.lineTo(x - 1, y + 4);
            ctx.lineTo(x + 6, y - 4);
            ctx.stroke();
        }
    },

    clear() { this.packets = []; },
};
