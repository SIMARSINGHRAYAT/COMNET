/* ComNet - Drawing / Annotation Tools */

const DrawingTools = {
    tool: 'select',
    drawing: false,
    objects: [],
    _current: null,
    selected: null,

    setTool(t) { this.tool = t; this.drawing = false; this._current = null; },
    isActive() { return this.tool !== 'select'; },

    _resolveColor() {
        const style = getComputedStyle(document.documentElement);
        return style.getPropertyValue('--text').trim() || '#cdd6f4';
    },

    startDraw(x, y) {
        if (this.tool === 'select') return;
        this.drawing = true;
        if (this.tool === 'text') {
            const text = prompt('Enter text:');
            if (text) this.objects.push({ type:'text', x, y, text, color:this._resolveColor(), font:'14px Inter, sans-serif', selected:false });
            this.drawing = false;
            return;
        }
        this._current = { type:this.tool, x1:x, y1:y, x2:x, y2:y, color:this._resolveColor(), width:2, points:this.tool==='freehand'?[{x,y}]:null, selected:false };
    },

    moveDraw(x, y) {
        if (!this.drawing || !this._current) return;
        this._current.x2 = x; this._current.y2 = y;
        if (this._current.points) this._current.points.push({ x, y });
    },

    endDraw(x, y) {
        if (!this.drawing) return;
        this.drawing = false;
        if (this._current) {
            this._current.x2 = x; this._current.y2 = y;
            this.objects.push(this._current);
            this._current = null;
        }
    },

    render(ctx) {
        // Render completed objects
        for (const obj of this.objects) this._renderObj(ctx, obj);
        // Render in-progress
        if (this._current) this._renderObj(ctx, this._current);
    },

    _renderObj(ctx, obj) {
        ctx.strokeStyle = obj.selected ? '#f9e2af' : (obj.color || '#cdd6f4');
        ctx.lineWidth = obj.selected ? (obj.width||2)+1 : (obj.width||2);
        ctx.fillStyle = obj.color || '#cdd6f4';

        switch (obj.type) {
            case 'text':
                ctx.font = obj.font || '14px sans-serif';
                ctx.fillText(obj.text, obj.x, obj.y);
                break;
            case 'line':
                ctx.beginPath(); ctx.moveTo(obj.x1, obj.y1); ctx.lineTo(obj.x2, obj.y2); ctx.stroke();
                break;
            case 'rectangle':
                ctx.strokeRect(obj.x1, obj.y1, obj.x2-obj.x1, obj.y2-obj.y1);
                break;
            case 'ellipse':
                const cx = (obj.x1+obj.x2)/2, cy = (obj.y1+obj.y2)/2;
                const rx = Math.abs(obj.x2-obj.x1)/2, ry = Math.abs(obj.y2-obj.y1)/2;
                ctx.beginPath(); ctx.ellipse(cx, cy, rx||1, ry||1, 0, 0, Math.PI*2); ctx.stroke();
                break;
            case 'freehand':
                if (!obj.points?.length) break;
                ctx.beginPath(); ctx.moveTo(obj.points[0].x, obj.points[0].y);
                for (let i=1; i<obj.points.length; i++) ctx.lineTo(obj.points[i].x, obj.points[i].y);
                ctx.stroke();
                break;
        }
    },

    selectAt(x, y) {
        this.objects.forEach(o => o.selected = false);
        for (let i=this.objects.length-1; i>=0; i--) {
            const o = this.objects[i];
            if (this._hitTest(o, x, y)) { o.selected = true; this.selected = o; return o; }
        }
        this.selected = null;
        return null;
    },

    _hitTest(obj, x, y) {
        const t = 10;
        if (obj.type === 'text') return Math.abs(x-obj.x)<60 && Math.abs(y-obj.y)<20;
        if (obj.type === 'rectangle') {
            const mx = Math.min(obj.x1,obj.x2), my = Math.min(obj.y1,obj.y2);
            const mw = Math.abs(obj.x2-obj.x1), mh = Math.abs(obj.y2-obj.y1);
            return x>=mx-t && x<=mx+mw+t && y>=my-t && y<=my+mh+t;
        }
        if (obj.type === 'line') {
            const dx=obj.x2-obj.x1, dy=obj.y2-obj.y1, len2=dx*dx+dy*dy;
            if (len2<1) return Math.hypot(x-obj.x1,y-obj.y1)<t;
            const tt2=Utils.clamp(((x-obj.x1)*dx+(y-obj.y1)*dy)/len2,0,1);
            return Math.hypot(x-(obj.x1+tt2*dx),y-(obj.y1+tt2*dy))<t;
        }
        if (obj.type === 'ellipse') {
            const cx=(obj.x1+obj.x2)/2, cy=(obj.y1+obj.y2)/2;
            return Math.abs(x-cx)<Math.abs(obj.x2-obj.x1)/2+t && Math.abs(y-cy)<Math.abs(obj.y2-obj.y1)/2+t;
        }
        return false;
    },

    deleteSelected() {
        this.objects = this.objects.filter(o => !o.selected);
        this.selected = null;
    },

    clear() { this.objects = []; this.selected = null; this._current = null; },
    serialize() { return this.objects.map(o => ({...o, selected:false})); },
    deserialize(data) { this.objects = data || []; },
};
