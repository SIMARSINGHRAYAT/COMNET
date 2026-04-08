/* ComNet - Utilities */
const Utils = {
    _counters: {},
    generateId() { return 'dev-' + Math.random().toString(36).slice(2, 11); },
    generateDisplayName(type) {
        if (!this._counters[type]) this._counters[type] = 0;
        this._counters[type]++;
        const names = { router:'Router', switch:'Switch', hub:'Hub', pc:'PC', laptop:'Laptop', server:'Server',
            firewall:'Firewall', cloud:'Cloud', accesspoint:'AP', printer:'Printer', phone:'Phone',
            tv:'TV', tablet:'Tablet', smartphone:'Phone', bridge:'Bridge', iot:'IoT',
            l3switch:'L3Switch', repeater:'Repeater', splitter:'Splitter', wirelessrouter:'WRouter',
            wlc:'WLC', ids:'IDS', modem:'Modem', mcu:'MCU', sbc:'SBC', actuator:'Actuator', sensor:'Sensor' };
        return (names[type] || type) + this._counters[type];
    },
    ipToNumber(ip) { const p = ip.split('.'); return p.reduce((s, o, i) => s + (parseInt(o) << (24 - 8 * i)), 0) >>> 0; },
    numberToIp(n) { return [(n>>>24)&255,(n>>>16)&255,(n>>>8)&255,n&255].join('.'); },
    sameSubnet(a, b, mask) { const m = this.ipToNumber(mask); return (this.ipToNumber(a) & m) === (this.ipToNumber(b) & m); },
    getNetworkAddress(ip, mask) { return this.numberToIp(this.ipToNumber(ip) & this.ipToNumber(mask)); },
    getBroadcastAddress(ip, mask) { const m = this.ipToNumber(mask); return this.numberToIp((this.ipToNumber(ip) & m) | (~m >>> 0)); },
    maskToCIDR(mask) { return this.ipToNumber(mask).toString(2).split('1').length - 1; },
    cidrToMask(cidr) { const m = cidr === 0 ? 0 : (~0 << (32 - cidr)) >>> 0; return this.numberToIp(m); },
    generateMAC() { const h = () => Math.floor(Math.random()*256).toString(16).padStart(2,'0'); return `00:${h()}:${h()}:${h()}:${h()}:${h()}`; },
    clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); },
    escapeHtml(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; },
    throttle(fn, ms) { let t = 0; return (...a) => { const n = Date.now(); if (n - t >= ms) { t = n; fn(...a); } }; },
    debounce(fn, ms) { let id; return (...a) => { clearTimeout(id); id = setTimeout(() => fn(...a), ms); }; },
    formatBytes(b) { if (b < 1024) return b+'B'; if (b < 1048576) return (b/1024).toFixed(1)+'KB'; return (b/1048576).toFixed(1)+'MB'; },
    timestamp() { return new Date().toLocaleTimeString(); },
    notify(msg, type = 'info') {
        const area = document.getElementById('notification-area'); if (!area) return;
        const el = document.createElement('div');
        el.className = 'notification ' + type;
        el.textContent = msg;
        area.appendChild(el);
        setTimeout(() => { el.classList.add('fade-out'); el.addEventListener('animationend', () => el.remove()); }, 3000);
    },
    isValidIP(ip) { if (!ip) return false; const p = ip.split('.'); return p.length === 4 && p.every(o => { const n = parseInt(o); return !isNaN(n) && n >= 0 && n <= 255; }); },
};
