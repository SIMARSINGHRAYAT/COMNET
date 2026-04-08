/* ComNet - IOS-style CLI */

class CLISession {
    constructor(device, networkEngine) {
        this.device = device;
        this.network = networkEngine;
        this.mode = 'user'; // user, privileged, config, interface, router, line, dhcp, acl, vlan-config
        this.currentInterface = null;
        this.currentLine = null;       // line console 0, line vty 0 4
        this.currentDHCPPool = null;   // ip dhcp pool NAME
        this.currentACL = null;        // access-list or ip access-list
        this.currentRouterProto = null;// router rip / router ospf
        this.history = [];
        this.historyIndex = -1;
        this.output = '';
        if (device.bannerMotd) this.output += device.bannerMotd + '\n';
        this.output += `\n${device.hostname}>\n`;
    }

    getPrompt() {
        const h = this.device.hostname;
        switch (this.mode) {
            case 'user': return `${h}>`;
            case 'privileged': return `${h}#`;
            case 'config': return `${h}(config)#`;
            case 'interface': return `${h}(config-if)#`;
            case 'router': return `${h}(config-router)#`;
            case 'line': return `${h}(config-line)#`;
            case 'dhcp': return `${h}(dhcp-config)#`;
            case 'acl': return `${h}(config-ext-nacl)#`;
            case 'vlan-config': return `${h}(config-vlan)#`;
            default: return `${h}>`;
        }
    }

    execute(input) {
        const line = input.trim();
        if (!line) return '';
        this.history.push(line);
        this.historyIndex = this.history.length;
        const parts = line.split(/\s+/);
        const cmd = parts[0].toLowerCase();

        try {
            switch (this.mode) {
                case 'user': return this._userMode(cmd, parts);
                case 'privileged': return this._privMode(cmd, parts);
                case 'config': return this._configMode(cmd, parts);
                case 'interface': return this._ifaceMode(cmd, parts);
                case 'router': return this._routerMode(cmd, parts);
                case 'line': return this._lineMode(cmd, parts);
                case 'dhcp': return this._dhcpMode(cmd, parts);
                case 'acl': return this._aclMode(cmd, parts);
                case 'vlan-config': return this._vlanConfigMode(cmd, parts);
            }
        } catch (e) { return `% Error: ${e.message}`; }
        return `% Unknown command: ${line}`;
    }

    /* ========== USER MODE ========== */
    _userMode(cmd, parts) {
        switch (cmd) {
            case 'enable': this.mode = 'privileged'; return '';
            case 'ping': return this._doPing(parts);
            case 'traceroute': case 'tracert': return this._doTrace(parts);
            case 'show': return this._doShow(parts);
            case 'connect': case 'telnet': case 'ssh': return this._doTelnet(parts);
            case 'exit': case 'quit': case 'logout': return '--- Session ended ---';
            case '?': case 'help':
                return `  connect    Open a terminal connection\n  enable     Turn on privileged commands\n  exit       Exit from the EXEC\n  logout     Exit from the EXEC\n  ping       Send echo messages\n  show       Show running system information\n  ssh        Open a secure shell connection\n  telnet     Open a telnet connection\n  traceroute Trace route to destination`;
            default: return `% Unknown command "${parts.join(' ')}" — type ? for help`;
        }
    }

    /* ========== PRIVILEGED MODE ========== */
    _privMode(cmd, parts) {
        switch (cmd) {
            case 'configure':
                if (parts[1] === 'terminal' || parts[1] === 't') { this.mode = 'config'; return 'Enter configuration commands, one per line. End with CNTL/Z.'; }
                return '% Incomplete command.';
            case 'disable': this.mode = 'user'; return '';
            case 'exit': this.mode = 'user'; return '';
            case 'ping': return this._doPing(parts);
            case 'traceroute': case 'tracert': return this._doTrace(parts);
            case 'show': return this._doShow(parts);
            case 'copy': return this._doCopy(parts);
            case 'write':
                if (parts[1] === 'erase') return '% Erasing startup-config... [OK]';
                return 'Building configuration...\n[OK]';
            case 'reload':
                this.device.powered = false;
                setTimeout(() => { this.device.powered = true; }, 1000);
                return 'System Bootstrap, Version 15.1(4)M4\n% Reloading...';
            case 'clear':
                return this._doClear(parts);
            case 'debug':
                if (parts[1] === 'ip') return `IP packet debugging is on${parts[2]?' ('+parts[2]+')':''}`;
                if (parts[1] === 'all') return '% All possible debugging has been turned on';
                return `% Debugging ${parts.slice(1).join(' ')} enabled`;
            case 'undebug': case 'no':
                return 'All possible debugging has been turned off';
            case 'terminal':
                if (parts[1] === 'monitor') return '% Console logging enabled';
                if (parts[1] === 'length') return '';
                if (parts[1] === 'width') return '';
                return '';
            case 'clock':
                if (parts[1] === 'set') return '';
                return `*${new Date().toLocaleTimeString()} UTC ${new Date().toLocaleDateString()}`;
            case 'connect': case 'telnet': case 'ssh': return this._doTelnet(parts);
            case '?': case 'help':
                return `  clear      Reset functions\n  clock      Manage the system clock\n  configure  Enter configuration mode\n  connect    Open a terminal connection\n  copy       Copy from one file to another\n  debug      Debugging functions\n  disable    Turn off privileged commands\n  exit       Exit from the EXEC\n  ping       Send echo messages\n  reload     Halt and perform a cold restart\n  show       Show running system information\n  telnet     Open a telnet connection\n  terminal   Set terminal line parameters\n  traceroute Trace route to destination\n  undebug    Disable debugging functions\n  write      Write running configuration to memory`;
            default: return `% Unknown command "${parts.join(' ')}" — type ? for help`;
        }
    }

