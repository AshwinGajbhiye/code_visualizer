// ============================================
// C++ Code Visualizer — Visualization Engine
// ============================================

/**
 * Renders execution step data as animated data structure visualizations
 */
export class Visualizer {
  constructor(container) {
    this.container = container;
    this.currentCards = new Map(); // varName -> DOM element
    this.prevState = null;
  }

  /**
   * Render a single execution step
   */
  renderStep(step, prevStep = null) {
    if (!step || !step.variables) return;

    const vars = step.variables;
    const highlights = step.highlights || {};
    const existingNames = new Set(Object.keys(vars));

    // Remove cards for variables that no longer exist
    for (const [name, card] of this.currentCards) {
      if (!existingNames.has(name)) {
        card.classList.add('fade-out');
        setTimeout(() => card.remove(), 300);
        this.currentCards.delete(name);
      }
    }

    // Render each variable
    for (const [name, varData] of Object.entries(vars)) {
      const highlight = highlights[name];
      const prevVar = prevStep?.variables?.[name];
      const isNew = !this.currentCards.has(name);
      const hasChanged = !prevVar || JSON.stringify(prevVar.value) !== JSON.stringify(varData.value);

      let card = this.currentCards.get(name);

      if (!card) {
        card = this.createCard(name, varData);
        this.container.appendChild(card);
        this.currentCards.set(name, card);
      }

      // Update card content
      this.updateCard(card, name, varData, highlight, hasChanged, isNew);
    }

    this.prevState = step;
  }

  /**
   * Create a new data structure card
   */
  createCard(name, varData) {
    const card = document.createElement('div');
    card.className = 'ds-card';
    card.dataset.var = name;

    const header = document.createElement('div');
    header.className = 'ds-card__header';

    const nameEl = document.createElement('span');
    nameEl.className = 'ds-card__name';
    nameEl.textContent = name;

    const typeEl = document.createElement('span');
    typeEl.className = 'ds-card__type';
    typeEl.textContent = varData.type || 'auto';

    header.appendChild(nameEl);
    header.appendChild(typeEl);

    const body = document.createElement('div');
    body.className = 'ds-card__body';

    card.appendChild(header);
    card.appendChild(body);

    return card;
  }

  /**
   * Update card body content based on display type
   */
  updateCard(card, name, varData, highlight, hasChanged, isNew) {
    const body = card.querySelector('.ds-card__body');

    // Toggle highlight class
    if (highlight) {
      card.classList.add('is-highlighted');
    } else {
      card.classList.remove('is-highlighted');
    }

    // Update type badge
    const typeEl = card.querySelector('.ds-card__type');
    if (typeEl) typeEl.textContent = varData.type || 'auto';

    switch (varData.displayType) {
      case 'array':
        this.renderArray(body, name, varData, highlight, hasChanged);
        break;
      case 'string-array':
        this.renderStringArray(body, name, varData, highlight, hasChanged);
        break;
      case 'map':
        this.renderMap(body, name, varData, highlight, hasChanged);
        break;
      case 'set':
        this.renderSet(body, name, varData, highlight, hasChanged);
        break;
      case 'stack':
        this.renderStack(body, name, varData, highlight, hasChanged);
        break;
      case 'queue':
        this.renderQueue(body, name, varData, highlight, hasChanged);
        break;
      case 'pair':
        this.renderPair(body, name, varData, highlight, hasChanged);
        break;
      case 'scalar':
      default:
        this.renderScalar(body, name, varData, highlight, hasChanged);
        break;
    }
  }

  /**
   * Render scalar variable (int, float, bool, char, short string)
   */
  renderScalar(body, name, varData, highlight, hasChanged) {
    body.innerHTML = '';

    const scalar = document.createElement('div');
    scalar.className = 'scalar';
    if (highlight) scalar.classList.add('is-highlighted');
    if (hasChanged) scalar.classList.add('is-changed');

    const val = varData.value;
    if (val === null || val === undefined) {
      scalar.textContent = 'null';
    } else if (typeof val === 'boolean') {
      scalar.textContent = val ? 'true' : 'false';
    } else if (typeof val === 'number') {
      scalar.textContent = val;
    } else if (typeof val === 'string') {
      // Only show quotes for actual string types, not single chars
      const type = (varData.type || '').toLowerCase();
      if (type === 'char' && val.length <= 1) {
        scalar.textContent = `'${val}'`;
      } else {
        scalar.textContent = val;
      }
    } else {
      scalar.textContent = String(val);
    }

    body.appendChild(scalar);
  }

