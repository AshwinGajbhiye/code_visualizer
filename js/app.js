// ============================================
// C++ Code Visualizer — Main App Controller
// ============================================

import { lex } from './lexer.js';
import { parse } from './parser.js';
import { interpret } from './interpreter.js';
import { Visualizer } from './visualizer.js';
import { PlaybackController } from './playback.js';

// ---- Example Code Snippets ----
const EXAMPLES = {
  'longest-substring': {
    name: 'Longest Substring Without Repeating Characters',
    code: `int lengthOfLongestSubstring(string s) {
    unordered_set<char> charSet;
    int l = 0;
    int res = 0;

    for (int r = 0; r < s.size(); r++) {
        while (charSet.count(s[r])) {
            charSet.erase(s[l]);
            l++;
        }
        charSet.insert(s[r]);
        res = max(res, r - l + 1);
    }
    return res;
}`,
    input: '"abcabcbb"',
  },
  'two-sum': {
    name: 'Two Sum',
    code: `vector<int> twoSum(vector<int>& nums, int target) {
    unordered_map<int, int> seen;

    for (int i = 0; i < nums.size(); i++) {
        int complement = target - nums[i];
        if (seen.count(complement)) {
            return {seen[complement], i};
        }
        seen[nums[i]] = i;
    }
    return {};
}`,
    input: '[2,7,11,15], 9',
  },
  'binary-search': {
    name: 'Binary Search',
    code: `int search(vector<int>& nums, int target) {
    int left = 0;
    int right = nums.size() - 1;

    while (left <= right) {
        int mid = left + (right - left) / 2;
        if (nums[mid] == target) {
            return mid;
        } else if (nums[mid] < target) {
            left = mid + 1;
        } else {
            right = mid - 1;
        }
    }
    return -1;
}`,
    input: '[1,3,5,7,9,11,13], 7',
  },
  'valid-parentheses': {
    name: 'Valid Parentheses',
    code: `bool isValid(string s) {
    stack<char> st;

    for (int i = 0; i < s.size(); i++) {
        char c = s[i];
        if (c == '(' || c == '{' || c == '[') {
            st.push(c);
        } else {
            if (st.empty()) {
                return false;
            }
            char top = st.top();
            st.pop();
            if (c == ')' && top != '(') return false;
            if (c == '}' && top != '{') return false;
            if (c == ']' && top != '[') return false;
        }
    }
    return st.empty();
}`,
    input: '"({[]})"',
  },
  'bubble-sort': {
    name: 'Bubble Sort',
    code: `void bubbleSort(vector<int>& arr) {
    int n = arr.size();
    for (int i = 0; i < n - 1; i++) {
        for (int j = 0; j < n - i - 1; j++) {
            if (arr[j] > arr[j + 1]) {
                int temp = arr[j];
                arr[j] = arr[j + 1];
                arr[j + 1] = temp;
            }
        }
    }
}`,
    input: '[64, 34, 25, 12, 22, 11, 90]',
  },
  'max-subarray': {
    name: "Kadane's Algorithm (Max Subarray)",
    code: `int maxSubArray(vector<int>& nums) {
    int maxSum = nums[0];
    int curSum = 0;

    for (int i = 0; i < nums.size(); i++) {
        curSum = curSum + nums[i];
        if (curSum > maxSum) {
            maxSum = curSum;
        }
        if (curSum < 0) {
            curSum = 0;
        }
    }
    return maxSum;
}`,
    input: '[-2,1,-3,4,-1,2,1,-5,4]',
  },
  'best-time-stock': {
    name: 'Best Time to Buy and Sell Stock',
    code: `int maxProfit(vector<int>& prices) {
    int n = prices.size();
    int profit = 0;
    int l = 0, r = 1;
    while (r < n) {
        if (prices[r] > prices[l]) {
            profit = max(profit, prices[r] - prices[l]);
        } else {
            l = r;
        }
        r++;
    }
    return profit;
}`,
    input: '[5, 1, 5, 6, 7, 1]',
  },
};

