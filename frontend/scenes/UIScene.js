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

        this.playerName = data.playerName || 'Unknown';
        this.xpText = this.add.text(20, 60, `Hero: ${this.playerName} | Role: Warrior | XP: 0`, {
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

        // DM Narration Display Box
        const dmBg = this.add.rectangle(20, 500, 600, 150, 0x111122, 0.9);
        dmBg.setStrokeStyle(2, 0xe2c073);
        dmBg.setOrigin(0, 0);
        
        this.dmTitle = this.add.text(40, 510, "DUNGEON MASTER", {
            fontSize: '18px', fill: '#e2c073', fontFamily: 'Cinzel', fontStyle: 'bold'
        });
        
        this.dmText = this.add.text(40, 540, "Awaiting your move, hero...", {
            fontSize: '14px', fill: '#ffffff', fontFamily: 'Inter', wordWrap: { width: 560 }
        });
        
        this.dmContainer = this.add.container(0, 0, [dmBg, this.dmTitle, this.dmText]);

        // Action Buttons in the side panel
        const actions = ["ATTACK", "SCOUT", "FORTIFY", "NEGOTIATE"];
        let yOffset = 260;
        
        this.currentRegionId = null;
        
        actions.forEach(action => {
            const btnBg = this.add.rectangle(20, yOffset, 240, 40, 0x333333, 1).setOrigin(0, 0);
            btnBg.setStrokeStyle(1, 0x666666);
            btnBg.setInteractive();
            
            const btnText = this.add.text(140, yOffset + 20, action, {
                fontSize: '16px', fill: '#00ff00', fontFamily: 'Courier', fontStyle: 'bold'
            }).setOrigin(0.5, 0.5);
            
            btnBg.on('pointerover', () => btnBg.setFillStyle(0x555555));
            btnBg.on('pointerout', () => btnBg.setFillStyle(0x333333));
            
            btnBg.on('pointerdown', () => {
                if(this.currentRegionId) {
                    this.sendAction(action);
                }
            });
            
            this.panel.add([btnBg, btnText]);
            yOffset += 50;
        });

        this.panel.add([bg, this.panelTitle, this.panelDesc]);
        this.panel.setVisible(false);

        // Receive regionClicked events from the WorldScene
        const worldScene = this.scene.get('WorldScene');
        worldScene.events.on('regionClicked', (region) => {
            this.showRegionPanel(region);
        });
    }

    showRegionPanel(region) {
        this.currentRegionId = region.id;
        this.panel.setVisible(true);
        this.panelTitle.setText(region.name.toUpperCase());
        this.panelDesc.setText(`${region.description}\n\nStrategic Value:\n${region.strategic_value}`);
    }

    async sendAction(actionStr) {
        this.dmText.setText("Mistral is weaving the outcome... (Rolling dice...)");
        this.dmText.setColor("#aaaaaa");
        
        try {
            const response = await fetch('http://127.0.0.1:8000/action', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: actionStr,
                    region_id: this.currentRegionId
                })
            });
            
            const data = await response.json();
            if (response.ok) {
                // Determine color based on tone or outcome
                let textColor = "#ffffff";
                const dmResponse = data.response;
                if(dmResponse.outcome === "failure") textColor = "#ff4444";
                if(dmResponse.outcome === "success") textColor = "#44ff44";
                if(dmResponse.outcome === "partial") textColor = "#ffff44";

                this.dmText.setText(dmResponse.narration);
                this.dmText.setColor(textColor);
                
                // Update HUD XP
                this.xpText.setText(`Hero: ${this.playerName} | Role: Warrior | XP: ${data.xp}`);
            } else {
                this.dmText.setText("An error occurred trying to reach the Dungeon Master.");
                this.dmText.setColor("#ff0000");
            }
        } catch(e) {
            console.error(e);
            this.dmText.setText("Connection to the AI realm failed.");
            this.dmText.setColor("#ff0000");
        }
    }
}
