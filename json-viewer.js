class JSONViewer {
  constructor(container) {
    this.container = container;
  }

  render(data, expanded = true) {
    this.container.innerHTML = '';
    const jsonElement = this.createElement(data, expanded);
    this.container.appendChild(jsonElement);
  }

  createElement(data, expanded = true, key = null, level = 0) {
    const wrapper = document.createElement('div');
    wrapper.className = 'json-item';
    wrapper.style.marginLeft = `${level * 20}px`;

    if (data === null) {
      wrapper.innerHTML = `${key ? `<span class="json-key">"${key}"</span>: ` : ''}<span class="json-null">null</span>`;
    } else if (typeof data === 'boolean') {
      wrapper.innerHTML = `${key ? `<span class="json-key">"${key}"</span>: ` : ''}<span class="json-boolean">${data}</span>`;
    } else if (typeof data === 'number') {
      wrapper.innerHTML = `${key ? `<span class="json-key">"${key}"</span>: ` : ''}<span class="json-number">${data}</span>`;
    } else if (typeof data === 'string') {
      wrapper.innerHTML = `${key ? `<span class="json-key">"${key}"</span>: ` : ''}<span class="json-string">"${this.escapeHtml(data)}"</span>`;
    } else if (Array.isArray(data)) {
      const toggle = document.createElement('span');
      toggle.className = 'json-toggle';
      toggle.textContent = expanded ? '▼' : '▶';
      toggle.style.cursor = 'pointer';
      toggle.style.marginRight = '5px';

      const keySpan = key ? `<span class="json-key">"${key}"</span>: ` : '';
      const bracket = document.createElement('span');
      bracket.innerHTML = `${keySpan}<span class="json-bracket">[</span> <span class="json-length">(${data.length} items)</span>`;

      const content = document.createElement('div');
      content.className = 'json-content';
      content.style.display = expanded ? 'block' : 'none';

      data.forEach((item, index) => {
        const itemElement = this.createElement(item, true, null, level + 1);
        if (index < data.length - 1) {
          const comma = document.createElement('span');
          comma.textContent = ',';
          comma.style.color = '#666';
          itemElement.appendChild(comma);
        }
        content.appendChild(itemElement);
      });

      const closeBracket = document.createElement('div');
      closeBracket.style.marginLeft = `${level * 20}px`;
      closeBracket.innerHTML = '<span class="json-bracket">]</span>';
      content.appendChild(closeBracket);

      toggle.addEventListener('click', (e) => {
        e.stopPropagation();
        const isExpanded = content.style.display === 'block';
        content.style.display = isExpanded ? 'none' : 'block';
        toggle.textContent = isExpanded ? '▶' : '▼';
      });

      wrapper.appendChild(toggle);
      wrapper.appendChild(bracket);
      wrapper.appendChild(content);
    } else if (typeof data === 'object') {
      const keys = Object.keys(data);
      const toggle = document.createElement('span');
      toggle.className = 'json-toggle';
      toggle.textContent = expanded ? '▼' : '▶';
      toggle.style.cursor = 'pointer';
      toggle.style.marginRight = '5px';

      const keySpan = key ? `<span class="json-key">"${key}"</span>: ` : '';
      const brace = document.createElement('span');
      brace.innerHTML = `${keySpan}<span class="json-bracket">{</span> <span class="json-length">(${keys.length} properties)</span>`;

      const content = document.createElement('div');
      content.className = 'json-content';
      content.style.display = expanded ? 'block' : 'none';

      keys.forEach((objKey, index) => {
        const itemElement = this.createElement(data[objKey], true, objKey, level + 1);
        if (index < keys.length - 1) {
          const comma = document.createElement('span');
          comma.textContent = ',';
          comma.style.color = '#666';
          itemElement.appendChild(comma);
        }
        content.appendChild(itemElement);
      });

      const closeBrace = document.createElement('div');
      closeBrace.style.marginLeft = `${level * 20}px`;
      closeBrace.innerHTML = '<span class="json-bracket">}</span>';
      content.appendChild(closeBrace);

      toggle.addEventListener('click', (e) => {
        e.stopPropagation();
        const isExpanded = content.style.display === 'block';
        content.style.display = isExpanded ? 'none' : 'block';
        toggle.textContent = isExpanded ? '▶' : '▼';
      });

      wrapper.appendChild(toggle);
      wrapper.appendChild(brace);
      wrapper.appendChild(content);
    }

    return wrapper;
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}