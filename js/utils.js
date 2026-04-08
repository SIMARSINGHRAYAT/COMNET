/* ============================================
   ComNet Simulator - Utility Functions
   ============================================ */

const Utils = {
    // Generate unique ID
    generateId() {
        return 'dev_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 9);
    },

    // Generate short incremental ID for display
    _counters: {},
    generateDisplayName(type) {
        if (!this._counters[type]) this._counters[type] = 0;
        this._counters[type]++;
        const names = {
            'pc': 'PC', 'laptop': 'Laptop', 'server': 'Server', 'printer': 'Printer',
            'smartphone': 'Phone', 'router': 'Router', 'switch': 'Switch', 'hub': 'Hub',
            'bridge': 'Bridge', 'access-point': 'AP', 'firewall': 'Firewall'
        };
        return (names[type] || type) + this._counters[type];
    },

    // Distance between two points
    distance(x1, y1, x2, y2) {
        return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
    },

    // Point-to-line-segment distance
    pointToSegmentDist(px, py, x1, y1, x2, y2) {
        const A = px - x1, B = py - y1, C = x2 - x1, D = y2 - y1;
        const dot = A * C + B * D;
        const lenSq = C * C + D * D;
        let param = lenSq !== 0 ? dot / lenSq : -1;
        let xx, yy;
        if (param < 0) { xx = x1; yy = y1; }
        else if (param > 1) { xx = x2; yy = y2; }
        else { xx = x1 + param * C; yy = y1 + param * D; }
        return this.distance(px, py, xx, yy);
    },

    // Check if point is inside rectangle
    pointInRect(px, py, rx, ry, rw, rh) {
        return px >= rx && px <= rx + rw && py >= ry && py <= ry + rh;
    },

    // Clamp value
    clamp(val, min, max) {
        return Math.min(Math.max(val, min), max);
    },

    // Validate IPv4 address
    isValidIPv4(ip) {
        if (!ip) return false;
        const parts = ip.split('.');
        if (parts.length !== 4) return false;
        return parts.every(p => {
            const n = parseInt(p, 10);
            return !isNaN(n) && n >= 0 && n <= 255 && p === String(n);
        });
    },

    // Validate subnet mask
    isValidSubnet(mask) {
        if (!this.isValidIPv4(mask)) return false;
        const num = this.ipToNumber(mask);
        if (num === 0) return true;
        const inverted = (~num) >>> 0;
        return (inverted & (inverted + 1)) === 0;
    },

    // Convert IP to number
    ipToNumber(ip) {
        return ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0;
    },

    // Convert number to IP
    numberToIp(num) {
        return [(num >>> 24) & 255, (num >>> 16) & 255, (num >>> 8) & 255, num & 255].join('.');
    },

    // Get network address
    getNetworkAddress(ip, mask) {
        return this.numberToIp(this.ipToNumber(ip) & this.ipToNumber(mask));
    },

    // Get broadcast address
    getBroadcastAddress(ip, mask) {
        const net = this.ipToNumber(ip) & this.ipToNumber(mask);
        const wild = (~this.ipToNumber(mask)) >>> 0;
        return this.numberToIp((net | wild) >>> 0);
    },

    // Check if two IPs are on the same subnet
    sameSubnet(ip1, ip2, mask) {
        return this.getNetworkAddress(ip1, mask) === this.getNetworkAddress(ip2, mask);
    },

    // Generate random MAC address
    generateMAC() {
        const hex = '0123456789ABCDEF';
        let mac = '';
        for (let i = 0; i < 6; i++) {
            let byte = '';
            for (let j = 0; j < 2; j++) {
                byte += hex[Math.floor(Math.random() * 16)];
            }
            // First byte: set locally administered bit, clear multicast bit
            if (i === 0) {
                let n = parseInt(byte, 16);
                n = (n & 0xFC) | 0x02; // locally administered, unicast
                byte = n.toString(16).toUpperCase().padStart(2, '0');
            }
            mac += (i > 0 ? ':' : '') + byte;
        }
        return mac;
    },

    // Convert subnet mask to CIDR
    maskToCIDR(mask) {
        const num = this.ipToNumber(mask);
        let bits = 0;
        let n = num;
        while (n) { bits += n & 1; n >>>= 1; }
        return bits;
    },

    // Convert CIDR to subnet mask
    cidrToMask(cidr) {
        const mask = cidr === 0 ? 0 : (~0 << (32 - cidr)) >>> 0;
        return this.numberToIp(mask);
    },

    // Deep clone an object
    deepClone(obj) {
        return JSON.parse(JSON.stringify(obj));
    },

    // Show notification
    notify(message, type = 'info', duration = 3000) {
        const area = document.getElementById('notification-area');
        const note = document.createElement('div');
        note.className = `notification ${type}`;
        const icons = { success: 'check-circle', error: 'exclamation-circle', info: 'info-circle', warning: 'exclamation-triangle' };
        note.innerHTML = `<i class="fas fa-${icons[type] || 'info-circle'}"></i><span>${this.escapeHtml(message)}</span>`;
        area.appendChild(note);
        setTimeout(() => {
            note.style.animation = 'slideOut 0.3s ease forwards';
            setTimeout(() => note.remove(), 300);
        }, duration);
    },

    // Escape HTML
    escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    },

    // Throttle function
    throttle(fn, delay) {
        let lastCall = 0;
        return function (...args) {
            const now = Date.now();
            if (now - lastCall >= delay) {
                lastCall = now;
                return fn.apply(this, args);
            }
        };
    },

    // Debounce function
    debounce(fn, delay) {
        let timer;
        return function (...args) {
            clearTimeout(timer);
            timer = setTimeout(() => fn.apply(this, args), delay);
        };
    },

    // Format bytes
    formatBytes(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    },

    // Get current timestamp string
    timestamp() {
        return new Date().toISOString().substr(11, 12);
    }
};
