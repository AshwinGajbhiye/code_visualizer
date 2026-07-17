# C++ Code Visualizer

A fully client-side step-by-step code visualizer and execution engine for C++ algorithms. This tool breaks down standard C++ code (like LeetCode solutions) into an abstract syntax tree and interprets it locally in the browser, rendering animated visual cards for data structures like Maps, Sets, Vectors, and Stacks.

## Features
- **Zero Backend Required:** The entire lexing, parsing, and execution happens instantly in the browser.
- **Support for C++ Syntax:** Handles loops, iterators, range-based for loops, if/else branching, and standard C++ boilerplate (like `class Solution`).
- **Rich Data Structure Visualization:** Animated glassmorphic cards represent primitives, arrays, sets, and hashmaps.
- **Playback Controls:** Step forwards/backwards, control playback speed, and scrub through the execution timeline.

## Running Instructions
Since this app uses an AI explanation feature powered by the Gemini API, you need to run the custom Python server to handle the API calls.

### 1. Setup API Key (Optional)
To use the AI explanation features, get a Gemini API key. If you don't provide one, or if it runs out of quota, the visualizer will still work using fallback parsing logic without AI explanations.

### 2. Start the Server
If you have Python installed, you can run the server and pass the API key as an environment variable:
```bash
export GEMINI_API_KEY="your_api_key_here"
python3 server.py
```
Then navigate to `http://localhost:8090` in your web browser.

## Usage
- The editor will default to **Longest Substring Without Repeating Characters**.
- Click the **Run** button to parse and execute the code.
- Click **Play** or press the **Spacebar** to watch the visualization.
- Change playback speed by clicking the speed button or using `[` and `]`.
- Explore other algorithms like **Two Sum** using the dropdown at the top right.