  /**
   * Render array/vector as horizontal cells
   */
  renderArray(body, name, varData, highlight, hasChanged) {
    const arr = Array.isArray(varData.value) ? varData.value : [];
    const highlightIndices = highlight?.indices || [];

    body.innerHTML = '';

    if (arr.length === 0) {
      body.appendChild(this.createEmptyState('Empty'));
      return;
    }

    const container = document.createElement('div');
    container.className = 'cell-container';

    // Cells row
    const cellRow = document.createElement('div');
    cellRow.className = 'cell-row';

    arr.forEach((val, i) => {
      const cell = document.createElement('div');
      cell.className = 'cell';

      if (highlightIndices.includes(i)) {
        cell.classList.add('is-highlighted');
      }

      // Determine display value
      if (typeof val === 'string') {
        cell.textContent = val;
      } else if (typeof val === 'boolean') {
        cell.textContent = val ? 'T' : 'F';
      } else if (val === null || val === undefined) {
        cell.textContent = '—';
        cell.style.opacity = '0.3';
      } else {
        cell.textContent = val;
      }

      cellRow.appendChild(cell);
    });

    // Index row
    const indexRow = document.createElement('div');
    indexRow.className = 'cell-indices';

    arr.forEach((_, i) => {
      const idx = document.createElement('div');
      idx.className = 'cell-index';
      idx.textContent = i;
      indexRow.appendChild(idx);
    });

    container.appendChild(cellRow);
    container.appendChild(indexRow);

    // Pointer row (if highlight has pointer info)
    if (highlight?.pointers) {
      const pointerRow = document.createElement('div');
      pointerRow.className = 'pointer-row';

      arr.forEach((_, i) => {
        const slot = document.createElement('div');
        slot.className = 'pointer-slot';

        const pointersAtIndex = [];
        for (const [pName, pIdx] of Object.entries(highlight.pointers)) {
          if (pIdx === i) pointersAtIndex.push(pName);
        }

        if (pointersAtIndex.length > 0) {
          const arrow = document.createElement('div');
          arrow.className = 'pointer-arrow';
          arrow.textContent = '▲';
          slot.appendChild(arrow);

          pointersAtIndex.forEach((pName, j) => {
            const label = document.createElement('div');
            const classes = ['pointer-label--primary', 'pointer-label--secondary', 'pointer-label--highlight'];
            label.className = `pointer-label ${classes[j % classes.length]}`;
            label.textContent = pName;
            slot.appendChild(label);
          });
        }

        pointerRow.appendChild(slot);
      });

      container.appendChild(pointerRow);
    }

    body.appendChild(container);
  }

  /**
   * Render string as array of characters
   */
  renderStringArray(body, name, varData, highlight, hasChanged) {
    const str = typeof varData.value === 'string' ? varData.value : '';
    // Convert to array format and reuse array renderer
    const arrayData = {
      ...varData,
      value: str.split(''),
      displayType: 'array',
    };
    this.renderArray(body, name, arrayData, highlight, hasChanged);
  }

  /**
   * Render map as key-value table
   */
  renderMap(body, name, varData, highlight, hasChanged) {
    const mapVal = varData.value;
    body.innerHTML = '';

    const entries = mapVal instanceof Map ? [...mapVal] :
      (typeof mapVal === 'object' && mapVal !== null) ? Object.entries(mapVal) : [];

    if (entries.length === 0) {
      body.appendChild(this.createEmptyState('Empty'));
      return;
    }

    const table = document.createElement('table');
    table.className = 'map-table';

    // Header
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    const thKey = document.createElement('th');
    thKey.textContent = 'Key';
    const thVal = document.createElement('th');
    thVal.textContent = 'Value';
    headerRow.appendChild(thKey);
    headerRow.appendChild(thVal);
    thead.appendChild(headerRow);
    table.appendChild(thead);

    // Body
    const tbody = document.createElement('tbody');
    const highlightKeys = highlight?.keys || [];

    entries.forEach(([key, val]) => {
      const row = document.createElement('tr');

      if (highlightKeys.includes(key)) {
        row.classList.add('is-highlighted');
      }

      const tdKey = document.createElement('td');
      tdKey.textContent = typeof key === 'string' ? `"${key}"` : key;

      const tdVal = document.createElement('td');
      tdVal.textContent = typeof val === 'string' ? `"${val}"` : val;

      row.appendChild(tdKey);
      row.appendChild(tdVal);
      tbody.appendChild(row);
    });

    table.appendChild(tbody);
    body.appendChild(table);
  }

