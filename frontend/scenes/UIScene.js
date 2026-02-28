import Phaser from 'phaser';

export default class UIScene extends Phaser.Scene {
    constructor() {
        super('UIScene');
        this.panel = null;
        this.panelTitle = null;
        this.panelDesc = null;
    }

    create(data) {
        // Render HUD text
        this.add.text(20, 20, data.worldName || "Unknown World", {
            fontSize: '32px',
            fill: '#ffffff',
            fontFamily: 'Courier',
            fontStyle: 'bold'
        });

        this.add.text(20, 60, `Hero: ${data.playerName || 'Unknown'} | Role: Warrior | XP: 0`, {
            fontSize: '16px',
            fill: '#aaaaaa',
            fontFamily: 'Courier'
        });

        // Setup the Action Panel
        this.panel = this.add.container(724, 20); // Top Right corner
        
        const bg = this.add.rectangle(0, 0, 280, 400, 0x000000, 0.8);
        bg.setStrokeStyle(2, 0xffffff);
        bg.setOrigin(0, 0);

        this.panelTitle = this.add.text(20, 20, "REGION INFO", {
            fontSize: '20px', fill: '#ffff00', fontFamily: 'Courier', fontStyle: 'bold'
        });

        this.panelDesc = this.add.text(20, 60, "", {
            fontSize: '14px', fill: '#ffffff', fontFamily: 'Courier', wordWrap: { width: 240 }
        });

        const panelButtons = this.add.text(20, 300, "> ATTACK\n> SCOUT\n> FORTIFY\n> NEGOTIATE", {
            fontSize: '18px', fill: '#00ff00', fontFamily: 'Courier', lineSpacing: 10
        });

        panelButtons.setInteractive();
        panelButtons.on('pointerdown', () => {
             console.log("Action button clicked (Not connected to API yet)");
        });

        this.panel.add([bg, this.panelTitle, this.panelDesc, panelButtons]);
        this.panel.setVisible(false);

        // Receive regionClicked events from the WorldScene
        const worldScene = this.scene.get('WorldScene');
        worldScene.events.on('regionClicked', (region) => {
            console.log("Region clicked event triggered", region);
            this.showRegionPanel(region);
        });
    }

    showRegionPanel(region) {
        this.panel.setVisible(true);
        this.panelTitle.setText(region.name.toUpperCase());
        this.panelDesc.setText(`${region.description}\n\nStrategic Value:\n${region.strategic_value}`);
    }
}
