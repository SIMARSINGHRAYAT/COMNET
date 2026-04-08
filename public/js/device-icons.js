/* ComNet - PT-style SVG Device Icons */

const DeviceIcons = {
    // Returns SVG markup for each device type - styled like Cisco Packet Tracer icons
    get(type, size = 40) {
        const fn = this._icons[type] || this._icons['generic'];
        return fn(size);
    },

    // Draw SVG icon onto canvas context
    drawOnCanvas(ctx, type, x, y, size = 40) {
        const key = `${type}_${size}`;
        if (!this._cache[key]) {
            const svgStr = this.get(type, size);
            const blob = new Blob([svgStr], { type: 'image/svg+xml' });
            const url = URL.createObjectURL(blob);
            const img = new Image();
            img.src = url;
            this._cache[key] = { img, loaded: false };
            img.onload = () => { this._cache[key].loaded = true; };
        }
        const cached = this._cache[key];
        if (cached.loaded) {
            ctx.drawImage(cached.img, x, y, size, size);
            return true;
        }
        return false;
    },

    _cache: {},

    _icons: {
        router(s) {
            return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 64 64">
                <circle cx="32" cy="32" r="28" fill="#1a5276" stroke="#5dade2" stroke-width="2"/>
                <g fill="none" stroke="#5dade2" stroke-width="2.5" stroke-linecap="round">
                    <line x1="32" y1="14" x2="32" y2="50"/>
                    <line x1="14" y1="32" x2="50" y2="32"/>
                    <line x1="19" y1="19" x2="45" y2="45"/>
                    <line x1="45" y1="19" x2="19" y2="45"/>
                </g>
                <circle cx="32" cy="32" r="6" fill="#5dade2"/>
                <circle cx="32" cy="14" r="3" fill="#5dade2"/>
                <circle cx="32" cy="50" r="3" fill="#5dade2"/>
                <circle cx="14" cy="32" r="3" fill="#5dade2"/>
                <circle cx="50" cy="32" r="3" fill="#5dade2"/>
            </svg>`;
        },
        switch(s) {
            return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 64 64">
                <rect x="4" y="18" width="56" height="28" rx="4" fill="#1b4f72" stroke="#3498db" stroke-width="2"/>
                <g fill="#3498db">
                    <rect x="10" y="24" width="6" height="8" rx="1"/>
                    <rect x="19" y="24" width="6" height="8" rx="1"/>
                    <rect x="28" y="24" width="6" height="8" rx="1"/>
                    <rect x="37" y="24" width="6" height="8" rx="1"/>
                    <rect x="46" y="24" width="6" height="8" rx="1"/>
                </g>
                <g fill="#2ecc71">
                    <circle cx="13" cy="38" r="2"/>
                    <circle cx="22" cy="38" r="2"/>
                    <circle cx="31" cy="38" r="2"/>
                    <circle cx="40" cy="38" r="2"/>
                    <circle cx="49" cy="38" r="2"/>
                </g>
                <line x1="10" y1="22" x2="54" y2="22" stroke="#3498db" stroke-width="1" opacity="0.5"/>
            </svg>`;
        },
        l3switch(s) {
            return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 64 64">
                <rect x="4" y="18" width="56" height="28" rx="4" fill="#0e6655" stroke="#1abc9c" stroke-width="2"/>
                <g fill="#1abc9c">
                    <rect x="10" y="24" width="6" height="8" rx="1"/>
                    <rect x="19" y="24" width="6" height="8" rx="1"/>
                    <rect x="28" y="24" width="6" height="8" rx="1"/>
                    <rect x="37" y="24" width="6" height="8" rx="1"/>
                    <rect x="46" y="24" width="6" height="8" rx="1"/>
                </g>
                <text x="32" y="42" text-anchor="middle" fill="#1abc9c" font-size="8" font-weight="bold" font-family="sans-serif">L3</text>
            </svg>`;
        },
        hub(s) {
            return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 64 64">
                <rect x="8" y="22" width="48" height="20" rx="3" fill="#4a4a4a" stroke="#95a5a6" stroke-width="2"/>
                <g fill="#f39c12">
                    <rect x="14" y="28" width="5" height="6" rx="1"/>
                    <rect x="23" y="28" width="5" height="6" rx="1"/>
                    <rect x="32" y="28" width="5" height="6" rx="1"/>
                    <rect x="41" y="28" width="5" height="6" rx="1"/>
                </g>
            </svg>`;
        },
        pc(s) {
            return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 64 64">
                <rect x="10" y="8" width="44" height="32" rx="3" fill="#2c3e50" stroke="#7f8c8d" stroke-width="1.5"/>
                <rect x="14" y="12" width="36" height="24" rx="1" fill="#1a73e8" opacity="0.8"/>
                <rect x="24" y="42" width="16" height="4" fill="#7f8c8d"/>
                <rect x="18" y="46" width="28" height="3" rx="1.5" fill="#95a5a6"/>
                <rect x="12" y="52" width="40" height="5" rx="2" fill="#2c3e50" stroke="#7f8c8d" stroke-width="1"/>
            </svg>`;
        },
        laptop(s) {
            return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 64 64">
                <rect x="12" y="12" width="40" height="28" rx="3" fill="#2c3e50" stroke="#7f8c8d" stroke-width="1.5"/>
                <rect x="15" y="15" width="34" height="22" rx="1" fill="#1a73e8" opacity="0.7"/>
                <path d="M6,42 L12,42 L12,40 L52,40 L52,42 L58,42 L58,46 Q58,48 56,48 L8,48 Q6,48 6,46 Z" fill="#34495e" stroke="#7f8c8d" stroke-width="1"/>
            </svg>`;
        },
        server(s) {
            return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 64 64">
                <rect x="14" y="6" width="36" height="52" rx="3" fill="#2c3e50" stroke="#f39c12" stroke-width="1.5"/>
                <rect x="18" y="10" width="28" height="12" rx="2" fill="#34495e" stroke="#f39c12" stroke-width="0.75"/>
                <rect x="18" y="26" width="28" height="12" rx="2" fill="#34495e" stroke="#f39c12" stroke-width="0.75"/>
                <rect x="18" y="42" width="28" height="12" rx="2" fill="#34495e" stroke="#f39c12" stroke-width="0.75"/>
                <circle cx="22" cy="16" r="2" fill="#2ecc71"/>
                <circle cx="22" cy="32" r="2" fill="#2ecc71"/>
                <circle cx="22" cy="48" r="2" fill="#f39c12"/>
                <line x1="28" y1="16" x2="42" y2="16" stroke="#7f8c8d" stroke-width="1.5" stroke-linecap="round"/>
                <line x1="28" y1="32" x2="42" y2="32" stroke="#7f8c8d" stroke-width="1.5" stroke-linecap="round"/>
                <line x1="28" y1="48" x2="42" y2="48" stroke="#7f8c8d" stroke-width="1.5" stroke-linecap="round"/>
            </svg>`;
        },
        firewall(s) {
            return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 64 64">
                <rect x="6" y="14" width="52" height="36" rx="4" fill="#922b21" stroke="#e74c3c" stroke-width="2"/>
                <rect x="6" y="14" width="52" height="10" rx="4" fill="#c0392b"/>
                <text x="32" y="22" text-anchor="middle" fill="#fff" font-size="8" font-weight="bold" font-family="sans-serif">ASA</text>
                <g fill="#e74c3c" opacity="0.8">
                    <rect x="12" y="30" width="6" height="6" rx="1"/>
                    <rect x="21" y="30" width="6" height="6" rx="1"/>
                    <rect x="30" y="30" width="6" height="6" rx="1"/>
                    <rect x="39" y="30" width="6" height="6" rx="1"/>
                    <rect x="12" y="40" width="6" height="6" rx="1"/>
                    <rect x="21" y="40" width="6" height="6" rx="1"/>
                    <rect x="30" y="40" width="6" height="6" rx="1"/>
                    <rect x="39" y="40" width="6" height="6" rx="1"/>
                </g>
            </svg>`;
        },
        accesspoint(s) {
            return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 64 64">
                <path d="M32,44 L22,52 L42,52 Z" fill="#7d3c98" stroke="#a569bd" stroke-width="1.5"/>
                <circle cx="32" cy="38" r="6" fill="#7d3c98" stroke="#a569bd" stroke-width="1.5"/>
                <path d="M20,30 Q32,10 44,30" fill="none" stroke="#a569bd" stroke-width="2" stroke-linecap="round"/>
                <path d="M14,34 Q32,6 50,34" fill="none" stroke="#a569bd" stroke-width="1.5" stroke-linecap="round" opacity="0.6"/>
                <path d="M8,38 Q32,2 56,38" fill="none" stroke="#a569bd" stroke-width="1" stroke-linecap="round" opacity="0.3"/>
            </svg>`;
        },
        wirelessrouter(s) {
            return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 64 64">
                <rect x="8" y="30" width="48" height="22" rx="4" fill="#1a5276" stroke="#5dade2" stroke-width="1.5"/>
                <g fill="#5dade2">
                    <rect x="14" y="36" width="5" height="6" rx="1"/>
                    <rect x="22" y="36" width="5" height="6" rx="1"/>
                    <rect x="30" y="36" width="5" height="6" rx="1"/>
                    <rect x="38" y="36" width="5" height="6" rx="1"/>
                    <rect x="46" y="36" width="5" height="6" rx="1"/>
                </g>
                <line x1="32" y1="30" x2="32" y2="22" stroke="#a569bd" stroke-width="2"/>
                <path d="M24,20 Q32,8 40,20" fill="none" stroke="#a569bd" stroke-width="2" stroke-linecap="round"/>
                <path d="M18,24 Q32,4 46,24" fill="none" stroke="#a569bd" stroke-width="1.5" stroke-linecap="round" opacity="0.5"/>
            </svg>`;
        },
        cloud(s) {
            return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 64 64">
                <path d="M16,42 Q6,42 6,34 Q6,26 16,26 Q16,16 26,14 Q36,12 40,18 Q42,14 48,14 Q58,14 58,24 Q62,24 62,32 Q62,42 52,42 Z" fill="#2471a3" stroke="#5dade2" stroke-width="2"/>
            </svg>`;
        },
        printer(s) {
            return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 64 64">
                <rect x="16" y="8" width="32" height="14" rx="2" fill="#ecf0f1" stroke="#95a5a6" stroke-width="1"/>
                <rect x="10" y="22" width="44" height="22" rx="3" fill="#7f8c8d" stroke="#95a5a6" stroke-width="1.5"/>
                <rect x="16" y="44" width="32" height="12" rx="2" fill="#ecf0f1" stroke="#95a5a6" stroke-width="1"/>
                <circle cx="48" cy="30" r="2" fill="#2ecc71"/>
            </svg>`;
        },
        phone(s) {
            return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 64 64">
                <rect x="16" y="8" width="32" height="48" rx="4" fill="#2c3e50" stroke="#3498db" stroke-width="1.5"/>
                <rect x="20" y="14" width="24" height="20" rx="1" fill="#1a73e8" opacity="0.6"/>
                <g fill="#95a5a6">
                    <rect x="22" y="38" width="6" height="4" rx="1"/>
                    <rect x="30" y="38" width="6" height="4" rx="1"/>
                    <rect x="38" y="38" width="6" height="4" rx="1"/>
                    <rect x="22" y="44" width="6" height="4" rx="1"/>
                    <rect x="30" y="44" width="6" height="4" rx="1"/>
                    <rect x="38" y="44" width="6" height="4" rx="1"/>
                </g>
            </svg>`;
        },
        tv(s) {
            return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 64 64">
                <rect x="6" y="10" width="52" height="36" rx="3" fill="#2c3e50" stroke="#7f8c8d" stroke-width="1.5"/>
                <rect x="9" y="13" width="46" height="30" rx="1" fill="#2980b9" opacity="0.7"/>
                <rect x="22" y="48" width="20" height="3" rx="1.5" fill="#7f8c8d"/>
                <rect x="16" y="51" width="32" height="3" rx="1.5" fill="#95a5a6"/>
            </svg>`;
        },
        tablet(s) {
            return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 64 64">
                <rect x="12" y="6" width="40" height="52" rx="4" fill="#2c3e50" stroke="#7f8c8d" stroke-width="1.5"/>
                <rect x="15" y="12" width="34" height="40" rx="2" fill="#2980b9" opacity="0.6"/>
                <circle cx="32" cy="56" r="2" fill="#7f8c8d"/>
            </svg>`;
        },
        smartphone(s) {
            return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 64 64">
                <rect x="18" y="4" width="28" height="56" rx="4" fill="#2c3e50" stroke="#7f8c8d" stroke-width="1.5"/>
                <rect x="20" y="10" width="24" height="42" rx="1" fill="#2980b9" opacity="0.6"/>
                <circle cx="32" cy="56" r="2.5" fill="#7f8c8d"/>
                <rect x="28" y="6" width="8" height="2" rx="1" fill="#7f8c8d"/>
            </svg>`;
        },
        modem(s) {
            return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 64 64">
                <rect x="8" y="20" width="48" height="24" rx="4" fill="#d68910" stroke="#f39c12" stroke-width="1.5"/>
                <g fill="#f39c12">
                    <circle cx="18" cy="32" r="3"/>
                    <circle cx="28" cy="32" r="3"/>
                    <circle cx="38" cy="32" r="3"/>
                    <circle cx="48" cy="32" r="3"/>
                </g>
                <line x1="30" y1="20" x2="28" y2="10" stroke="#f39c12" stroke-width="2" stroke-linecap="round"/>
                <circle cx="28" cy="8" r="2" fill="#f39c12"/>
            </svg>`;
        },
        bridge(s) {
            return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 64 64">
                <rect x="6" y="22" width="52" height="20" rx="3" fill="#1b4f72" stroke="#3498db" stroke-width="1.5"/>
                <rect x="12" y="28" width="8" height="8" rx="1" fill="#3498db"/>
                <rect x="44" y="28" width="8" height="8" rx="1" fill="#3498db"/>
                <line x1="20" y1="32" x2="44" y2="32" stroke="#3498db" stroke-width="2" stroke-dasharray="4,2"/>
            </svg>`;
        },
        repeater(s) {
            return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 64 64">
                <rect x="10" y="24" width="44" height="16" rx="3" fill="#4a4a4a" stroke="#95a5a6" stroke-width="1.5"/>
                <polygon points="8,32 16,26 16,38" fill="#95a5a6"/>
                <polygon points="56,32 48,26 48,38" fill="#95a5a6"/>
            </svg>`;
        },
        splitter(s) {
            return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 64 64">
                <rect x="14" y="22" width="36" height="20" rx="3" fill="#4a4a4a" stroke="#95a5a6" stroke-width="1.5"/>
                <line x1="14" y1="32" x2="6" y2="32" stroke="#95a5a6" stroke-width="2"/>
                <line x1="50" y1="28" x2="58" y2="22" stroke="#95a5a6" stroke-width="2"/>
                <line x1="50" y1="36" x2="58" y2="42" stroke="#95a5a6" stroke-width="2"/>
            </svg>`;
        },
        wlc(s) {
            return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 64 64">
                <rect x="8" y="22" width="48" height="24" rx="4" fill="#6c3483" stroke="#a569bd" stroke-width="1.5"/>
                <text x="32" y="38" text-anchor="middle" fill="#a569bd" font-size="10" font-weight="bold" font-family="sans-serif">WLC</text>
                <circle cx="16" cy="30" r="2" fill="#2ecc71"/>
                <circle cx="48" cy="30" r="2" fill="#2ecc71"/>
            </svg>`;
        },
        ids(s) {
            return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 64 64">
                <rect x="8" y="16" width="48" height="32" rx="4" fill="#922b21" stroke="#e74c3c" stroke-width="1.5"/>
                <circle cx="32" cy="32" r="10" fill="none" stroke="#e74c3c" stroke-width="2"/>
                <line x1="32" y1="22" x2="32" y2="32" stroke="#e74c3c" stroke-width="2" stroke-linecap="round"/>
                <circle cx="32" cy="36" r="2" fill="#e74c3c"/>
            </svg>`;
        },
        sensor(s) {
            return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 64 64">
                <circle cx="32" cy="32" r="22" fill="#0e6655" stroke="#1abc9c" stroke-width="2"/>
                <circle cx="32" cy="32" r="12" fill="none" stroke="#1abc9c" stroke-width="1.5"/>
                <circle cx="32" cy="32" r="4" fill="#1abc9c"/>
                <line x1="32" y1="10" x2="32" y2="6" stroke="#1abc9c" stroke-width="2" stroke-linecap="round"/>
            </svg>`;
        },
        actuator(s) {
            return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 64 64">
                <circle cx="32" cy="32" r="22" fill="#0e6655" stroke="#1abc9c" stroke-width="2"/>
                <path d="M22,32 L42,32 M32,22 L32,42 M25,25 L39,39 M39,25 L25,39" stroke="#1abc9c" stroke-width="2" stroke-linecap="round"/>
            </svg>`;
        },
        mcu(s) {
            return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 64 64">
                <rect x="16" y="16" width="32" height="32" rx="2" fill="#0e6655" stroke="#1abc9c" stroke-width="1.5"/>
                <g stroke="#1abc9c" stroke-width="1.5">
                    <line x1="22" y1="16" x2="22" y2="10"/>
                    <line x1="32" y1="16" x2="32" y2="10"/>
                    <line x1="42" y1="16" x2="42" y2="10"/>
                    <line x1="22" y1="48" x2="22" y2="54"/>
                    <line x1="32" y1="48" x2="32" y2="54"/>
                    <line x1="42" y1="48" x2="42" y2="54"/>
                    <line x1="16" y1="26" x2="10" y2="26"/>
                    <line x1="16" y1="38" x2="10" y2="38"/>
                    <line x1="48" y1="26" x2="54" y2="26"/>
                    <line x1="48" y1="38" x2="54" y2="38"/>
                </g>
                <circle cx="32" cy="32" r="6" fill="#1abc9c" opacity="0.5"/>
            </svg>`;
        },
        sbc(s) {
            return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 64 64">
                <rect x="10" y="14" width="44" height="36" rx="3" fill="#0e6655" stroke="#1abc9c" stroke-width="1.5"/>
                <rect x="14" y="18" width="16" height="10" rx="1" fill="#1abc9c" opacity="0.4"/>
                <g fill="#1abc9c">
                    <rect x="36" y="18" width="4" height="4" rx="0.5"/>
                    <rect x="42" y="18" width="4" height="4" rx="0.5"/>
                    <rect x="36" y="24" width="4" height="4" rx="0.5"/>
                    <rect x="42" y="24" width="4" height="4" rx="0.5"/>
                </g>
                <g fill="#f39c12">
                    <rect x="14" y="34" width="8" height="4" rx="1"/>
                    <rect x="14" y="40" width="8" height="4" rx="1"/>
                </g>
                <circle cx="40" cy="42" r="3" fill="#2ecc71"/>
            </svg>`;
        },
        generic(s) {
            return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 64 64">
                <rect x="12" y="12" width="40" height="40" rx="4" fill="#34495e" stroke="#7f8c8d" stroke-width="2"/>
                <text x="32" y="38" text-anchor="middle" fill="#7f8c8d" font-size="16" font-family="sans-serif">?</text>
            </svg>`;
        },
    },
};