  /**
   * Render set as pill badges
   */
  renderSet(body, name, varData, highlight, hasChanged) {
    const setVal = varData.value;
    body.innerHTML = '';

    const items = setVal instanceof Set ? [...setVal] :
      Array.isArray(setVal) ? setVal : [];

    if (items.length === 0) {
      body.appendChild(this.createEmptyState('Empty'));
      return;
    }

    const container = document.createElement('div');
    container.className = 'set-container';

    const highlightItems = highlight?.items || [];

    items.forEach(item => {
      const el = document.createElement('div');
      el.className = 'set-item';

      if (highlightItems.includes(item)) {
        el.classList.add('is-highlighted');
        el.classList.add('pop-in');
      }

      el.textContent = typeof item === 'string' ? `"${item}"` : item;
      container.appendChild(el);
    });

    body.appendChild(container);
  }

  /**
   * Render stack as vertical pile
   */
  renderStack(body, name, varData, highlight, hasChanged) {
    const arr = Array.isArray(varData.value) ? varData.value : [];
    body.innerHTML = '';

    if (arr.length === 0) {
      body.appendChild(this.createEmptyState('Empty'));
      return;
    }

    const container = document.createElement('div');
    container.className = 'stack-container';

    arr.forEach((val, i) => {
      const item = document.createElement('div');
      item.className = 'stack-item';
      item.textContent = typeof val === 'string' ? `"${val}"` : val;

      if (i === arr.length - 1) {
        const topLabel = document.createElement('span');
        topLabel.style.cssText = 'font-size: 0.6rem; color: var(--text-muted); margin-left: 8px;';
        topLabel.textContent = '← top';
        item.appendChild(topLabel);
      }

      container.appendChild(item);
    });

    body.appendChild(container);
  }

  /**
   * Render queue as horizontal items with front/back labels
   */
  renderQueue(body, name, varData, highlight, hasChanged) {
    const arr = Array.isArray(varData.value) ? varData.value : [];
    body.innerHTML = '';

    if (arr.length === 0) {
      body.appendChild(this.createEmptyState('Empty'));
      return;
    }

    const container = document.createElement('div');
    container.className = 'queue-container';

    const frontLabel = document.createElement('span');
    frontLabel.className = 'queue-label';
    frontLabel.textContent = 'front →';
    container.appendChild(frontLabel);

    arr.forEach((val, i) => {
      const item = document.createElement('div');
      item.className = 'queue-item';
      item.textContent = typeof val === 'string' ? `"${val}"` : val;
      container.appendChild(item);
    });

    const backLabel = document.createElement('span');
    backLabel.className = 'queue-label';
    backLabel.textContent = '← back';
    container.appendChild(backLabel);

    body.appendChild(container);
  }

  /**
   * Render pair as two connected cells
   */
  renderPair(body, name, varData, highlight, hasChanged) {
    const arr = Array.isArray(varData.value) ? varData.value : [0, 0];
    body.innerHTML = '';

    const container = document.createElement('div');
    container.style.cssText = 'display: flex; gap: 4px; align-items: center;';

    ['first', 'second'].forEach((label, i) => {
      const wrapper = document.createElement('div');
      wrapper.style.cssText = 'display: flex; flex-direction: column; align-items: center; gap: 4px;';

      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.textContent = arr[i] !== undefined ? arr[i] : '—';

      const labelEl = document.createElement('div');
      labelEl.className = 'cell-index';
      labelEl.textContent = label;

      wrapper.appendChild(cell);
      wrapper.appendChild(labelEl);
      container.appendChild(wrapper);

      if (i === 0) {
        const connector = document.createElement('div');
        connector.style.cssText = 'color: var(--text-muted); font-size: 0.8rem; margin-bottom: 18px;';
        connector.textContent = ',';
        container.appendChild(connector);
      }
    });

    body.appendChild(container);
  }

  /**
   * Create empty state placeholder
   */
  createEmptyState(text = 'Empty') {
    const el = document.createElement('div');
    el.className = 'empty-state';
    el.textContent = text;
    return el;
  }

  /**
   * Clear all visualizations
   */
  clear() {
    this.container.innerHTML = '';
    this.currentCards.clear();
    this.prevState = null;
  }
}
