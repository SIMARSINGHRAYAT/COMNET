/* ComNet - Device Catalog (PT-style bottom toolbar data) */
const DeviceCatalog = {
    categories: [
        { id:'network-devices', name:'Network Devices', icon:'fa-server', subcategories:[
            { id:'routers', name:'Routers', icon:'fa-project-diagram', devices:[
                { model:'4331', type:'router', label:'4331', desc:'Cisco ISR 4331', img:'🔲', color:'#89b4fa' },
                { model:'4321', type:'router', label:'4321', desc:'Cisco ISR 4321', img:'🔲', color:'#89b4fa' },
                { model:'2911', type:'router', label:'2911', desc:'Cisco 2911', img:'🔲', color:'#89b4fa' },
                { model:'2901', type:'router', label:'2901', desc:'Cisco 2901', img:'🔲', color:'#89b4fa' },
                { model:'2811', type:'router', label:'2811', desc:'Cisco 2811', img:'🔲', color:'#89b4fa' },
                { model:'1941', type:'router', label:'1941', desc:'Cisco 1941', img:'🔲', color:'#89b4fa' },
                { model:'PT-Router', type:'router', label:'PT-Router', desc:'Generic Router', img:'🔲', color:'#89b4fa' },
            ]},
            { id:'switches', name:'Switches', icon:'fa-exchange-alt', devices:[
                { model:'2960-24TT', type:'switch', label:'2960-24', desc:'Catalyst 2960-24TT', img:'🟦', color:'#74c7ec' },
                { model:'2960-48TT', type:'switch', label:'2960-48', desc:'Catalyst 2960-48TT', img:'🟦', color:'#74c7ec' },
                { model:'3560-24PS', type:'switch', label:'3560', desc:'Catalyst 3560-24PS', img:'🟦', color:'#74c7ec' },
                { model:'3650-24PS', type:'l3switch', label:'3650', desc:'Catalyst 3650 L3', img:'🟦', color:'#94e2d5' },
                { model:'PT-Switch', type:'switch', label:'PT-Switch', desc:'Generic Switch', img:'🟦', color:'#74c7ec' },
                { model:'PT-Bridge', type:'bridge', label:'Bridge', desc:'Bridge PT', img:'🟦', color:'#74c7ec' },
            ]},
            { id:'hubs', name:'Hubs', icon:'fa-circle-notch', devices:[
                { model:'PT-Hub', type:'hub', label:'Hub', desc:'Hub PT', img:'⬜', color:'#a6adc8' },
                { model:'PT-Repeater', type:'repeater', label:'Repeater', desc:'Repeater PT', img:'⬜', color:'#a6adc8' },
                { model:'Coaxial-Splitter', type:'splitter', label:'Splitter', desc:'Coax Splitter', img:'⬜', color:'#a6adc8' },
            ]},
            { id:'wireless', name:'Wireless', icon:'fa-wifi', devices:[
                { model:'WRT300N', type:'wirelessrouter', label:'WRT300N', desc:'Linksys WRT300N', img:'📶', color:'#cba6f7' },
                { model:'AccessPoint-PT', type:'accesspoint', label:'AP', desc:'Access Point PT', img:'📶', color:'#cba6f7' },
                { model:'WLC-PT', type:'wlc', label:'WLC', desc:'Wireless LAN Controller', img:'📶', color:'#cba6f7' },
            ]},
            { id:'security', name:'Security', icon:'fa-shield-alt', devices:[
                { model:'ASA5506-X', type:'firewall', label:'ASA 5506', desc:'Cisco ASA 5506-X', img:'🛡️', color:'#f38ba8' },
                { model:'PT-Firewall', type:'firewall', label:'Firewall', desc:'Firewall PT', img:'🛡️', color:'#f38ba8' },
                { model:'IDS-PT', type:'ids', label:'IDS', desc:'Intrusion Detection System', img:'🔍', color:'#f38ba8' },
            ]},
            { id:'wan', name:'WAN Emulation', icon:'fa-cloud', devices:[
                { model:'Cloud-PT', type:'cloud', label:'Cloud', desc:'Cloud PT', img:'☁️', color:'#89b4fa' },
                { model:'DSL-Modem', type:'modem', label:'DSL Modem', desc:'DSL Modem PT', img:'📡', color:'#fab387' },
                { model:'Cable-Modem', type:'modem', label:'Cable Modem', desc:'Cable Modem PT', img:'📡', color:'#fab387' },
            ]},
        ]},
        { id:'end-devices', name:'End Devices', icon:'fa-desktop', subcategories:[
            { id:'common', name:'End Devices', icon:'fa-laptop', devices:[
                { model:'PC-PT', type:'pc', label:'PC', desc:'PC PT', img:'🖥️', color:'#a6e3a1' },
                { model:'Laptop-PT', type:'laptop', label:'Laptop', desc:'Laptop PT', img:'💻', color:'#a6e3a1' },
                { model:'Server-PT', type:'server', label:'Server', desc:'Server PT', img:'🗄️', color:'#f9e2af' },
                { model:'Printer-PT', type:'printer', label:'Printer', desc:'Printer', img:'🖨️', color:'#a6adc8' },
                { model:'IP-Phone', type:'phone', label:'IP Phone', desc:'IP Phone', img:'☎️', color:'#74c7ec' },
                { model:'Smart-TV', type:'tv', label:'Smart TV', desc:'Smart TV', img:'📺', color:'#cba6f7' },
                { model:'Tablet-PT', type:'tablet', label:'Tablet', desc:'Tablet PT', img:'📱', color:'#a6e3a1' },
                { model:'Smartphone-PT', type:'smartphone', label:'Phone', desc:'Smartphone', img:'📱', color:'#a6e3a1' },
            ]},
            { id:'iot', name:'IoT / Smart Home', icon:'fa-home', devices:[
                { model:'IoT-Sensor', type:'sensor', label:'Sensor', desc:'IoT Sensor', img:'🌡️', color:'#94e2d5' },
                { model:'IoT-Actuator', type:'actuator', label:'Actuator', desc:'IoT Actuator', img:'⚙️', color:'#94e2d5' },
                { model:'MCU-PT', type:'mcu', label:'MCU', desc:'Microcontroller', img:'🔌', color:'#94e2d5' },
                { model:'SBC-PT', type:'sbc', label:'SBC', desc:'Single Board Computer', img:'🖲️', color:'#94e2d5' },
            ]},
        ]},
        { id:'connections', name:'Connections', icon:'fa-link', subcategories:[
            { id:'cables', name:'Cables', icon:'fa-ethernet', devices:[
                { model:'auto', type:'cable', cableType:'auto', label:'Auto', desc:'Automatically choose cable', img:'⚡', color:'#f9e2af' },
                { model:'copper-straight', type:'cable', cableType:'copper-straight', label:'Copper Straight', desc:'Copper Straight-Through', img:'━', color:'#a6e3a1' },
                { model:'copper-cross', type:'cable', cableType:'copper-cross', label:'Copper Cross', desc:'Copper Crossover', img:'╳', color:'#f9e2af' },
                { model:'fiber', type:'cable', cableType:'fiber', label:'Fiber', desc:'Fiber Optic', img:'〰', color:'#cba6f7' },
                { model:'serial-dce', type:'cable', cableType:'serial-dce', label:'Serial DCE', desc:'Serial DCE Cable', img:'⟿', color:'#fab387' },
                { model:'serial-dte', type:'cable', cableType:'serial-dte', label:'Serial DTE', desc:'Serial DTE Cable', img:'⟿', color:'#fab387' },
                { model:'console', type:'cable', cableType:'console', label:'Console', desc:'Console Cable', img:'🔗', color:'#74c7ec' },
                { model:'coaxial', type:'cable', cableType:'coaxial', label:'Coaxial', desc:'Coaxial Cable', img:'◯', color:'#a6adc8' },
                { model:'phone', type:'cable', cableType:'phone', label:'Phone Line', desc:'Telephone Cable', img:'📞', color:'#89b4fa' },
            ]},
        ]},
    ],

    cableStyles: {
        'auto':            { color:'#f9e2af', width:2, dash:[] },
        'copper-straight': { color:'#a6e3a1', width:2, dash:[] },
        'copper-cross':    { color:'#f9e2af', width:2, dash:[8,4] },
        'fiber':           { color:'#cba6f7', width:2.5, dash:[] },
        'serial-dce':      { color:'#fab387', width:2, dash:[12,4] },
        'serial-dte':      { color:'#fab387', width:2, dash:[4,4] },
        'console':         { color:'#74c7ec', width:1.5, dash:[4,2] },
        'coaxial':         { color:'#a6adc8', width:3, dash:[] },
        'phone':           { color:'#89b4fa', width:1.5, dash:[6,3] },
    },

    drawingTools: [
        { id:'select', label:'Select', icon:'fa-mouse-pointer' },
        { id:'text', label:'Text', icon:'fa-font' },
        { id:'line', label:'Line', icon:'fa-minus' },
        { id:'rectangle', label:'Rectangle', icon:'fa-square' },
        { id:'ellipse', label:'Ellipse', icon:'fa-circle' },
        { id:'freehand', label:'Freehand', icon:'fa-pen' },
    ],

    pduTools: [
        { id:'simple-pdu', label:'Simple PDU', icon:'fa-envelope', desc:'Click source then destination for simple ICMP ping' },
        { id:'complex-pdu', label:'Complex PDU', icon:'fa-envelope-open-text', desc:'Create complex PDU with protocol/port options' },
    ],

    autoDetectCable(devA, devB) {
        const tA = devA.type, tB = devB.type;
        const both = [tA, tB].sort().join(',');
        if (both.includes('router') && both.includes('router')) return 'serial-dce';
        if (tA === tB && (tA === 'switch' || tA === 'hub' || tA === 'pc')) return 'copper-cross';
        return 'copper-straight';
    },

    findModel(model) {
        for (const cat of this.categories)
            for (const sub of cat.subcategories)
                for (const d of sub.devices)
                    if (d.model === model) return d;
        return null;
    },
};
