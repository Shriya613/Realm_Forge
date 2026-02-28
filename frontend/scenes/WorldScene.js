import Phaser from 'phaser';
import { dummyWorld } from '../api/worldApi.js';

export default class WorldScene extends Phaser.Scene {
    constructor() {
        super('WorldScene');
        this.worldData = null;
    }

    preload() {
        // Here we would load actual images/sprites from assets/sprites
        // No external assets for this mock though, we will use graphics
    }

    create() {
        this.worldData = dummyWorld;
        
        // Launch UI Scene passing world data
        this.scene.launch('UIScene', { worldName: this.worldData.world_name });

        // Draw basic lines representing paths
        const graphics = this.add.graphics();
        graphics.lineStyle(4, 0x555555, 1);
        
        if (this.worldData.regions.length > 1) {
            graphics.beginPath();
            graphics.moveTo(this.worldData.regions[0].position.x, this.worldData.regions[0].position.y);
            for(let i=1; i<this.worldData.regions.length; i++) {
                graphics.lineTo(this.worldData.regions[i].position.x, this.worldData.regions[i].position.y);
            }
            graphics.strokePath();
        }

        // Draw Regions as interactive circles
        this.worldData.regions.forEach(region => {
            const x = region.position.x;
            const y = region.position.y;

            const circle = this.add.circle(x, y, 30, 0x882222);
            circle.setStrokeStyle(4, 0xffffff);
            circle.setInteractive();

            // Hover effects
            circle.on('pointerover', () => {
                circle.setStrokeStyle(4, 0xffff00);
            });
            circle.on('pointerout', () => {
                circle.setStrokeStyle(4, 0xffffff);
            });

            // Click Handler
            circle.on('pointerdown', () => {
                // emit event to the global event emitter shared between scenes
                this.events.emit('regionClicked', region);
            });

            // Name
            this.add.text(x, y + 40, region.name, {
                fontSize: '16px',
                fill: '#fff',
                fontFamily: 'Courier',
                backgroundColor: '#000',
            }).setOrigin(0.5);
            
            // Difficulty
            let diffColor = '#22ff22';
            if (region.difficulty === 'medium') diffColor = '#ffff22';
            if (region.difficulty === 'hard') diffColor = '#ff2222';

            this.add.text(x, y - 40, `Diff: ${region.difficulty}`, {
                fontSize: '12px',
                fill: diffColor,
                fontFamily: 'Courier',
                backgroundColor: '#000',
            }).setOrigin(0.5);
        });
    }
}
