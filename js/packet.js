/* ============================================
   ComNet Simulator - Packet Animation System
   ============================================ */

class PacketAnimator {
    constructor(app) {
        this.app = app;
        this.queue = [];
        this.isPlaying = false;
        this.animationSpeed = 5; // 1-10
    }

    getAnimDuration() {
        return 1500 / this.animationSpeed;
    }

    // Animate a full ping (ICMP Echo) sequence
    animatePing(sourceDevice, destDevice, path, success) {
        if (!path || path.length < 2) {
            // Direct connection animation
            if (success) {
                this._animateHop(sourceDevice, destDevice, 'ICMP', () => {
                    this._animateHop(destDevice, sourceDevice, 'ICMP', null);
                });
            } else {
                this._animateHop(sourceDevice, destDevice, 'ICMP', null);
            }
            return;
        }

        // Animate through each hop in sequence
        const forwardHops = [];
        for (let i = 0; i < path.length - 1; i++) {
            const fromDev = this.app.devices.get(path[i].deviceId);
            const toDev = this.app.devices.get(path[i + 1].deviceId);
            if (fromDev && toDev) {
                forwardHops.push({ from: fromDev, to: toDev });
            }
        }

        // Build reverse path
        const reverseHops = [];
        if (success) {
            for (let i = path.length - 1; i > 0; i--) {
                const fromDev = this.app.devices.get(path[i].deviceId);
                const toDev = this.app.devices.get(path[i - 1].deviceId);
                if (fromDev && toDev) {
                    reverseHops.push({ from: fromDev, to: toDev });
                }
            }
        }

        this._animateHopSequence([...forwardHops, ...reverseHops], 'ICMP', 0);
    }

    // Animate ARP request/reply
    animateARP(sourceDevice, targetDevice, success) {
        this._animateHop(sourceDevice, targetDevice, 'ARP', () => {
            if (success) {
                this._animateHop(targetDevice, sourceDevice, 'ARP', null);
            }
        });
    }

    _animateHop(fromDevice, toDevice, protocol, onComplete) {
        this.app.renderer.animatePacket(
            fromDevice,
            toDevice,
            protocol,
            this.getAnimDuration(),
            onComplete
        );
    }

    _animateHopSequence(hops, protocol, index) {
        if (index >= hops.length) return;

        const hop = hops[index];
        this._animateHop(hop.from, hop.to, protocol, () => {
            this._animateHopSequence(hops, protocol, index + 1);
        });
    }

    setSpeed(speed) {
        this.animationSpeed = Utils.clamp(speed, 1, 10);
    }
}
