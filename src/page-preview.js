const template = document.createElement('template');
template.innerHTML = `
  <style>
    :host {
      display: block;
      max-width: 28rem;
      margin: 0.5rem 0;
      font-family: system-ui, sans-serif;
    }
    .card {
      padding: 0.75rem 1rem;
      border: 1px solid #c8ccd0;
      border-radius: 8px;
      background: #fff;
      color: #1f2328;
    }
    a {
      display: block;
      font-weight: 600;
      color: #0b57d0;
      word-break: break-word;
    }
    .row { margin-top: 0.4rem; font-size: 0.9rem; }
    .label { color: #5f6368; }
    .message { margin-top: 0.4rem; font-size: 0.9rem; color: #5f6368; }
    :host([data-status="error"]) .card { border-color: #d93025; }
    :host([data-status="error"]) .message { color: #d93025; }
    :host([data-status="loading"]) .card { opacity: 0.7; }
  </style>
  <div class="card">
    <a part="link" href="#"></a>
    <div class="row">
      <span class="label">Название:</span>
      <span part="title"></span>
    </div>
    <div class="row">
      <span class="label">Заголовок:</span>
      <span part="heading"></span>
    </div>
    <div class="message" part="message"></div>
  </div>
`;

class PagePreview extends HTMLElement {
  static get observedAttributes() {
    return ['src'];
  }

  constructor() {
    super();
    // Состояние загрузки
    this._controller = null;   // AbortController текущего запроса
    this._generation = 0;      // счетчик поколений запросов
    this._activeKey = undefined; // src, для которого загрузка уже запущена

    // Открытый Shadow DOM и отдельная копия шаблона для каждого экземпляра
    this._root = this.attachShadow({ mode: 'open' });
    this._root.appendChild(template.content.cloneNode(true));

    // Ссылки на элементы
    this._link = this._root.querySelector('[part="link"]');
    this._title = this._root.querySelector('[part="title"]');
    this._heading = this._root.querySelector('[part="heading"]');
    this._message = this._root.querySelector('[part="message"]');
  }

  connectedCallback() {
    this._load();
  }

  disconnectedCallback() {
    // Отменяем запрос и делаем его результат устаревшим
    this._generation++;
    if (this._controller) {
      this._controller.abort();
      this._controller = null;
    }
    // Чтобы после повторного подключения загрузка началась заново
    this._activeKey = undefined;
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (name === 'src' && this.isConnected && oldValue !== newValue) {
      this._load();
    }
  }

  _setStatus(status) {
    this.setAttribute('data-status', status);
  }

  _showError(message) {
    this._message.textContent = message;
    this._setStatus('error');
  }

  async _load() {
    const src = this.getAttribute('src');
    const key = src === null ? '' : src;

    // Защита от двух одинаковых начальных запросов
    if (this._activeKey === key) return;
    this._activeKey = key;

    // Отменяем предыдущий запрос и начинаем новое поколение
    if (this._controller) this._controller.abort();
    const generation = ++this._generation;
    const controller = new AbortController();
    this._controller = controller;

    // Результат актуален, только если элемент подключен и запрос не устарел
    const isStale = () => generation !== this._generation || !this.isConnected;

    // Сброс предыдущих данных
    this._message.textContent = '';
    this._title.textContent = '';
    this._heading.textContent = '';

    if (!src || !src.trim()) {
      this._link.removeAttribute('href');
      this._link.textContent = 'Адрес не указан';
      this._controller = null;
      this._showError('Не задан атрибут src');
      return;
    }

    this._setStatus('loading');

    try {
      const url = new URL(src, document.baseURI).href;
      this._link.href = url;
      this._link.textContent = url;

      const response = await fetch(url, { signal: controller.signal });
      if (isStale()) return;
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const html = await response.text();
      if (isStale()) return;

      // Разбор чужого HTML в отдельный документ, без вставки в страницу
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const title = doc.title.trim();
      const h1 = doc.querySelector('h1');
      const heading = h1 ? h1.textContent.trim() : '';

      // Только textContent: значения остаются текстом
      this._title.textContent = title || 'Название отсутствует';
      this._heading.textContent = heading || 'Заголовок отсутствует';
      this._link.textContent = title || url;
      this._controller = null;
      this._setStatus('ready');
    } catch (error) {
      // Отмененные и устаревшие запросы ничего не меняют
      if (error.name === 'AbortError' || isStale()) return;
      this._controller = null;
      this._showError(`Не удалось загрузить страницу: ${error.message}`);
    }
  }
}

customElements.define('page-preview', PagePreview);

export { PagePreview };