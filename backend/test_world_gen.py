import os
import sys
import unittest
from fastapi.testclient import TestClient

# Make sure we can import backend correctly
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from backend.main import app

class TestWorldGenEndpoint(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)
        self.prompts = [
            "volcanic island, pirate clans, theme of betrayal, medium difficulty",
            "cyberpunk neon city, corrupt megacorporations, hacker resistance, hard difficulty",
            "frozen wasteland, ancient ice elementals, survival theme, easy difficulty",
            "floating sky islands, steampunk merchants war, diplomatic focus, medium difficulty",
            "lush jungle, forgotten temple ruins, poison dart frogs, hard difficulty"
        ]

    def test_five_prompts(self):
        for index, prompt in enumerate(self.prompts):
            print(f"\\n--- Testing Prompt {index + 1}/5 ---")
            print(f"Prompt: {prompt}")
            response = self.client.post("/generate-world", json={"prompt": prompt})
            
            # Print errors if any
            if response.status_code != 200:
                print(f"Error {response.status_code}: {response.text}")
                
            self.assertEqual(response.status_code, 200)
            data = response.json()
            
            self.assertEqual(data["status"], "success")
            world = data["data"]
            self.assertIn("world_name", world)
            self.assertIn("regions", world)
            self.assertIn("boss", world)
            
            print(f"Successfully generated world: {world['world_name']}")
            print(f"Regions count: {len(world['regions'])}")
            print(f"Boss: {world['boss']['name']}")

if __name__ == "__main__":
    unittest.main()