/**
 * Main application class
 */
class App {
  constructor() {
    this.editor = null;
    this.visualizer = null;
    this.playback = null;
    this.currentSteps = [];
  }

  async init() {
    // Initialize CodeMirror
    await this.initEditor();

    // Initialize Visualizer
    const vizBody = document.getElementById('viz-body');
    this.visualizer = new Visualizer(vizBody);

    // Initialize Playback Controller
    this.playback = new PlaybackController({
      onStepChange: (step, prevStep, index) => this.handleStepChange(step, prevStep, index),
      onPlayStateChange: (playing) => this.handlePlayStateChange(playing),
    });

    this.playback.init({
      playBtn: document.getElementById('btn-play'),
      prevBtn: document.getElementById('btn-prev'),
      nextBtn: document.getElementById('btn-next'),
      startBtn: document.getElementById('btn-start'),
      endBtn: document.getElementById('btn-end'),
      stepDisplay: document.getElementById('step-display'),
      timeline: document.getElementById('timeline'),
      timelineProgress: document.getElementById('timeline-progress'),
      speedBtns: document.querySelectorAll('.playback__speed-btn'),
    });

    // Event bindings
    document.getElementById('btn-run').addEventListener('click', () => this.runCode());
    document.getElementById('example-select').addEventListener('change', (e) => this.loadExample(e.target.value));

    // Load default example
    this.loadExample('longest-substring');

    // Show welcome state
    this.showWelcome();
  }

