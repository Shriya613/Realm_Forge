/**
 * sprites.js — CSS-animated map sprites
 * Drop-in overlay on top of the overworld map.
 * No assets needed — pure emoji + CSS animations.
 */

const SPRITE_TYPES = {
    player: { label: '🧝', cls: 'sprite-player' },
    enemy:  { label: '👺', cls: 'sprite-enemy'  },
    npc:    { label: '🧙', cls: 'sprite-npc'    }
};

class MapSprite {
    constructor(type, x, y, name = '', regionId = '') {
        this.type = type;
        this.x = x;
        this.y = y;
        this.name = name;
        this.regionId = regionId;
        this.roamInterval = null;
        this.el = this._createElement();
    }

    _createElement() {
        const cfg = SPRITE_TYPES[this.type] || SPRITE_TYPES.enemy;
        const el = document.createElement('div');
        el.className = `map-sprite ${cfg.cls}`;
        el.innerHTML = `
            <div class="sprite-icon">${cfg.label}</div>
            <div class="sprite-shadow"></div>
            ${this.name ? `<div class="sprite-name">${this.name}</div>` : ''}
        `;
        el.style.left = `${this.x}px`;
        el.style.top  = `${this.y}px`;
        const layer = document.getElementById('sprite-layer');
        if (layer) layer.appendChild(el);
        return el;
    }

    moveTo(x, y, duration = 1200) {
        const icon = this.el.querySelector('.sprite-icon');
        if (icon) {
            icon.style.transform = x > this.x ? 'scaleX(1)' : 'scaleX(-1)';
        }
        this.x = x; this.y = y;
        this.el.style.transition = `left ${duration}ms linear, top ${duration}ms linear`;
        this.el.style.left = `${x}px`;
        this.el.style.top  = `${y}px`;
    }

    startRoaming(bounds, cx, cy, radius = 45) {
        this.roamInterval = setInterval(() => {
            const angle = Math.random() * Math.PI * 2;
            const dist  = Math.random() * radius;
            const nx = Math.max(bounds.left + 10, Math.min(bounds.right  - 10, cx + Math.cos(angle) * dist));
            const ny = Math.max(bounds.top  + 10, Math.min(bounds.bottom - 10, cy + Math.sin(angle) * dist));
            this.moveTo(nx, ny, 1600 + Math.random() * 800);
        }, 2200 + Math.random() * 800);
    }

    stopRoaming() {
        if (this.roamInterval) { clearInterval(this.roamInterval); this.roamInterval = null; }
    }

    flashDamage() {
        this.el.style.filter = 'brightness(4) sepia(1) saturate(8) hue-rotate(-30deg)';
        setTimeout(() => { this.el.style.filter = ''; }, 280);
    }

    celebrate() {
        this.el.style.animation = 'spriteCelebrate 0.45s ease-in-out 3';
        setTimeout(() => { this.el.style.animation = ''; }, 1400);
    }

    destroy() {
        this.stopRoaming();
        this.el.style.animation = 'spriteDestroy 0.4s ease-out forwards';
        setTimeout(() => this.el.remove(), 420);
    }
}

/**
 * Spawn enemy sprites on the overworld near each region node.
 * @param {Array} regions - worldData.regions
 * @param {DOMRect|Object} bounds - {left, top, right, bottom, width, height}
 * @returns {MapSprite[]}
 */
function spawnRegionEnemies(regions, bounds) {
    const sprites = [];
    regions.forEach(region => {
        const cx = (region.position.x / 100) * bounds.width  + bounds.left;
        const cy = (region.position.y / 100) * bounds.height + bounds.top;
        const count = region.difficulty === 'hard' ? 2 : 1;
        for (let i = 0; i < count; i++) {
            const ox = cx + (Math.random() - 0.5) * 55;
            const oy = cy + (Math.random() - 0.5) * 55;
            const s = new MapSprite('enemy', ox, oy, '', region.id);
            s.startRoaming(bounds, cx, cy, 40);
            sprites.push(s);
        }
    });
    return sprites;
}

export { MapSprite, spawnRegionEnemies };