    /* ========== CONFIG MODE ========== */
    _configMode(cmd, parts) {
        switch (cmd) {
            case 'hostname':
                if (!parts[1]) return '% Incomplete command.';
                this.device.hostname = parts[1]; this.device.name = parts[1]; return '';

            case 'interface':
                if (!parts[1]) return '% Incomplete command.';
                const ifName = parts.slice(1).join('');
                const iface = this.device.interfaces.find(i => i.name.toLowerCase().startsWith(ifName.toLowerCase()));
                if (!iface) return `% Invalid interface: ${parts.slice(1).join(' ')}`;
                this.currentInterface = iface; this.mode = 'interface'; return '';

            case 'ip':
                if (parts[1] === 'route') {
                    if (parts.length < 5) return '% ip route <network> <mask> <next-hop> [metric]';
                    const routeEntry = { network:parts[2], mask:parts[3], nextHop:parts[4], metric:parseInt(parts[5])||1 };
                    this.device.routingTable.push(routeEntry);
                    return '';
                }
                if (parts[1] === 'name-server') {
                    if (!this.device._nameServers) this.device._nameServers = [];
                    if (parts[2]) this.device._nameServers.push(parts[2]);
                    return '';
                }
                if (parts[1] === 'default-gateway') {
                    this.device._defaultGateway = parts[2] || ''; return '';
                }
                if (parts[1] === 'domain-name') {
                    this.device._domainName = parts[2] || ''; return '';
                }
                if (parts[1] === 'dhcp') {
                    if (parts[2] === 'pool') {
                        if (!parts[3]) return '% ip dhcp pool <name>';
                        this.currentDHCPPool = parts[3];
                        if (!this.device._dhcpPools) this.device._dhcpPools = {};
                        if (!this.device._dhcpPools[parts[3]]) this.device._dhcpPools[parts[3]] = {};
                        this.mode = 'dhcp';
                        return '';
                    }
                    if (parts[2] === 'excluded-address') {
                        if (!this.device._dhcpExcluded) this.device._dhcpExcluded = [];
                        this.device._dhcpExcluded.push({ start:parts[3], end:parts[4]||parts[3] });
                        return '';
                    }
                }
                if (parts[1] === 'access-list') {
                    if (!parts[2]) return '% ip access-list { standard | extended } <name>';
                    const aclType = parts[2]; // standard or extended
                    const aclName = parts[3];
                    if (!this.device._accessLists) this.device._accessLists = {};
                    if (!this.device._accessLists[aclName]) this.device._accessLists[aclName] = { type:aclType, entries:[] };
                    this.currentACL = aclName;
                    this.mode = 'acl';
                    return '';
                }
                if (parts[1] === 'nat') {
                    if (!this.device._natRules) this.device._natRules = [];
                    this.device._natRules.push(parts.slice(2).join(' '));
                    return '';
                }
                return `% Invalid command: ${parts.join(' ')}`;

            case 'access-list':
                // Numbered ACL: access-list <number> {permit|deny} <source> [wildcard]
                if (!parts[1]) return '% access-list <number> {permit|deny} <source> [wildcard]';
                const aclNum = parts[1];
                if (!this.device._accessLists) this.device._accessLists = {};
                if (!this.device._accessLists[aclNum]) this.device._accessLists[aclNum] = { type:parseInt(aclNum)<100?'standard':'extended', entries:[] };
                this.device._accessLists[aclNum].entries.push({
                    action: parts[2] || 'permit',
                    source: parts[3] || 'any',
                    wildcard: parts[4] || '',
                    protocol: parts[5] || '',
                });
                return '';

            case 'enable':
                if (parts[1] === 'secret' && parts[2]) { this.device.enableSecret = parts[2]; return ''; }
                if (parts[1] === 'password' && parts[2]) { this.device.enablePassword = parts[2]; return ''; }
                return '% Incomplete command.';

            case 'service':
                if (parts[1] === 'password-encryption') { this.device._servicePassEnc = true; return ''; }
                if (parts[1] === 'timestamps') return '';
                return '';

            case 'banner':
                if (parts[1] === 'motd') { this.device.bannerMotd = parts.slice(2).join(' ').replace(/^#|#$/g,''); return ''; }
                if (parts[1] === 'login') { this.device._bannerLogin = parts.slice(2).join(' ').replace(/^#|#$/g,''); return ''; }
                return '';

            case 'vlan':
                if (!parts[1]) return '% Incomplete command.';
                const vid = parseInt(parts[1]);
                if (isNaN(vid) || vid < 1 || vid > 4094) return '% Invalid VLAN ID (1-4094)';
                if (!this.device.vlans.find(v => v.id === vid)) this.device.vlans.push({ id:vid, name:`VLAN${vid}` });
                this.mode = 'vlan-config';
                this._currentVlan = vid;
                return '';

            case 'router':
                if (parts[1] === 'rip') { this.currentRouterProto = 'rip'; this.mode = 'router'; return ''; }
                if (parts[1] === 'ospf') {
                    this.currentRouterProto = 'ospf';
                    if (!this.device._ospf) this.device._ospf = { processId:parseInt(parts[2])||1, networks:[] };
                    this.mode = 'router';
                    return '';
                }
                if (parts[1] === 'eigrp') {
                    this.currentRouterProto = 'eigrp';
                    if (!this.device._eigrp) this.device._eigrp = { as:parseInt(parts[2])||1, networks:[] };
                    this.mode = 'router';
                    return '';
                }
                return '% Invalid routing protocol';

            case 'line':
                if (parts[1] === 'console') {
                    this.currentLine = 'console'; this.mode = 'line'; return '';
                }
                if (parts[1] === 'vty') {
                    this.currentLine = 'vty'; this.mode = 'line'; return '';
                }
                return '% line { console 0 | vty 0 4 }';

            case 'no':
                if (parts[1] === 'ip' && parts[2] === 'route') {
                    const net = parts[3], mask = parts[4], nh = parts[5];
                    this.device.routingTable = this.device.routingTable.filter(r =>
                        !(r.network === net && (!mask || r.mask === mask) && (!nh || r.nextHop === nh))
                    );
                    return '';
                }
                if (parts[1] === 'access-list') {
                    const name = parts[2];
                    if (this.device._accessLists) delete this.device._accessLists[name];
                    return '';
                }
                if (parts[1] === 'vlan') {
                    const v = parseInt(parts[2]);
                    this.device.vlans = this.device.vlans.filter(vl => vl.id !== v);
                    return '';
                }
                if (parts[1] === 'service') return '';
                if (parts[1] === 'banner') { this.device.bannerMotd = ''; return ''; }
                if (parts[1] === 'hostname') { this.device.hostname = 'Router'; this.device.name = 'Router'; return ''; }
                return '';

            case 'spanning-tree':
                if (!this.device._stp) this.device._stp = { mode:'pvst', priority:32768 };
                if (parts[1] === 'mode') this.device._stp.mode = parts[2] || 'pvst';
                if (parts[1] === 'vlan' && parts[3] === 'priority') this.device._stp.priority = parseInt(parts[4]) || 32768;
                return '';

            case 'cdp': case 'lldp':
                if (parts[1] === 'run') { this.device[`_${cmd}Enabled`] = true; return ''; }
                return '';

            case 'logging':
                if (!this.device._logging) this.device._logging = [];
                this.device._logging.push(parts.slice(1).join(' '));
                return '';

            case 'snmp-server':
                if (!this.device._snmp) this.device._snmp = {};
                if (parts[1] === 'community') this.device._snmp.community = parts[2] || 'public';
                return '';

            case 'ntp':
                if (parts[1] === 'server') { this.device._ntpServer = parts[2]; return ''; }
                return '';

            case 'crypto':
                return '% Crypto commands configured';

            case 'username':
                if (!this.device._users) this.device._users = [];
                if (parts[2] === 'password' || parts[2] === 'secret') {
                    this.device._users.push({ name:parts[1], password:parts[3]||'' });
                }
                return '';

            case 'do':
                // Execute privileged commands from config mode
                const subParts = parts.slice(1);
                const subCmd = subParts[0]?.toLowerCase();
                if (subCmd === 'show') return this._doShow(subParts);
                if (subCmd === 'ping') return this._doPing(subParts);
                if (subCmd === 'write') return 'Building configuration...\n[OK]';
                return `% Unknown command: ${parts.join(' ')}`;

            case 'exit': case 'end': this.mode = 'privileged'; return '';

            case '?':
                return `  access-list       Add an access list entry\n  banner            Define a login banner\n  cdp               CDP configuration\n  do                Execute privileged mode command\n  enable            Set enable password\n  exit              Exit from configure mode\n  hostname          Set system's network name\n  interface         Select an interface to configure\n  ip                IP configuration commands\n  line              Configure a terminal line\n  lldp              LLDP configuration\n  logging           Logging configuration\n  no                Negate a command\n  ntp               NTP configuration\n  router            Enable routing protocol\n  service           Setup service\n  snmp-server       SNMP configuration\n  spanning-tree     STP configuration\n  username          Establish user name authentication\n  vlan              VLAN configuration`;

            default: return `% Unknown command: ${parts.join(' ')}`;
        }
    }

    /* ========== INTERFACE MODE ========== */
    _ifaceMode(cmd, parts) {
        const iface = this.currentInterface;
        if (!iface) { this.mode = 'config'; return ''; }
        switch (cmd) {
            case 'ip':
                if (parts[1] === 'address' && parts[2]) {
                    if (parts[2] === 'dhcp') return '% DHCP client enabled on this interface';
                    if (!parts[3]) return '% ip address <ip> <mask>';
                    iface.ipAddress = parts[2]; iface.subnetMask = parts[3]; return '';
                }
                if (parts[1] === 'nat') { iface.natDirection = parts[2] || ''; return ''; }
                if (parts[1] === 'access-group') {
                    iface._accessGroup = iface._accessGroup || {};
                    iface._accessGroup[parts[3]||'in'] = parts[2]; // access-group <name> in|out
                    return '';
                }
                if (parts[1] === 'ospf') {
                    if (parts[2] === 'cost') iface._ospfCost = parseInt(parts[3]) || 1;
                    if (parts[2] === 'priority') iface._ospfPriority = parseInt(parts[3]) || 1;
                    return '';
                }
                if (parts[1] === 'helper-address') {
                    iface._helperAddress = parts[2] || ''; return '';
                }
                return `% Invalid: ${parts.join(' ')}`;

            case 'no':
                if (parts[1] === 'shutdown') { iface.adminStatus = 'up'; if (iface.isConnected()) iface.status = 'up'; return ''; }
                if (parts[1] === 'ip' && parts[2] === 'address') { iface.ipAddress = ''; iface.subnetMask = ''; return ''; }
                if (parts[1] === 'ip' && parts[2] === 'access-group') { delete iface._accessGroup; return ''; }
                if (parts[1] === 'ip' && parts[2] === 'nat') { iface.natDirection = ''; return ''; }
                if (parts[1] === 'switchport') return '';
                return '';

            case 'shutdown': iface.adminStatus = 'down'; iface.status = 'down'; return '';

            case 'speed':
                if (!parts[1]) return '% speed { 10 | 100 | 1000 | auto }';
                iface.speed = parts[1]; return '';

            case 'duplex':
                if (!parts[1]) return '% duplex { auto | full | half }';
                iface.duplex = parts[1]; return '';

            case 'clock':
                if (parts[1] === 'rate' && parts[2]) { iface.clockRate = parseInt(parts[2]); return ''; }
                return '% clock rate <hz>';

            case 'bandwidth':
                if (parts[1]) { iface._bandwidth = parseInt(parts[1]); return ''; }
                return '% bandwidth <kbps>';

            case 'description':
                iface.description = parts.slice(1).join(' '); return '';

            case 'encapsulation':
                iface._encapsulation = parts[1] || 'dot1q';
                return '';

            case 'switchport':
                if (parts[1] === 'mode') {
                    if (parts[2] === 'trunk') { iface.trunkMode = true; return ''; }
                    if (parts[2] === 'access') { iface.trunkMode = false; return ''; }
                    return '% switchport mode { access | trunk }';
                }
                if (parts[1] === 'access' && parts[2] === 'vlan') { iface.vlan = parseInt(parts[3])||1; return ''; }
                if (parts[1] === 'trunk') {
                    if (parts[2] === 'native' && parts[3] === 'vlan') { iface._nativeVlan = parseInt(parts[4])||1; return ''; }
                    if (parts[2] === 'allowed' && parts[3] === 'vlan') { iface._allowedVlans = parts[4]||'all'; return ''; }
                }
                if (parts[1] === 'port-security') {
                    if (!iface._portSecurity) iface._portSecurity = { enabled:true, maxMac:1, violation:'shutdown' };
                    if (parts[2] === 'maximum') iface._portSecurity.maxMac = parseInt(parts[3])||1;
                    if (parts[2] === 'violation') iface._portSecurity.violation = parts[3]||'shutdown';
                    if (parts[2] === 'mac-address' && parts[3] === 'sticky') iface._portSecurity.sticky = true;
                    return '';
                }
                return '';

            case 'channel-group':
                iface._channelGroup = parseInt(parts[1]) || 1;
                if (parts[2] === 'mode') iface._channelMode = parts[3] || 'on';
                return '';

            case 'mdix':
                if (parts[1] === 'auto') iface._mdixAuto = true;
                return '';

            case 'exit': this.mode = 'config'; this.currentInterface = null; return '';
            case 'end': this.mode = 'privileged'; this.currentInterface = null; return '';

            case '?':
                return `  bandwidth        Set bandwidth informational parameter\n  channel-group   Assign to EtherChannel\n  clock           Configure clock\n  description     Interface specific description\n  duplex          Configure duplex operation\n  encapsulation   Set encapsulation type\n  exit            Exit from interface configuration\n  ip              Interface IP commands\n  mdix            Set MDIX mode\n  no              Negate a command or set defaults\n  shutdown        Shutdown the interface\n  speed           Configure speed\n  switchport      Set switching mode characteristics`;

            default: return `% Unknown command: ${parts.join(' ')}`;
        }
    }

    /* ========== ROUTER CONFIG MODE ========== */
    _routerMode(cmd, parts) {
        switch (cmd) {
            case 'network':
                if (!parts[1]) return '% network <ip-address> [wildcard | area <id>]';
                if (this.currentRouterProto === 'rip') {
                    if (!this.device._rip) this.device._rip = { version:2, networks:[] };
                    this.device._rip.networks.push(parts[1]);
                    return '';
                }
                if (this.currentRouterProto === 'ospf') {
                    this.device._ospf.networks.push({ network:parts[1], wildcard:parts[2]||'0.0.0.255', area:parts[4]||'0' });
                    return '';
                }
                if (this.currentRouterProto === 'eigrp') {
                    this.device._eigrp.networks.push(parts[1]);
                    return '';
                }
                return '';
            case 'version':
                if (this.currentRouterProto === 'rip') {
                    if (!this.device._rip) this.device._rip = { version:2, networks:[] };
                    this.device._rip.version = parseInt(parts[1]) || 2;
                }
                return '';
            case 'no':
                if (parts[1] === 'auto-summary') return '';
                if (parts[1] === 'network') {
                    const proto = this.device[`_${this.currentRouterProto}`];
                    if (proto?.networks) proto.networks = proto.networks.filter(n => (typeof n === 'string' ? n : n.network) !== parts[2]);
                }
                return '';
            case 'auto-summary': return '';
            case 'passive-interface':
                if (!this.device._passiveInterfaces) this.device._passiveInterfaces = [];
                this.device._passiveInterfaces.push(parts[1] === 'default' ? 'default' : parts.slice(1).join(''));
                return '';
            case 'default-information':
                if (parts[1] === 'originate') return '';
                return '';
            case 'redistribute':
                return `% Redistributing ${parts.slice(1).join(' ')} into ${this.currentRouterProto}`;
            case 'distance': return '';
            case 'area':
                if (this.currentRouterProto === 'ospf' && parts[2] === 'authentication') return '';
                return '';
            case 'router-id':
                if (this.device._ospf) this.device._ospf.routerId = parts[1];
                return '';
            case 'exit': this.mode = 'config'; this.currentRouterProto = null; return '';
            case 'end': this.mode = 'privileged'; this.currentRouterProto = null; return '';
            case '?':
                if (this.currentRouterProto === 'rip') return '  auto-summary  Summarize subnets\n  default-information  Control default information\n  network       Enable routing on an IP network\n  no            Negate a command\n  passive-interface  Suppress routing updates\n  redistribute  Redistribute information\n  version       Set RIP version';
                if (this.currentRouterProto === 'ospf') return '  area          OSPF area parameters\n  default-information  Control default information\n  network       Enable routing on an IP network\n  no            Negate a command\n  passive-interface  Suppress routing updates\n  redistribute  Redistribute information\n  router-id     OSPF router-id';
                return '  network  exit  no  end';
            default: return `% Unknown command: ${parts.join(' ')}`;
        }
    }

    /* ========== LINE CONFIG MODE ========== */
    _lineMode(cmd, parts) {
        switch (cmd) {
            case 'password':
                if (!this.device._linePasswords) this.device._linePasswords = {};
                this.device._linePasswords[this.currentLine] = parts[1] || '';
                return '';
            case 'login':
                if (parts[1] === 'local') return '% Login will use local database';
                return '';
            case 'transport':
                if (parts[1] === 'input') return `% Input transport set to ${parts.slice(2).join(' ')}`;
                return '';
            case 'exec-timeout':
                return '';
            case 'logging':
                if (parts[1] === 'synchronous') return '';
                return '';
            case 'exit': this.mode = 'config'; this.currentLine = null; return '';
            case 'end': this.mode = 'privileged'; this.currentLine = null; return '';
            case '?': return '  exec-timeout  Set the EXEC timeout\n  login         Enable password checking\n  logging       Modify message logging\n  password      Set a password\n  transport     Define transport protocols';
            default: return `% Unknown command: ${parts.join(' ')}`;
        }
    }

    /* ========== DHCP POOL CONFIG MODE ========== */
    _dhcpMode(cmd, parts) {
        const pool = this.device._dhcpPools?.[this.currentDHCPPool];
        if (!pool) { this.mode = 'config'; return ''; }
        switch (cmd) {
            case 'network':
                pool.network = parts[1] || '';
                pool.mask = parts[2] || '255.255.255.0';
                return '';
            case 'default-router':
                pool.gateway = parts[1] || '';
                return '';
            case 'dns-server':
                pool.dns = parts[1] || '';
                return '';
            case 'domain-name':
                pool.domain = parts[1] || '';
                return '';
            case 'lease':
                pool.lease = parts.slice(1).join(' ') || '1';
                return '';
            case 'exit': this.mode = 'config'; this.currentDHCPPool = null; return '';
            case 'end': this.mode = 'privileged'; this.currentDHCPPool = null; return '';
            case '?': return '  default-router  Default routers\n  dns-server      DNS servers\n  domain-name     Domain name\n  lease           Address lease time\n  network         Network number and mask\n  exit            Exit';
            default: return `% Unknown command: ${parts.join(' ')}`;
        }
    }

    /* ========== ACL CONFIG MODE ========== */
    _aclMode(cmd, parts) {
        const acl = this.device._accessLists?.[this.currentACL];
        if (!acl) { this.mode = 'config'; return ''; }
        switch (cmd) {
            case 'permit': case 'deny':
                acl.entries.push({
                    action: cmd,
                    protocol: parts[1] || 'ip',
                    source: parts[2] || 'any',
                    srcWild: parts[3] || '',
                    dest: parts[4] || 'any',
                    dstWild: parts[5] || '',
                    port: parts[6] === 'eq' ? parts[7] : '',
                });
                return '';
            case 'remark':
                acl.entries.push({ action:'remark', text:parts.slice(1).join(' ') });
                return '';
            case 'exit': this.mode = 'config'; this.currentACL = null; return '';
            case 'end': this.mode = 'privileged'; this.currentACL = null; return '';
            case '?': return '  deny     Specify packets to reject\n  permit   Specify packets to forward\n  remark   Access list entry comment\n  exit     Exit';
            default: return `% Unknown command: ${parts.join(' ')}`;
        }
    }

    /* ========== VLAN CONFIG MODE ========== */
    _vlanConfigMode(cmd, parts) {
        const vlan = this.device.vlans.find(v => v.id === this._currentVlan);
        switch (cmd) {
            case 'name':
                if (vlan && parts[1]) vlan.name = parts.slice(1).join(' ');
                return '';
            case 'exit': this.mode = 'config'; return '';
            case 'end': this.mode = 'privileged'; return '';
            case '?': return '  name   ASCII name of the VLAN\n  exit   Apply changes and exit';
            default: return `% Unknown command: ${parts.join(' ')}`;
        }
    }

    /* ========== SHOW COMMANDS ========== */
    _doShow(parts) {
        const sub = (parts[1]||'').toLowerCase();
        const sub2 = (parts[2]||'').toLowerCase();
        const sub3 = (parts[3]||'').toLowerCase();

        if (sub === 'ip') {
            if (sub2 === 'interface') return this._showIPIntBrief();
            if (sub2 === 'route') return this._showIPRoute();
            if (sub2 === 'arp') return this._showARP();
            if (sub2 === 'nat') return this._showNAT();
            if (sub2 === 'dhcp') {
                if (sub3 === 'binding') return this._showDHCPBindings();
                if (sub3 === 'pool') return this._showDHCPPool();
                return this._showDHCPPool();
            }
            if (sub2 === 'access-lists' || sub2 === 'access-list') return this._showAccessLists();
            if (sub2 === 'protocols') return this._showIPProtocols();
            if (sub2 === 'ospf') return this._showOSPF();
        }
        if (sub === 'interfaces') return this._showInterfaces();
        if (sub === 'arp') return this._showARP();
        if (sub === 'mac-address-table' || sub === 'mac') return this._showMAC();
        if (sub === 'running-config' || (sub === 'run')) return this._showRunConfig();
        if (sub === 'startup-config') return this._showRunConfig();
        if (sub === 'vlan') return this._showVlan();
        if (sub === 'version') return this._showVersion();
        if (sub === 'clock') return `*${new Date().toLocaleTimeString()} UTC ${new Date().toLocaleDateString()}`;
        if (sub === 'history') return this.history.slice(-20).map((c,i)=>`  ${i}: ${c}`).join('\n');
        if (sub === 'cdp') {
            if (sub2 === 'neighbors') return this._showCDPNeighbors();
            return this._showCDPNeighbors();
        }
        if (sub === 'spanning-tree') return this._showSpanningTree();
        if (sub === 'access-lists' || sub === 'access-list') return this._showAccessLists();
        if (sub === 'controllers') return this._showControllers();
        if (sub === 'etherchannel') return '% No EtherChannel configured';
        if (sub === 'flash' || sub === 'flash:') return 'System flash: 64MB\n  1  isr-universalk9-mz.SPA.bin\n\n64016384 bytes total (48000000 bytes free)';
        if (sub === 'users') return '    Line       User       Host(s)       Idle       Location\n*  0 con 0                idle          00:00:00\n';
        if (sub === 'processes') return 'CPU utilization for five seconds: 2%/0%; one minute: 3%; five minutes: 2%';
        if (sub === 'logging') return '% Syslog logging: enabled\n% Console logging: level debugging';
        if (sub === 'privilege') return `Current privilege level is ${this.mode === 'privileged' || this.mode === 'config' ? '15' : '1'}`;
        if (sub === 'protocols') return this._showIPProtocols();
        if (sub === 'tcp') return '% No TCP sessions open';

        return `  access-lists  arp  cdp  clock  controllers  etherchannel  flash  history  interfaces  ip  logging\n  mac-address-table  privilege  processes  protocols  running-config  spanning-tree  startup-config\n  tcp  users  version  vlan`;
    }

    _showIPIntBrief() {
        let out = 'Interface'.padEnd(25) + 'IP-Address'.padEnd(18) + 'OK?'.padEnd(5) + 'Method'.padEnd(10) + 'Status'.padEnd(12) + 'Protocol\n';
        out += '-'.repeat(75) + '\n';
        for (const i of this.device.interfaces) {
            if (i.type === 'console') continue;
            const status = i.adminStatus === 'down' ? 'admin down' : (i.isConnected() ? 'up' : 'down');
            const proto = i.isUp() ? 'up' : 'down';
            out += i.name.padEnd(25) + (i.ipAddress||'unassigned').padEnd(18) + 'YES'.padEnd(5) + 'manual'.padEnd(10) + status.padEnd(12) + proto + '\n';
        }
        return out;
    }

    _showIPRoute() {
        let out = `Codes: C - connected, S - static, R - RIP, O - OSPF\n\n`;
        // Connected routes
        for (const i of this.device.interfaces) {
            if (i.ipAddress && i.isUp()) {
                const net = Utils.getNetworkAddress(i.ipAddress, i.subnetMask);
                const cidr = Utils.maskToCIDR(i.subnetMask);
                out += `C    ${net}/${cidr} is directly connected, ${i.name}\n`;
            }
        }
        // Static routes
        for (const r of this.device.routingTable) {
            out += `S    ${r.network} ${r.mask} [${r.metric||1}/0] via ${r.nextHop}`;
            if (r.iface) out += `, ${r.iface}`;
            out += '\n';
        }
        // RIP routes
        if (this.device._rip) {
            for (const n of this.device._rip.networks) out += `R    ${n}/24 [120/1] via RIP\n`;
        }
        // OSPF routes
        if (this.device._ospf) {
            for (const n of this.device._ospf.networks) out += `O    ${n.network} [110/1] via OSPF area ${n.area}\n`;
        }
        return out || '% No routing table entries';
    }

    _showInterfaces() {
        let out = '';
        for (const i of this.device.interfaces) {
            const status = i.isUp() ? 'up' : 'down';
            const lineProto = i.isUp() ? 'up' : 'down';
            out += `${i.name} is ${i.adminStatus === 'down' ? 'administratively down' : status}, line protocol is ${lineProto}\n`;
            out += `  Hardware is ${i.type}, address is ${i.macAddress}\n`;
            if (i.description) out += `  Description: ${i.description}\n`;
            if (i.ipAddress) out += `  Internet address is ${i.ipAddress}/${Utils.maskToCIDR(i.subnetMask)}\n`;
            out += `  MTU 1500 bytes, BW ${i._bandwidth||100000} Kbit, DLY 100 usec\n`;
            out += `  ${i.speed||'auto'} ${i.duplex||'auto'}, media type RJ45\n`;
            if (i._encapsulation) out += `  Encapsulation ${i._encapsulation}\n`;
            out += `  Input packets: ${i.rxPackets||0}, Output packets: ${i.txPackets||0}\n`;
            out += `  Input errors: 0, Output errors: 0\n\n`;
        }
        return out;
    }

    _showARP() {
        let out = 'Protocol  Address'.padEnd(30) + 'Age (min)'.padEnd(12) + 'Hardware Addr'.padEnd(20) + 'Type   Interface\n';
        if (!this.device.arpTable.length) return out + '% ARP table is empty.';
        for (const e of this.device.arpTable) {
            const age = e.age ? Math.floor((Date.now() - e.age) / 60000) : 0;
            out += `Internet  ${e.ip}`.padEnd(30) + `${age}`.padEnd(12) + `${e.mac}`.padEnd(20) + 'ARPA\n';
        }
        return out;
    }

    _showMAC() {
        if (!this.device.macTable?.length) return 'Mac Address Table\n-------------------------------------------\n% MAC address table is empty.';
        let out = 'Mac Address Table\n-------------------------------------------\n';
        out += 'Vlan'.padEnd(8) + 'Mac Address'.padEnd(20) + 'Type'.padEnd(12) + 'Ports\n';
        out += '----'.padEnd(8) + '-----------'.padEnd(20) + '---------'.padEnd(12) + '-----\n';
        for (const e of this.device.macTable) out += `${e.vlan||1}`.padEnd(8) + `${e.mac}`.padEnd(20) + 'DYNAMIC'.padEnd(12) + `${e.port}\n`;
        return out;
    }

    _showRunConfig() {
        let out = `!\n! Last configuration change at ${new Date().toLocaleTimeString()}\n!\nversion 15.1\n`;
        if (this.device._servicePassEnc) out += 'service password-encryption\n';
        out += `!\nhostname ${this.device.hostname}\n!\n`;
        if (this.device.enableSecret) out += `enable secret 5 ${this.device.enableSecret}\n!\n`;
        if (this.device.enablePassword) out += `enable password ${this.device.enablePassword}\n!\n`;

        // Users
        if (this.device._users?.length) {
            for (const u of this.device._users) out += `username ${u.name} password 0 ${u.password}\n`;
            out += '!\n';
        }

        // CDP/LLDP
        if (this.device._cdpEnabled) out += 'cdp run\n';
        if (this.device._lldpEnabled) out += 'lldp run\n';

        // STP
        if (this.device._stp) out += `spanning-tree mode ${this.device._stp.mode}\n!\n`;

        // ACLs
        if (this.device._accessLists) {
            for (const [name, acl] of Object.entries(this.device._accessLists)) {
                if (acl.type === 'standard' || acl.type === 'extended') {
                    out += `ip access-list ${acl.type} ${name}\n`;
                    for (const e of acl.entries) {
                        if (e.action === 'remark') out += ` remark ${e.text}\n`;
                        else out += ` ${e.action} ${e.protocol||''} ${e.source||'any'} ${e.srcWild||''} ${e.dest||''} ${e.dstWild||''}${e.port?' eq '+e.port:''}\n`;
                    }
                    out += '!\n';
                } else {
                    // Numbered ACL
                    for (const e of acl.entries) out += `access-list ${name} ${e.action} ${e.source}${e.wildcard?' '+e.wildcard:''}\n`;
                    out += '!\n';
                }
            }
        }

        // Interfaces
        for (const i of this.device.interfaces) {
            out += `interface ${i.name}\n`;
            if (i.description) out += ` description ${i.description}\n`;
            if (i.ipAddress) out += ` ip address ${i.ipAddress} ${i.subnetMask}\n`;
            if (i.natDirection) out += ` ip nat ${i.natDirection}\n`;
            if (i._accessGroup) {
                for (const [dir, name] of Object.entries(i._accessGroup)) out += ` ip access-group ${name} ${dir}\n`;
            }
            if (i._ospfCost) out += ` ip ospf cost ${i._ospfCost}\n`;
            if (i._helperAddress) out += ` ip helper-address ${i._helperAddress}\n`;
            if (i.trunkMode) {
                out += ' switchport mode trunk\n';
                if (i._nativeVlan) out += ` switchport trunk native vlan ${i._nativeVlan}\n`;
                if (i._allowedVlans) out += ` switchport trunk allowed vlan ${i._allowedVlans}\n`;
            } else if (i.vlan && i.vlan !== 1) {
                out += ` switchport mode access\n switchport access vlan ${i.vlan}\n`;
            }
            if (i._portSecurity?.enabled) {
                out += ' switchport port-security\n';
                out += ` switchport port-security maximum ${i._portSecurity.maxMac}\n`;
                out += ` switchport port-security violation ${i._portSecurity.violation}\n`;
                if (i._portSecurity.sticky) out += ' switchport port-security mac-address sticky\n';
            }
            if (i._bandwidth) out += ` bandwidth ${i._bandwidth}\n`;
            if (i._channelGroup) out += ` channel-group ${i._channelGroup} mode ${i._channelMode||'on'}\n`;
            if (i.clockRate) out += ` clock rate ${i.clockRate}\n`;
            if (i.speed && i.speed !== 'auto') out += ` speed ${i.speed}\n`;
            if (i.duplex && i.duplex !== 'auto') out += ` duplex ${i.duplex}\n`;
            if (i._encapsulation) out += ` encapsulation ${i._encapsulation}\n`;
            if (i.adminStatus === 'down') out += ' shutdown\n';
            else out += ' no shutdown\n';
            out += '!\n';
        }

        // Routing protocols
        if (this.device._rip) {
            out += `router rip\n version ${this.device._rip.version}\n`;
            for (const n of this.device._rip.networks) out += ` network ${n}\n`;
            out += '!\n';
        }
        if (this.device._ospf) {
            out += `router ospf ${this.device._ospf.processId||1}\n`;
            if (this.device._ospf.routerId) out += ` router-id ${this.device._ospf.routerId}\n`;
            for (const n of this.device._ospf.networks) out += ` network ${n.network} ${n.wildcard} area ${n.area}\n`;
            out += '!\n';
        }
        if (this.device._eigrp) {
            out += `router eigrp ${this.device._eigrp.as||1}\n`;
            for (const n of this.device._eigrp.networks) out += ` network ${n}\n`;
            out += '!\n';
        }

        // Passive interfaces
        if (this.device._passiveInterfaces?.length) {
            for (const p of this.device._passiveInterfaces) out += `passive-interface ${p}\n`;
        }

        // Static routes
        for (const r of this.device.routingTable) out += `ip route ${r.network} ${r.mask} ${r.nextHop}\n`;

        // DHCP
        if (this.device._dhcpPools) {
            if (this.device._dhcpExcluded) {
                for (const ex of this.device._dhcpExcluded) out += `ip dhcp excluded-address ${ex.start}${ex.end !== ex.start ? ' '+ex.end : ''}\n`;
            }
            for (const [name, pool] of Object.entries(this.device._dhcpPools)) {
                out += `ip dhcp pool ${name}\n`;
                if (pool.network) out += ` network ${pool.network} ${pool.mask||'255.255.255.0'}\n`;
                if (pool.gateway) out += ` default-router ${pool.gateway}\n`;
                if (pool.dns) out += ` dns-server ${pool.dns}\n`;
                if (pool.domain) out += ` domain-name ${pool.domain}\n`;
                out += '!\n';
            }
        }

        // NAT
        if (this.device._natRules?.length) { for (const r of this.device._natRules) out += `ip nat ${r}\n`; }

        // NTP
        if (this.device._ntpServer) out += `ntp server ${this.device._ntpServer}\n`;

        // Logging
        if (this.device._logging?.length) {
            for (const l of this.device._logging) out += `logging ${l}\n`;
        }

        // SNMP
        if (this.device._snmp?.community) out += `snmp-server community ${this.device._snmp.community} RO\n`;

        // Lines
        out += 'line con 0\n';
        if (this.device._linePasswords?.console) out += ` password ${this.device._linePasswords.console}\n login\n`;
        out += '!\nline vty 0 4\n';
        if (this.device._linePasswords?.vty) out += ` password ${this.device._linePasswords.vty}\n login\n`;
        out += '!\n';

        // Banner
        if (this.device.bannerMotd) out += `banner motd #${this.device.bannerMotd}#\n`;

        out += 'end';
        return out;
    }

    _showVlan() {
        let out = 'VLAN Name                             Status    Ports\n';
        out += '---- -------------------------------- --------- -------------------------------\n';
        for (const v of this.device.vlans) {
            const ports = this.device.interfaces.filter(i => i.vlan === v.id && i.type === 'ethernet').map(i=>i.name).join(', ');
            out += `${String(v.id).padEnd(5)}${v.name.padEnd(33)}active    ${ports}\n`;
        }
        return out;
    }

    _showVersion() {
        return `Cisco IOS Software (simulated), ComNet v3.0
Technical Support: http://localhost:3000
Model: ${this.device.model}
Hostname: ${this.device.hostname}
System uptime is 0 days, 0 hours
System image file is "flash:isr-universalk9-mz.SPA.bin"

Processor board ID SIM${this.device.id.substring(0,8)}
${this.device.interfaces.length} interfaces
${this.device.interfaces.filter(i=>i.type==='ethernet').length} Ethernet interfaces
${this.device.interfaces.filter(i=>i.type==='serial').length} Serial interfaces
${this.device.interfaces.filter(i=>i.type==='wireless').length} Wireless interfaces
64K bytes of NVRAM
256MB of flash memory`;
    }

    _showCDPNeighbors() {
        if (!this.network?.app) return '% CDP is not enabled';
        const conns = this.network.app.connectionManager.getByDevice(this.device.id);
        if (!conns.length) return 'Capability Codes: R - Router, S - Switch, T - Trans Bridge, H - Host\n\nDevice ID        Local Intrfce     Holdtme    Capability  Platform  Port ID\n% No CDP neighbors found';

        let out = 'Capability Codes: R - Router, S - Switch, T - Trans Bridge, H - Host\n\n';
        out += 'Device ID'.padEnd(18) + 'Local Intrfce'.padEnd(18) + 'Holdtme'.padEnd(10) + 'Capability'.padEnd(12) + 'Platform'.padEnd(12) + 'Port ID\n';
        for (const conn of conns) {
            const other = conn.getOtherDevice(this.device.id);
            const peer = this.network.app.devices.get(other.deviceId);
            if (!peer) continue;
            const localIf = this.device.id === conn.deviceA ? conn.interfaceA : conn.interfaceB;
            const remoteIf = this.device.id === conn.deviceA ? conn.interfaceB : conn.interfaceA;
            const cap = peer.type === 'router' ? 'R' : peer.type === 'switch' ? 'S' : peer.type === 'l3switch' ? 'R S' : 'H';
            out += peer.hostname.padEnd(18) + localIf.padEnd(18) + '180'.padEnd(10) + cap.padEnd(12) + peer.model.padEnd(12) + remoteIf + '\n';
        }
        return out;
    }

    _showSpanningTree() {
        const mode = this.device._stp?.mode || 'pvst';
        const priority = this.device._stp?.priority || 32768;
        let out = `VLAN0001\n  Spanning tree enabled protocol ${mode}\n  Root ID    Priority    ${priority}\n             Address     ${this.device.interfaces[0]?.macAddress || '0000.0000.0000'}\n`;
        out += `  Bridge ID  Priority    ${priority}\n             Address     ${this.device.interfaces[0]?.macAddress || '0000.0000.0000'}\n\n`;
        out += 'Interface'.padEnd(18) + 'Role'.padEnd(8) + 'Sts'.padEnd(6) + 'Cost'.padEnd(8) + 'Prio.Nbr'.padEnd(12) + 'Type\n';
        out += '-'.repeat(60) + '\n';
        for (const i of this.device.interfaces.filter(i => i.type === 'ethernet')) {
            out += i.name.padEnd(18) + 'Desg'.padEnd(8) + (i.isUp()?'FWD':'BLK').padEnd(6) + '19'.padEnd(8) + '128.1'.padEnd(12) + 'P2p\n';
        }
        return out;
    }

    _showNAT() {
        let out = 'Pro  Inside global'.padEnd(30) + 'Inside local'.padEnd(20) + 'Outside local'.padEnd(20) + 'Outside global\n';
        if (this.device._natRules?.length) {
            out += `Total active translations: ${this.device._natRules.length}\n`;
        } else {
            out += 'Total active translations: 0\n';
        }
        return out;
    }

    _showDHCPBindings() {
        let out = 'IP address'.padEnd(18) + 'Client-ID/'.padEnd(18) + 'Lease expiration'.padEnd(24) + 'Type\n';
        out += '              '.padEnd(18) + 'Hardware address\n';
        return out + '% No DHCP bindings';
    }

    _showDHCPPool() {
        if (!this.device._dhcpPools || !Object.keys(this.device._dhcpPools).length) return '% No DHCP pools configured';
        let out = '';
        for (const [name, pool] of Object.entries(this.device._dhcpPools)) {
            out += `Pool ${name}:\n`;
            if (pool.network) out += `  Network: ${pool.network} ${pool.mask}\n`;
            if (pool.gateway) out += `  Default router: ${pool.gateway}\n`;
            if (pool.dns) out += `  DNS server: ${pool.dns}\n`;
            if (pool.domain) out += `  Domain name: ${pool.domain}\n`;
            out += '\n';
        }
        return out;
    }

    _showAccessLists() {
        if (!this.device._accessLists || !Object.keys(this.device._accessLists).length) return '% No access lists configured';
        let out = '';
        for (const [name, acl] of Object.entries(this.device._accessLists)) {
            out += `${acl.type === 'extended' ? 'Extended' : 'Standard'} IP access list ${name}\n`;
            acl.entries.forEach((e, i) => {
                if (e.action === 'remark') out += `    ${i + 10} remark ${e.text}\n`;
                else out += `    ${i + 10} ${e.action} ${e.protocol||''} ${e.source||'any'}${e.srcWild?' '+e.srcWild:''} ${e.dest||''}${e.dstWild?' '+e.dstWild:''}${e.port?' eq '+e.port:''}\n`;
            });
        }
        return out;
    }

    _showIPProtocols() {
        let out = '';
        if (this.device._rip) {
            out += `Routing Protocol is "rip"\n  Sending updates every 30 seconds\n  Version: ${this.device._rip.version}\n`;
            out += `  Networks:\n`;
            for (const n of this.device._rip.networks) out += `    ${n}\n`;
            out += '\n';
        }
        if (this.device._ospf) {
            out += `Routing Protocol is "ospf ${this.device._ospf.processId||1}"\n`;
            if (this.device._ospf.routerId) out += `  Router ID: ${this.device._ospf.routerId}\n`;
            out += `  Networks:\n`;
            for (const n of this.device._ospf.networks) out += `    ${n.network} ${n.wildcard} area ${n.area}\n`;
            out += '\n';
        }
        if (this.device._eigrp) {
            out += `Routing Protocol is "eigrp ${this.device._eigrp.as}"\n  Networks:\n`;
            for (const n of this.device._eigrp.networks) out += `    ${n}\n`;
            out += '\n';
        }
        if (!out) out = '% No routing protocol is configured';
        return out;
    }

    _showOSPF() {
        if (!this.device._ospf) return '% OSPF is not configured';
        return `OSPF Router with ID (${this.device._ospf.routerId || this.device.getPrimaryIP() || '0.0.0.0'}) (Process ID ${this.device._ospf.processId||1})\n  Number of areas: ${new Set(this.device._ospf.networks.map(n=>n.area)).size || 1}\n  Networks:\n${this.device._ospf.networks.map(n=>`    ${n.network} ${n.wildcard} area ${n.area}`).join('\n')}`;
    }

    _showControllers() {
        let out = '';
        for (const i of this.device.interfaces.filter(i => i.type === 'serial')) {
            out += `Controller ${i.name}\n  Hardware is PowerQUICC\n  DCE V.35, clock rate ${i.clockRate||2000000}\n\n`;
        }
        return out || '% No serial controllers';
    }

    /* ========== NETWORK COMMANDS ========== */
    _doPing(parts) {
        const dest = parts[1];
        if (!dest) return '% ping <ip-address>';
        if (!Utils.isValidIP(dest)) return `% Invalid IP address: ${dest}`;
        if (!this.network) return `Pinging ${dest} ... no simulation engine`;
        const result = this.network.ping(this.device, dest);
        let out = `Type escape sequence to abort.\nSending 4, 100-byte ICMP Echos to ${dest}, timeout is 2 seconds:\n`;
        if (result.success) {
            out += '!!!!\nSuccess rate is 100 percent (4/4), round-trip min/avg/max = 1/2/4 ms';
        } else {
            out += `....\nSuccess rate is 0 percent (0/4)\n${result.message}`;
        }
        return out;
    }

    _doTrace(parts) {
        const dest = parts[1];
        if (!dest) return '% traceroute <ip-address>';
        if (!this.network) return '% No simulation engine';
        const result = this.network.traceroute(this.device, dest);
        let out = `Type escape sequence to abort.\nTracing the route to ${dest}\n\n`;
        result.hops.forEach((h, i) => {
            out += `  ${(i+1).toString().padStart(2)}   ${h.name}   1 msec 1 msec 1 msec\n`;
        });
        if (result.success) out += '\nTrace complete.';
        else out += `\n${result.message}`;
        return out;
    }

    _doTelnet(parts) {
        const dest = parts[1];
        if (!dest) return `% ${parts[0]} <ip-address>`;
        if (this.network) {
            const target = this.network.findDeviceByIP(dest);
            if (target) return `Trying ${dest} ... Open\n\n${target.hostname}>`;
        }
        return `Trying ${dest} ...\n% Connection timed out; remote host not responding`;
    }

    _doCopy(parts) {
        const src = parts[1] || 'running-config';
        const dst = parts[2] || 'startup-config';
        return `Source filename [${src}]?\nDestination filename [${dst}]?\n\nBuilding configuration...\n[OK]`;
    }

    _doClear(parts) {
        const sub = (parts[1]||'').toLowerCase();
        if (sub === 'arp' || sub === 'arp-cache') { this.device.arpTable = []; return '% ARP cache cleared'; }
        if (sub === 'mac' || sub === 'mac-address-table') { this.device.macTable = []; return '% MAC address table cleared'; }
        if (sub === 'counters') {
            for (const i of this.device.interfaces) { i.txPackets = 0; i.rxPackets = 0; }
            return 'Clear "show interface" counters on all interfaces [confirm]\n% Counters cleared';
        }
        if (sub === 'ip') {
            if ((parts[2]||'') === 'ospf') return '% OSPF process reset';
            if ((parts[2]||'') === 'route') { this.device.routingTable = []; return '% IP routing table cleared'; }
            if ((parts[2]||'') === 'dhcp') return '% DHCP bindings cleared';
            if ((parts[2]||'') === 'nat') { this.device._natRules = []; return '% NAT translations cleared'; }
        }
        if (sub === 'logging') return '% Logging buffer cleared';
        return '  arp-cache  counters  ip  logging  mac-address-table';
    }

    /* ========== TAB COMPLETION ========== */
    tabComplete(partial) {
        const cmds = {
            user: ['enable','ping','traceroute','show','exit','telnet','ssh','connect','help'],
            privileged: ['configure terminal','show','ping','traceroute','copy','write','reload','disable','exit',
                         'clear','debug','undebug','terminal','clock','telnet','ssh','connect'],
            config: ['hostname','interface','ip route','ip dhcp pool','ip dhcp excluded-address','ip default-gateway',
                     'ip domain-name','ip name-server','ip nat','ip access-list','enable secret','enable password',
                     'service password-encryption','banner motd','banner login','vlan','no','exit','end',
                     'router rip','router ospf','router eigrp','line console','line vty','access-list',
                     'spanning-tree','cdp run','lldp run','logging','snmp-server','ntp server','username','do'],
            interface: ['ip address','ip nat','ip access-group','ip ospf cost','ip helper-address',
                        'no shutdown','no ip address','shutdown','speed','duplex','clock rate',
                        'bandwidth','switchport','description','encapsulation','channel-group','mdix auto','exit','end'],
            router: ['network','version','no auto-summary','no network','passive-interface',
                     'default-information originate','redistribute','router-id','distance','area','exit','end'],
            line: ['password','login','login local','transport input','exec-timeout','logging synchronous','exit','end'],
            dhcp: ['network','default-router','dns-server','domain-name','lease','exit','end'],
            acl: ['permit','deny','remark','exit','end'],
            'vlan-config': ['name','exit','end'],
        };
        const list = cmds[this.mode] || [];
        return list.filter(c => c.startsWith(partial.toLowerCase()));
    }
}