  async initEditor() {
    try {
      const { EditorView, basicSetup } = await import('https://esm.sh/codemirror@6.0.1');
      const { cpp } = await import('https://esm.sh/@codemirror/lang-cpp@6.0.2');
      const { EditorState } = await import('https://esm.sh/@codemirror/state@6.5.2');
      const { oneDark } = await import('https://esm.sh/@codemirror/theme-one-dark@6.1.2');

      // Custom dark theme to match our design
      const customTheme = EditorView.theme({
        '&': {
          backgroundColor: '#0f0f1e',
          color: '#e8e8f0',
        },
        '.cm-content': {
          caretColor: '#a29bfe',
          fontFamily: "'JetBrains Mono', monospace",
        },
        '.cm-gutters': {
          backgroundColor: '#0a0a14',
          color: '#6c6c88',
          borderRight: '1px solid rgba(255,255,255,0.06)',
        },
        '.cm-activeLineGutter': {
          backgroundColor: 'rgba(108, 92, 231, 0.15)',
          color: '#a29bfe',
        },
        '.cm-activeLine': {
          backgroundColor: 'rgba(108, 92, 231, 0.08)',
        },
        '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
          backgroundColor: 'rgba(108, 92, 231, 0.25)',
        },
        '.cm-cursor': {
          borderLeftColor: '#a29bfe',
          borderLeftWidth: '2px',
        },
      }, { dark: true });

      this.editor = new EditorView({
        doc: '',
        extensions: [
          basicSetup,
          cpp(),
          oneDark,
          customTheme,
          EditorView.lineWrapping,
        ],
        parent: document.getElementById('code-editor'),
      });

      // Store EditorState for later use
      this._EditorState = EditorState;
    } catch (err) {
      console.error('Failed to load CodeMirror:', err);
      // Fallback to textarea
      this.initFallbackEditor();
    }
  }

  initFallbackEditor() {
    const editorEl = document.getElementById('code-editor');
    editorEl.innerHTML = '<textarea id="code-textarea" class="input" style="width:100%;height:100%;resize:none;font-family:JetBrains Mono,monospace;font-size:13.5px;line-height:1.7;background:var(--bg-secondary);color:var(--text-primary);border:none;padding:16px;"></textarea>';
    this.editor = null;
  }

  getCode() {
    if (this.editor) {
      return this.editor.state.doc.toString();
    }
    const textarea = document.getElementById('code-textarea');
    return textarea ? textarea.value : '';
  }

  setCode(code) {
    if (this.editor) {
      this.editor.dispatch({
        changes: { from: 0, to: this.editor.state.doc.length, insert: code },
      });
    } else {
      const textarea = document.getElementById('code-textarea');
      if (textarea) textarea.value = code;
    }
  }

  /**
   * Load an example snippet
   */
  loadExample(key) {
    const example = EXAMPLES[key];
    if (!example) return;

    this.setCode(example.code);
    document.getElementById('input-args').value = example.input;

    // Update select if needed
    const select = document.getElementById('example-select');
    if (select.value !== key) select.value = key;
  }

  /**
   * Run the code and generate visualization
   */
  async runCode() {
    const code = this.getCode();
    const inputStr = document.getElementById('input-args').value.trim();

    if (!code.trim()) {
      this.showToast('Please enter some C++ code', 'error');
      return;
    }

    const descEl = document.getElementById('viz-description-text');
    const runBtn = document.getElementById('btn-run');

    // Disable run button during processing
    if (runBtn) {
      runBtn.disabled = true;
      runBtn.querySelector('span:last-child').textContent = 'Running...';
    }

    try {
      // Parse input arguments
      const inputArgs = this.parseInputArgs(inputStr);

      // Lex
      const tokens = lex(code);

      // Parse
      const ast = parse(tokens);

      // Interpret
      const steps = interpret(ast, inputArgs);

      if (steps.length === 0) {
        this.showToast('No execution steps generated. Check your code.', 'error');
        return;
      }
      
      this.hideWelcome();
      this.visualizer.clear();

      // Show loading state for AI explanations
      if (descEl) {
        descEl.innerHTML = '<span class="viz-description__loading">🤖 Generating AI step explanations...</span>';
      }

      // Fetch AI explanations from Gemini
      try {
        const response = await fetch('/api/explain', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code,
            steps: steps.map(s => ({ line: s.line, description: s.description }))
          })
        });
        if (response.ok) {
          const data = await response.json();
          if (data.explanations && Array.isArray(data.explanations)) {
            // Apply explanations, using fallback for any missing ones
            steps.forEach((step, i) => {
              if (i < data.explanations.length && data.explanations[i]) {
                step.description = data.explanations[i];
              }
            });
          }
        } else {
          console.error('AI explanation API returned status:', response.status);
        }
      } catch (err) {
        console.error('Failed to fetch AI explanations:', err);
        this.showToast('AI explanations unavailable, using defaults', 'info');
      }

      // Load steps into playback
      this.currentSteps = steps;
      this.playback.loadSteps(steps);

      // Show first step description
      if (descEl && steps[0]) {
        descEl.textContent = steps[0].description;
      }

      // Show console output (from last step)
      this.updateConsole(steps[steps.length - 1]);

      this.showToast(`Generated ${steps.length} steps with AI explanations`, 'success');

    } catch (err) {
      console.error('Execution error:', err);
      this.showToast(err.message, 'error');
    } finally {
      // Re-enable run button
      if (runBtn) {
        runBtn.disabled = false;
        runBtn.querySelector('span:last-child').textContent = 'Run';
      }
    }
  }

  /**
   * Parse input string into arguments
   * Supports: [1,2,3], "string", 42, [1,2,3], 9
   */
  parseInputArgs(str) {
    if (!str) return [];

    const args = [];
    let i = 0;

    const skipSpaces = () => { while (i < str.length && str[i] === ' ') i++; };

    while (i < str.length) {
      skipSpaces();
      if (i >= str.length) break;

      if (str[i] === '[') {
        // Array
        let depth = 0;
        let start = i;
        while (i < str.length) {
          if (str[i] === '[') depth++;
          if (str[i] === ']') depth--;
          i++;
          if (depth === 0) break;
        }
        const arrStr = str.slice(start, i);
        try {
          args.push(JSON.parse(arrStr));
        } catch {
          args.push([]);
        }
      } else if (str[i] === '"') {
        // String
        i++; // skip opening quote
        let s = '';
        while (i < str.length && str[i] !== '"') {
          if (str[i] === '\\') { s += str[i]; i++; }
          s += str[i];
          i++;
        }
        if (i < str.length) i++; // skip closing quote
        args.push(s);
      } else if (str[i] === '-' || (str[i] >= '0' && str[i] <= '9')) {
        // Number
        let numStr = '';
        if (str[i] === '-') { numStr += str[i]; i++; }
        while (i < str.length && ((str[i] >= '0' && str[i] <= '9') || str[i] === '.')) {
          numStr += str[i];
          i++;
        }
        args.push(numStr.includes('.') ? parseFloat(numStr) : parseInt(numStr, 10));
      } else if (str[i] === 't' && str.slice(i, i + 4) === 'true') {
        args.push(true);
        i += 4;
      } else if (str[i] === 'f' && str.slice(i, i + 5) === 'false') {
        args.push(false);
        i += 5;
      } else {
        i++;
      }

      skipSpaces();
      if (i < str.length && str[i] === ',') i++; // skip comma separator
    }

    return args;
  }

  /**
   * Handle step change from playback controller
   */
  handleStepChange(step, prevStep, index) {
    if (!step) return;

    // Update visualization
    this.visualizer.renderStep(step, prevStep);

    // Update description
    const descEl = document.getElementById('viz-description-text');
    if (descEl) {
      descEl.textContent = step.description || '';
    }

    // Highlight current line in editor
    this.highlightLine(step.line);

    // Update console
    this.updateConsole(step);
  }

  handlePlayStateChange(playing) {
    const runBtn = document.getElementById('btn-run');
    if (runBtn) {
      if (playing) {
        runBtn.classList.add('is-running');
      } else {
        runBtn.classList.remove('is-running');
      }
    }
  }

  /**
   * Highlight a line in the editor
   */
  highlightLine(lineNumber) {
    if (!this.editor || !lineNumber) return;

    // Remove existing decorations by clearing and re-adding
    // CodeMirror 6 line highlighting
    try {
      const doc = this.editor.state.doc;
      if (lineNumber > 0 && lineNumber <= doc.lines) {
        const line = doc.line(lineNumber);

        // Scroll line into view
        this.editor.dispatch({
          effects: [],
          selection: { anchor: line.from },
          scrollIntoView: true,
        });
      }
    } catch { /* ignore highlight errors */ }
  }

  /**
   * Update console output
   */
  updateConsole(step) {
    const consoleBody = document.getElementById('console-body');
    if (!consoleBody || !step) return;

    if (step.console && step.console.length > 0) {
      consoleBody.textContent = step.console.join('');
      consoleBody.parentElement.style.display = 'block';
    } else {
      consoleBody.textContent = '';
    }
  }

  /**
   * Show/hide welcome state
   */
  showWelcome() {
    const welcome = document.getElementById('viz-welcome');
    const vizContainer = document.getElementById('viz-container');
    if (welcome) welcome.style.display = 'flex';
    if (vizContainer) vizContainer.style.display = 'none';
  }

  hideWelcome() {
    const welcome = document.getElementById('viz-welcome');
    const vizContainer = document.getElementById('viz-container');
    if (welcome) welcome.style.display = 'none';
    if (vizContainer) vizContainer.style.display = 'flex';
  }

  /**
   * Show toast notification
   */
  showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast--${type}`;

    const icon = document.createElement('span');
    icon.className = 'toast__icon';
    icon.textContent = type === 'error' ? '✕' : type === 'success' ? '✓' : 'ℹ';

    const msg = document.createElement('span');
    msg.className = 'toast__message';
    msg.textContent = message;

    toast.appendChild(icon);
    toast.appendChild(msg);
    container.appendChild(toast);

    // Auto-remove after 4s
    setTimeout(() => {
      toast.style.animation = `toastOut 0.3s var(--ease-default) forwards`;
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }
}

// ---- Boot ----
const app = new App();
document.addEventListener('DOMContentLoaded', () => app.init());
