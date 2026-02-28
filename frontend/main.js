import Phaser from 'phaser';
import WorldScene from './scenes/WorldScene.js';
import UIScene from './scenes/UIScene.js';
import { dummyWorld } from './api/worldApi.js';

let playerName = "";
let chosenPrompt = "";
let isGameInitialized = false;

// DOM Elements
const uiLayer = document.getElementById('ui-layer');
const loginScreen = document.getElementById('login-screen');
const promptScreen = document.getElementById('prompt-screen');
const loadingScreen = document.getElementById('loading-screen');
const loadingStatus = document.getElementById('loading-status');
const gameContainer = document.getElementById('game-container');

// Screen 1: Login
document.getElementById('btn-next').addEventListener('click', () => {
    const nameInput = document.getElementById('char-name').value.trim();
    if (nameInput) {
        playerName = nameInput;
        // Switch to Prompt Screen
        loginScreen.classList.remove('active');
        setTimeout(() => promptScreen.classList.add('active'), 400); // 400ms CSS transition
    } else {
        alert("Please enter a character name to begin your journey.");
    }
});

// Screen 2: Prompt
document.getElementById('btn-generate').addEventListener('click', async () => {
    const promptInput = document.getElementById('world-prompt').value.trim();
    if (promptInput) {
        chosenPrompt = promptInput;
        // Switch to Loading Screen
        promptScreen.classList.remove('active');
        setTimeout(() => {
            loadingScreen.classList.add('active');
            loadingStatus.innerText = "Forging a brand new realm from your words...";
            generateGameWorld(chosenPrompt);
        }, 400);
    } else {
        alert("Please describe the world you want to conquer.");
    }
});

async function generateGameWorld(promptString) {
    try {
        // Backend API Call
        const response = await fetch('http://127.0.0.1:8000/generate-world', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: promptString, player_name: playerName })
        });
        
        if (!response.ok) {
            throw new Error(`Server returned ${response.status}`);
        }
        
        const data = await response.json();
        const generatedWorld = data.data; // Pydantic JSON dump

        loadingStatus.innerText = "Realm assembled! Transporting you now...";
        
        setTimeout(() => {
            startGameEngine(generatedWorld);
        }, 1500);

    } catch (e) {
        console.error(e);
        loadingStatus.innerText = "Dark magic interfered! Falling back to backup realm...";
        
        // Fallback to our dummy JSON
        setTimeout(() => {
            startGameEngine(dummyWorld);
        }, 1500);
    }
}

function startGameEngine(worldData) {
    // Hide UI Layer, Show Game
    uiLayer.classList.remove('active');
    setTimeout(() => {
        uiLayer.style.display = 'none';
        gameContainer.classList.add('visible');
    }, 500);

    if (isGameInitialized) return;
    
    // Boot Phaser
    const config = {
        type: Phaser.AUTO,
        width: 1024,
        height: 768,
        parent: 'game-container',
        pixelArt: true,
        backgroundColor: '#1b1626', // Updated to match space theme
    };

    const game = new Phaser.Game(config);
    game.scene.add('WorldScene', WorldScene);
    game.scene.add('UIScene', UIScene);
    
    // Start WorldScene and pass the external data
    game.scene.start('WorldScene', { worldData, playerName });
    isGameInitialized = true;
}
