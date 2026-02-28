import Phaser from 'phaser';
import WorldScene from './scenes/WorldScene.js';
import UIScene from './scenes/UIScene.js';

const config = {
    type: Phaser.AUTO,
    width: 1024,
    height: 768,
    parent: 'game-container',
    pixelArt: true,
    backgroundColor: '#222222',
    scene: [WorldScene, UIScene]
};

const game = new Phaser.Game(config);
