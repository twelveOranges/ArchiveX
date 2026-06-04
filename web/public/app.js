// ==================== ArchiveX Web App ====================
// Standalone web frontend for ArchiveX databases

const API_BASE = "";

// ==================== State ====================
let currentDb = null; // { name, schema, records }
let currentMode = "card";
let cardSize = 120;
let imagesFieldFilter = [];
let lightboxImages = [];
let lightboxIndex = 0;

// ==================== Init ====================
document.addEventListener("DOMContentLoaded", () => {
  renderHomePage();
});

// Keyboard navigation for lightbox
document.addEventListener("keydown", (e) => {
  const lb = document.getElementById("lightbox");
  if (!lb.classList.contains("hidden")) {
    if (e.key === "Escape") closeLightbox();
    if (e.key === "ArrowLeft") lightboxPrev();
    if (e.key === "ArrowRight") lightboxNext();
  }
  // Close modal on Escape
  const overlay = document.getElementById("modal-overlay");
  if (!overlay.classList.contains("hidden") && e.key === "Escape") {
    overlay.classList.add("hidden");
  }
});

// ==================== API Helpers ====================
async function api(method, path, body = null) {
  const opts = { method, headers: {} };
  if (body && !(body instanceof FormData)) {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body);
  } else if (body instanceof FormData) {
    opts.body = body;
  }
  const res = await fetch(`${API_BASE}${path}`, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || "Request failed");
  }
  return res.json();
}

function getAssetUrl(relativePath) {
  if (!relativePath) return "";
  if (relativePath.startsWith("http")) return relativePath;
  // Strip 'archive-x/' or '.archive-x/' prefix if present (from Obsidian backups)
  let cleanPath = relativePath;
  if (cleanPath.startsWith("archive-x/")) {
    cleanPath = cleanPath.slice("archive-x/".length);
  } else if (cleanPath.startsWith(".archive-x/")) {
    cleanPath = cleanPath.slice(".archive-x/".length);
  }
  return `${API_BASE}/api/assets/${cleanPath}`;
}

// ==================== Modal Helpers ====================
function showModal(renderFn) {
  const overlay = document.getElementById("modal-overlay");
  const content = document.getElementById("modal-content");
  content.innerHTML = "";
  renderFn(content);
  overlay.classList.remove("hidden");
}

function closeModal(event) {
  if (event && event.target !== event.currentTarget) return;
  document.getElementById("modal-overlay").classList.add("hidden");
}

function hideModal() {
  document.getElementById("modal-overlay").classList.add("hidden");
}

// ==================== Lightbox ====================
function openLightbox(images, index) {
  lightboxImages = images;
  lightboxIndex = index;
  const lb = document.getElementById("lightbox");
  lb.classList.remove("hidden");
  updateLightbox();
}

function closeLightbox() {
  document.getElementById("lightbox").classList.add("hidden");
}

function lightboxPrev() {
  if (lightboxImages.length === 0) return;
  lightboxIndex = (lightboxIndex - 1 + lightboxImages.length) % lightboxImages.length;
  updateLightbox();
}

function lightboxNext() {
  if (lightboxImages.length === 0) return;
  lightboxIndex = (lightboxIndex + 1) % lightboxImages.length;
  updateLightbox();
}

function updateLightbox() {
  const img = document.getElementById("lightbox-img");
  const counter = document.getElementById("lightbox-counter");
  img.src = lightboxImages[lightboxIndex];
  counter.textContent = `${lightboxIndex + 1} / ${lightboxImages.length}`;
}

// ==================== Home Page ====================
async function renderHomePage() {
  currentDb = null;
  const container = document.getElementById("main-container");
  container.innerHTML = "";

  const header = document.createElement("div");
  header.className = "archivex-home-header";
  header.innerHTML = `
    <h2>🗄️ ArchiveX Databases</h2>
    <div class="archivex-home-actions">
      <button class="archivex-btn" onclick="showBackupRestore()">⚙️ Backup</button>
    </div>
  `;
  container.appendChild(header);

  const grid = document.createElement("div");
  grid.className = "archivex-db-grid";
  container.appendChild(grid);

  try {
    const databases = await api("GET", "/api/databases");
    for (const db of databases) {
      renderDatabaseCard(grid, db);
    }
  } catch (e) {
    console.error("Failed to load databases:", e);
  }

  // Create card
  const createCard = document.createElement("div");
  createCard.className = "archivex-db-card archivex-db-card-create";
  createCard.innerHTML = `
    <div class="archivex-db-card-create-icon">+</div>
    <div class="archivex-db-card-create-text">New Database</div>
  `;
  createCard.onclick = () => showCreateDatabaseDialog();
  grid.appendChild(createCard);
}

function renderDatabaseCard(grid, db) {
  const card = document.createElement("div");
  card.className = "archivex-db-card";
  card.innerHTML = `
    <div class="archivex-db-card-actions">
      <button class="archivex-db-card-action-btn" title="Edit" onclick="event.stopPropagation(); showEditDatabaseDialog('${db.name}')">✏️</button>
      <button class="archivex-db-card-action-btn archivex-db-card-delete-btn" title="Delete" onclick="event.stopPropagation(); confirmDeleteDatabase('${db.name}')">🗑️</button>
    </div>
    <div class="archivex-db-card-icon">🗄️</div>
    <div class="archivex-db-card-info">
      <h3>${escapeHtml(db.name)}</h3>
      <div class="archivex-db-card-meta">${db.recordCount} records · ${db.fieldCount} fields</div>
    </div>
  `;
  card.onclick = () => openDatabase(db.name);
  grid.appendChild(card);
}

// ==================== Create Database Dialog ====================
function showCreateDatabaseDialog() {
  showModal((content) => {
    content.innerHTML = `
      <div class="modal-title">Create New Database</div>
      <div class="modal-group">
        <label class="modal-label">Database Name</label>
        <input type="text" class="modal-input" id="create-db-name" placeholder="Enter database name...">
      </div>
      <div class="modal-group">
        <label class="modal-label">Fields</label>
        <div id="create-db-fields" class="archivex-field-list"></div>
        <button class="archivex-add-field-btn" onclick="showAddFieldMenu('create-db-fields', 'create')">
          <span>+</span> Add Field
        </button>
        <div id="create-field-type-menu"></div>
      </div>
      <div class="modal-actions">
        <button class="archivex-btn" onclick="hideModal()">Cancel</button>
        <button class="archivex-btn archivex-btn-primary" onclick="createDatabase()">Create</button>
      </div>
    `;
    // Add default title field
    addFieldRow("create-db-fields", { name: "title", type: "text", label: "Title" });
  });
}

let tempFields = [];

function addFieldRow(containerId, field) {
  const container = document.getElementById(containerId);
  const row = document.createElement("div");
  row.className = "archivex-field-row";
  row.dataset.name = field.name;
  row.dataset.type = field.type;
  row.dataset.label = field.label;
  row.innerHTML = `
    <span class="archivex-field-row-icon">${getFieldIcon(field.type)}</span>
    <span class="archivex-field-row-label">${escapeHtml(field.label || field.name)}</span>
    <span class="archivex-field-row-type">${field.type}</span>
    <div class="archivex-field-row-actions">
      <button class="archivex-field-action-btn archivex-field-edit-btn" onclick="editFieldRow(this)">Edit</button>
      <button class="archivex-field-action-btn archivex-field-delete-btn" onclick="deleteFieldRow(this)">Delete</button>
    </div>
  `;
  container.appendChild(row);
}

function editFieldRow(btn) {
  const row = btn.closest(".archivex-field-row");
  const oldName = row.dataset.name;
  const oldLabel = row.dataset.label;
  const oldType = row.dataset.type;

  showModal((content) => {
    content.innerHTML = `
      <div class="modal-title">Edit Field</div>
      <div class="modal-group">
        <label class="modal-label">Field Name (ID)</label>
        <input type="text" class="modal-input" id="edit-field-name" value="${escapeHtml(oldName)}">
      </div>
      <div class="modal-group">
        <label class="modal-label">Label</label>
        <input type="text" class="modal-input" id="edit-field-label" value="${escapeHtml(oldLabel)}">
      </div>
      <div class="modal-group">
        <label class="modal-label">Type</label>
        <select class="modal-input" id="edit-field-type">
          ${getFieldTypeOptions(oldType)}
        </select>
      </div>
      <div class="modal-actions">
        <button class="archivex-btn" onclick="hideModal()">Cancel</button>
        <button class="archivex-btn archivex-btn-primary" onclick="saveFieldEdit(this)" data-row-name="${escapeHtml(oldName)}">Save</button>
      </div>
    `;
  });
}

function saveFieldEdit(btn) {
  const name = document.getElementById("edit-field-name").value.trim();
  const label = document.getElementById("edit-field-label").value.trim();
  const type = document.getElementById("edit-field-type").value;
  const oldName = btn.dataset.rowName;

  if (!name) return alert("Field name is required");

  // Find and update the row
  const rows = document.querySelectorAll(".archivex-field-row");
  for (const row of rows) {
    if (row.dataset.name === oldName) {
      row.dataset.name = name;
      row.dataset.type = type;
      row.dataset.label = label || name;
      row.querySelector(".archivex-field-row-icon").textContent = getFieldIcon(type);
      row.querySelector(".archivex-field-row-label").textContent = label || name;
      row.querySelector(".archivex-field-row-type").textContent = type;
      break;
    }
  }
  hideModal();
}

function deleteFieldRow(btn) {
  const row = btn.closest(".archivex-field-row");
  row.remove();
}

function showAddFieldMenu(containerId, prefix) {
  const menuContainer = document.getElementById(`${prefix}-field-type-menu`);
  if (menuContainer.children.length > 0) {
    menuContainer.innerHTML = "";
    return;
  }

  const types = [
    { type: "text", icon: "📝", label: "Text" },
    { type: "integer", icon: "🔢", label: "Integer" },
    { type: "number", icon: "🔣", label: "Real Number" },
    { type: "date", icon: "📅", label: "Date" },
    { type: "select", icon: "📋", label: "Select" },
    { type: "multiselect", icon: "☑️", label: "Multi-Select" },
    { type: "checkbox", icon: "✅", label: "Checkbox" },
    { type: "image", icon: "🖼️", label: "Image" },
    { type: "video", icon: "🎬", label: "Video" },
    { type: "audio", icon: "🎵", label: "Audio" },
    { type: "url", icon: "🔗", label: "URL" },
    { type: "tags", icon: "🏷️", label: "Tags" },
  ];

  const menu = document.createElement("div");
  menu.className = "archivex-type-menu";
  for (const t of types) {
    const item = document.createElement("div");
    item.className = "archivex-type-menu-item";
    item.innerHTML = `<span>${t.icon}</span><span>${t.label}</span>`;
    item.onclick = () => {
      const fieldName = prompt(`Enter field name for "${t.label}":`);
      if (!fieldName) return;
      addFieldRow(containerId, { name: fieldName.toLowerCase().replace(/\s+/g, "_"), type: t.type, label: fieldName });
      menuContainer.innerHTML = "";
    };
    menu.appendChild(item);
  }
  menuContainer.appendChild(menu);
}

function getFieldsFromContainer(containerId) {
  const container = document.getElementById(containerId);
  const rows = container.querySelectorAll(".archivex-field-row");
  return Array.from(rows).map((row) => ({
    name: row.dataset.name,
    type: row.dataset.type,
    label: row.dataset.label,
  }));
}

async function createDatabase() {
  const name = document.getElementById("create-db-name").value.trim();
  if (!name) return alert("Database name is required");

  const fields = getFieldsFromContainer("create-db-fields");
  if (fields.length === 0) return alert("At least one field is required");

  try {
    await api("POST", "/api/databases", { name, fields });
    hideModal();
    renderHomePage();
  } catch (e) {
    alert("Failed to create database: " + e.message);
  }
}

// ==================== Edit Database Dialog ====================
async function showEditDatabaseDialog(dbName) {
  try {
    const db = await api("GET", `/api/databases/${encodeURIComponent(dbName)}`);
    showModal((content) => {
      content.innerHTML = `
        <div class="modal-title">Edit Database</div>
        <div class="modal-group">
          <label class="modal-label">Database Name</label>
          <input type="text" class="modal-input" id="edit-db-name" value="${escapeHtml(dbName)}">
        </div>
        <div class="modal-group">
          <label class="modal-label">Fields</label>
          <div id="edit-db-fields" class="archivex-field-list"></div>
          <button class="archivex-add-field-btn" onclick="showAddFieldMenu('edit-db-fields', 'edit')">
            <span>+</span> Add Field
          </button>
          <div id="edit-field-type-menu"></div>
        </div>
        <div class="modal-actions">
          <button class="archivex-btn" onclick="hideModal()">Cancel</button>
          <button class="archivex-btn archivex-btn-primary" onclick="saveEditDatabase('${escapeHtml(dbName)}')">Save</button>
        </div>
      `;
      // Populate existing fields
      for (const field of db.schema.fields) {
        addFieldRow("edit-db-fields", field);
      }
    });
  } catch (e) {
    alert("Failed to load database: " + e.message);
  }
}

async function saveEditDatabase(oldName) {
  const newName = document.getElementById("edit-db-name").value.trim();
  if (!newName) return alert("Database name is required");

  const fields = getFieldsFromContainer("edit-db-fields");
  if (fields.length === 0) return alert("At least one field is required");

  try {
    await api("PUT", `/api/databases/${encodeURIComponent(oldName)}`, { newName, fields });
    hideModal();
    if (currentDb && currentDb.name === oldName) {
      openDatabase(newName);
    } else {
      renderHomePage();
    }
  } catch (e) {
    alert("Failed to save: " + e.message);
  }
}

// ==================== Delete Database ====================
function confirmDeleteDatabase(dbName) {
  showModal((content) => {
    content.innerHTML = `
      <div class="modal-title">Delete Database</div>
      <p>Are you sure you want to delete "<strong>${escapeHtml(dbName)}</strong>"? This action cannot be undone.</p>
      <div class="modal-actions">
        <button class="archivex-btn" onclick="hideModal()">Cancel</button>
        <button class="archivex-btn archivex-btn-danger" onclick="deleteDatabase('${escapeHtml(dbName)}')">Delete</button>
      </div>
    `;
  });
}

async function deleteDatabase(dbName) {
  try {
    await api("DELETE", `/api/databases/${encodeURIComponent(dbName)}`);
    hideModal();
    renderHomePage();
  } catch (e) {
    alert("Failed to delete: " + e.message);
  }
}

// ==================== Open Database (Detail Page) ====================
async function openDatabase(dbName) {
  try {
    const db = await api("GET", `/api/databases/${encodeURIComponent(dbName)}`);
    currentDb = db;
    currentDb.name = dbName;
    imagesFieldFilter = [];
    renderDatabaseDetail();
  } catch (e) {
    alert("Failed to open database: " + e.message);
  }
}

function renderDatabaseDetail() {
  const container = document.getElementById("main-container");
  container.innerHTML = "";

  // Header
  const header = document.createElement("div");
  header.className = "archivex-detail-header";

  const title = document.createElement("h2");
  title.className = "archivex-detail-title";
  title.textContent = currentDb.name;
  header.appendChild(title);

  // Nav bar
  const nav = document.createElement("div");
  nav.className = "archivex-detail-nav";

  const backBtn = document.createElement("button");
  backBtn.className = "archivex-btn-text";
  backBtn.textContent = "← Back";
  backBtn.onclick = () => renderHomePage();
  nav.appendChild(backBtn);

  const rightControls = document.createElement("div");
  rightControls.className = "archivex-nav-right";

  // Size controls
  const sizeControls = document.createElement("div");
  sizeControls.className = "archivex-size-controls";
  const minusBtn = document.createElement("button");
  minusBtn.className = "archivex-size-btn";
  minusBtn.textContent = "−";
  const sizeLabel = document.createElement("span");
  sizeLabel.className = "archivex-size-label";
  sizeLabel.textContent = cardSize;
  const plusBtn = document.createElement("button");
  plusBtn.className = "archivex-size-btn";
  plusBtn.textContent = "+";

  minusBtn.onclick = () => {
    if (cardSize > 60) { cardSize -= 20; sizeLabel.textContent = cardSize; applyCardSize(); }
  };
  plusBtn.onclick = () => {
    if (cardSize < 300) { cardSize += 20; sizeLabel.textContent = cardSize; applyCardSize(); }
  };

  sizeControls.appendChild(minusBtn);
  sizeControls.appendChild(sizeLabel);
  sizeControls.appendChild(plusBtn);
  rightControls.appendChild(sizeControls);

  // View mode select
  const viewSelect = document.createElement("select");
  viewSelect.className = "archivex-view-select";
  const modes = [
    { value: "card", label: "Cards" },
    { value: "images", label: "Images" },
    { value: "table", label: "Table" },
    { value: "list", label: "List" },
  ];
  for (const mode of modes) {
    const opt = document.createElement("option");
    opt.value = mode.value;
    opt.textContent = mode.label;
    if (mode.value === currentMode) opt.selected = true;
    viewSelect.appendChild(opt);
  }
  viewSelect.onchange = () => { currentMode = viewSelect.value; renderContent(); };
  rightControls.appendChild(viewSelect);

  nav.appendChild(rightControls);
  header.appendChild(nav);
  container.appendChild(header);

  // Content area
  const contentArea = document.createElement("div");
  contentArea.id = "db-content";
  container.appendChild(contentArea);

  renderContent();
}

function renderContent() {
  const contentArea = document.getElementById("db-content");
  if (!contentArea) return;
  contentArea.innerHTML = "";

  switch (currentMode) {
    case "card": renderCardView(contentArea); break;
    case "images": renderImagesView(contentArea); break;
    case "table": renderTableView(contentArea); break;
    case "list": renderListView(contentArea); break;
  }
}

function applyCardSize() {
  const grid = document.querySelector(".archivex-card-grid");
  if (grid) {
    grid.style.gridTemplateColumns = `repeat(auto-fill, minmax(${cardSize}px, 1fr))`;
  }
}

// ==================== Card View ====================
function renderCardView(content) {
  if (!currentDb) return;
  const grid = document.createElement("div");
  grid.className = "archivex-card-grid";
  grid.style.gridTemplateColumns = `repeat(auto-fill, minmax(${cardSize}px, 1fr))`;

  for (let i = 0; i < currentDb.records.length; i++) {
    renderRecordCard(grid, currentDb.records[i], i);
  }

  // Add card
  const addCard = document.createElement("div");
  addCard.className = "archivex-card archivex-add-card";
  addCard.innerHTML = `
    <div class="archivex-add-card-content">
      <div class="archivex-db-card-create-icon">+</div>
      <div class="archivex-db-card-create-text">Add Record</div>
    </div>
  `;
  addCard.onclick = () => showAddRecordDialog();
  grid.appendChild(addCard);

  content.appendChild(grid);
}

function renderRecordCard(grid, record, index) {
  const fields = currentDb.schema.fields;
  const card = document.createElement("div");
  card.className = "archivex-card";

  // Cover image
  const imageField = fields.find((f) => f.type === "image");
  const coverDiv = document.createElement("div");
  coverDiv.className = "archivex-card-cover";

  if (imageField && record[imageField.name]) {
    const value = record[imageField.name];
    const firstPath = Array.isArray(value) ? value[0] : String(value);
    if (firstPath) {
      const img = document.createElement("img");
      img.src = getAssetUrl(firstPath);
      img.alt = firstPath;
      img.onerror = () => { img.style.display = "none"; coverDiv.innerHTML = '<div class="archivex-card-cover-placeholder">📄</div>'; };
      coverDiv.appendChild(img);
    } else {
      coverDiv.innerHTML = '<div class="archivex-card-cover-placeholder">📄</div>';
    }
  } else {
    coverDiv.innerHTML = '<div class="archivex-card-cover-placeholder">📄</div>';
  }
  card.appendChild(coverDiv);

  // Title
  const body = document.createElement("div");
  body.className = "archivex-card-body";
  const titleField = fields.find((f) => f.type === "text");
  if (titleField && record[titleField.name]) {
    const titleEl = document.createElement("div");
    titleEl.className = "archivex-card-title";
    titleEl.textContent = String(record[titleField.name]);
    body.appendChild(titleEl);
  }
  card.appendChild(body);

  card.onclick = () => showRecordPreview(record, index);
  grid.appendChild(card);
}

// ==================== Images View ====================
function renderImagesView(content) {
  if (!currentDb) return;
  const fields = currentDb.schema.fields;
  const imageFields = fields.filter((f) => f.type === "image");

  if (imageFields.length === 0) {
    content.innerHTML = '<div class="archivex-empty-state"><div class="archivex-empty-icon">🖼️</div><p>No image fields in this database.</p></div>';
    return;
  }

  // Filter bar
  const filterBar = document.createElement("div");
  filterBar.className = "archivex-images-filter";
  filterBar.innerHTML = '<span class="archivex-images-filter-label">Show:</span>';
  for (const field of imageFields) {
    const label = document.createElement("label");
    label.className = "archivex-images-filter-item";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = imagesFieldFilter.length === 0 || imagesFieldFilter.includes(field.name);
    cb.onchange = () => updateImagesFilter(imageFields, content);
    label.appendChild(cb);
    const span = document.createElement("span");
    span.textContent = field.label || field.name;
    label.appendChild(span);
    filterBar.appendChild(label);
  }
  content.appendChild(filterBar);

  renderImagesGrid(content, imageFields);
}

function updateImagesFilter(imageFields, content) {
  const checkboxes = content.querySelectorAll(".archivex-images-filter input[type=checkbox]");
  const selected = [];
  checkboxes.forEach((cb, idx) => {
    if (cb.checked && imageFields[idx]) selected.push(imageFields[idx].name);
  });
  imagesFieldFilter = selected.length === imageFields.length ? [] : selected;
  const oldGrid = content.querySelector(".archivex-card-grid");
  if (oldGrid) oldGrid.remove();
  renderImagesGrid(content, imageFields);
}

function renderImagesGrid(content, imageFields) {
  if (!currentDb) return;
  const fieldsToShow = imagesFieldFilter.length > 0
    ? imageFields.filter((f) => imagesFieldFilter.includes(f.name))
    : imageFields;

  const allImages = [];
  for (const record of currentDb.records) {
    for (const field of fieldsToShow) {
      const value = record[field.name];
      if (value) {
        const paths = Array.isArray(value) ? value : [String(value)];
        for (const p of paths) {
          if (p) allImages.push({ path: String(p), fieldName: field.name, record });
        }
      }
    }
  }

  const grid = document.createElement("div");
  grid.className = "archivex-card-grid";
  grid.style.gridTemplateColumns = `repeat(auto-fill, minmax(${cardSize}px, 1fr))`;

  for (let i = 0; i < allImages.length; i++) {
    const imgData = allImages[i];
    const item = document.createElement("div");
    item.className = "archivex-gallery-item";
    const img = document.createElement("img");
    img.className = "archivex-gallery-img";
    img.src = getAssetUrl(imgData.path);
    img.alt = imgData.path;
    item.appendChild(img);
    const idx = i;
    item.onclick = () => openLightbox(allImages.map((im) => getAssetUrl(im.path)), idx);
    grid.appendChild(item);
  }

  // Add card
  const addCard = document.createElement("div");
  addCard.className = "archivex-gallery-item archivex-db-card-create";
  addCard.innerHTML = '<div class="archivex-db-card-create-icon">+</div>';
  addCard.onclick = () => showAddRecordDialog();
  grid.appendChild(addCard);

  content.appendChild(grid);
}

// ==================== Table View ====================
function renderTableView(content) {
  if (!currentDb || currentDb.records.length === 0) {
    content.innerHTML = '<div class="archivex-empty-state"><p>No records yet.</p></div>';
    return;
  }

  const wrapper = document.createElement("div");
  wrapper.className = "archivex-table-wrapper";
  const table = document.createElement("table");
  table.className = "archivex-table";

  // Header
  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");
  for (const field of currentDb.schema.fields) {
    const th = document.createElement("th");
    th.textContent = field.label || field.name;
    headerRow.appendChild(th);
  }
  thead.appendChild(headerRow);
  table.appendChild(thead);

  // Body
  const tbody = document.createElement("tbody");
  for (let i = 0; i < currentDb.records.length; i++) {
    const record = currentDb.records[i];
    const row = document.createElement("tr");
    row.style.cursor = "pointer";
    row.onclick = () => showRecordPreview(record, i);
    for (const field of currentDb.schema.fields) {
      const td = document.createElement("td");
      const value = record[field.name];
      if (value === null || value === undefined || value === "") {
        td.innerHTML = '<span style="color:var(--text-faint)">—</span>';
      } else if (field.type === "image" || field.type === "video" || field.type === "audio") {
        td.textContent = Array.isArray(value) ? `${value.length} files` : "1 file";
      } else if (field.type === "tags" && Array.isArray(value)) {
        td.innerHTML = value.map((t) => `<span class="archivex-tag">${escapeHtml(t)}</span>`).join(" ");
      } else {
        td.textContent = String(value);
      }
      row.appendChild(td);
    }
    tbody.appendChild(row);
  }
  table.appendChild(tbody);
  wrapper.appendChild(table);
  content.appendChild(wrapper);
}

// ==================== List View ====================
function renderListView(content) {
  if (!currentDb || currentDb.records.length === 0) {
    content.innerHTML = '<div class="archivex-empty-state"><p>No records yet.</p></div>';
    return;
  }

  const list = document.createElement("div");
  list.className = "archivex-list";

  for (let i = 0; i < currentDb.records.length; i++) {
    const record = currentDb.records[i];
    const fields = currentDb.schema.fields;
    const item = document.createElement("div");
    item.className = "archivex-list-item";
    item.onclick = () => showRecordPreview(record, i);

    // Thumbnail
    const imageField = fields.find((f) => f.type === "image");
    if (imageField && record[imageField.name]) {
      const value = record[imageField.name];
      const firstPath = Array.isArray(value) ? value[0] : String(value);
      if (firstPath) {
        const thumb = document.createElement("div");
        thumb.className = "archivex-list-thumb";
        thumb.innerHTML = `<img src="${getAssetUrl(firstPath)}" alt="">`;
        item.appendChild(thumb);
      }
    }

    const contentDiv = document.createElement("div");
    contentDiv.className = "archivex-list-content";

    const titleField = fields.find((f) => f.type === "text");
    if (titleField && record[titleField.name]) {
      const h4 = document.createElement("h4");
      h4.className = "archivex-list-title";
      h4.textContent = String(record[titleField.name]);
      contentDiv.appendChild(h4);
    }

    const meta = document.createElement("div");
    meta.className = "archivex-list-meta";
    for (const field of fields) {
      if (field === imageField || field === titleField) continue;
      const value = record[field.name];
      if (!value) continue;
      if (field.type === "tags" && Array.isArray(value)) {
        meta.innerHTML += value.map((t) => `<span class="archivex-tag">${escapeHtml(t)}</span>`).join("");
      } else if (field.type !== "video" && field.type !== "audio" && field.type !== "image") {
        const span = document.createElement("span");
        span.className = "archivex-list-meta-item";
        span.textContent = `${field.label}: ${value}`;
        meta.appendChild(span);
      }
    }
    contentDiv.appendChild(meta);
    item.appendChild(contentDiv);
    list.appendChild(item);
  }

  content.appendChild(list);
}

// ==================== Record Preview ====================
function showRecordPreview(record, index) {
  if (!currentDb) return;
  showModal((content) => {
    const fields = currentDb.schema.fields;
    const titleField = fields.find((f) => f.type === "text");
    const title = titleField ? String(record[titleField.name] || "Record") : "Record";

    let html = `
      <div class="preview-header">
        <div class="modal-title" style="margin:0">${escapeHtml(title)}</div>
        <div class="preview-actions">
          <button class="archivex-btn" onclick="hideModal(); showEditRecordDialog(${index})">✏️ Edit</button>
          <button class="archivex-btn archivex-btn-danger" onclick="hideModal(); confirmDeleteRecord(${index})">🗑️ Delete</button>
        </div>
      </div>
      <div class="preview-body">
    `;

    for (const field of fields) {
      const value = record[field.name];
      if (value === null || value === undefined || value === "") continue;

      html += `<div class="preview-field">`;
      html += `<div class="preview-field-label">${escapeHtml(field.label || field.name)}</div>`;

      if (field.type === "image") {
        const paths = Array.isArray(value) ? value : [String(value)];
        html += '<div class="preview-media">';
        for (const p of paths) {
          if (p) html += `<img class="preview-img" src="${getAssetUrl(p)}" onclick="event.stopPropagation(); openLightbox(['${getAssetUrl(p)}'], 0)">`;
        }
        html += '</div>';
      } else if (field.type === "video") {
        const paths = Array.isArray(value) ? value : [String(value)];
        html += '<div class="preview-media">';
        for (const p of paths) {
          if (p) html += `<video class="preview-video" src="${getAssetUrl(p)}" controls></video>`;
        }
        html += '</div>';
      } else if (field.type === "audio") {
        const paths = Array.isArray(value) ? value : [String(value)];
        html += '<div class="preview-media">';
        for (const p of paths) {
          if (p) html += `<audio class="preview-audio" src="${getAssetUrl(p)}" controls></audio>`;
        }
        html += '</div>';
      } else if (field.type === "tags" && Array.isArray(value)) {
        html += '<div class="archivex-tags">';
        for (const t of value) {
          html += `<span class="archivex-tag">${escapeHtml(t)}</span>`;
        }
        html += '</div>';
      } else if (field.type === "checkbox") {
        html += `<div class="preview-field-value">${value ? "✅ Yes" : "❌ No"}</div>`;
      } else if (field.type === "url") {
        html += `<div class="preview-field-value"><a href="${escapeHtml(String(value))}" target="_blank" style="color:var(--accent)">${escapeHtml(String(value))}</a></div>`;
      } else {
        html += `<div class="preview-field-value">${escapeHtml(String(value))}</div>`;
      }

      html += `</div>`;
    }

    html += `</div>`;
    content.innerHTML = html;
  });
}

// ==================== Add Record Dialog ====================
function showAddRecordDialog() {
  if (!currentDb) return;
  showModal((content) => {
    const fields = currentDb.schema.fields;
    let html = `<div class="modal-title">Add Record</div>`;

    for (const field of fields) {
      html += `<div class="modal-group">`;
      html += `<label class="modal-label">${escapeHtml(field.label || field.name)}</label>`;
      html += renderFieldInput(field, null);
      html += `</div>`;
    }

    html += `
      <div class="modal-actions">
        <button class="archivex-btn" onclick="hideModal()">Cancel</button>
        <button class="archivex-btn archivex-btn-primary" onclick="saveNewRecord()">Save</button>
      </div>
    `;
    content.innerHTML = html;
  });
}

function showEditRecordDialog(index) {
  if (!currentDb) return;
  const record = currentDb.records[index];
  showModal((content) => {
    const fields = currentDb.schema.fields;
    let html = `<div class="modal-title">Edit Record</div>`;

    for (const field of fields) {
      html += `<div class="modal-group">`;
      html += `<label class="modal-label">${escapeHtml(field.label || field.name)}</label>`;
      html += renderFieldInput(field, record[field.name]);
      html += `</div>`;
    }

    html += `
      <div class="modal-actions">
        <button class="archivex-btn" onclick="hideModal()">Cancel</button>
        <button class="archivex-btn archivex-btn-primary" onclick="saveEditRecord(${index})">Save</button>
      </div>
    `;
    content.innerHTML = html;
  });
}

function renderFieldInput(field, value) {
  const id = `field-input-${field.name}`;
  const val = value !== null && value !== undefined ? value : "";

  switch (field.type) {
    case "text":
    case "url":
      return `<input type="text" class="modal-input" id="${id}" data-field="${field.name}" data-type="${field.type}" value="${escapeHtml(String(val))}">`;
    case "integer":
      return `<input type="number" class="modal-input" id="${id}" data-field="${field.name}" data-type="${field.type}" step="1" value="${val}">`;
    case "number":
      return `<input type="number" class="modal-input" id="${id}" data-field="${field.name}" data-type="${field.type}" step="any" value="${val}">`;
    case "date":
      return `<input type="date" class="modal-input" id="${id}" data-field="${field.name}" data-type="${field.type}" value="${escapeHtml(String(val))}">`;
    case "checkbox":
      return `<label style="display:flex;align-items:center;gap:8px;cursor:pointer"><input type="checkbox" id="${id}" data-field="${field.name}" data-type="${field.type}" ${val ? "checked" : ""}> <span>${val ? "Yes" : "No"}</span></label>`;
    case "select":
      return `<input type="text" class="modal-input" id="${id}" data-field="${field.name}" data-type="${field.type}" value="${escapeHtml(String(val))}" placeholder="Enter option value">`;
    case "multiselect":
    case "tags":
      const arrVal = Array.isArray(val) ? val.join(", ") : String(val);
      return `<input type="text" class="modal-input" id="${id}" data-field="${field.name}" data-type="${field.type}" value="${escapeHtml(arrVal)}" placeholder="Comma separated values">`;
    case "image":
    case "video":
    case "audio":
      const paths = Array.isArray(val) ? val : (val ? [String(val)] : []);
      let html = `<div id="${id}" data-field="${field.name}" data-type="${field.type}" class="media-field-container">`;
      html += `<div class="archivex-media-list" id="${id}-list">`;
      for (const p of paths) {
        if (p) {
          html += `<div class="archivex-media-list-item">
            ${field.type === "image" ? `<img class="archivex-media-list-thumb" src="${getAssetUrl(p)}">` : `<span>📎</span>`}
            <span style="max-width:100px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:0.8em">${p.split("/").pop().slice(0, 8)}...</span>
            <button class="archivex-media-list-remove" onclick="removeMediaItem(this, '${id}')">×</button>
            <input type="hidden" class="media-path-value" value="${escapeHtml(p)}">
          </div>`;
        }
      }
      html += `</div>`;
      html += `<div class="archivex-media-dropzone" onclick="triggerFileUpload('${id}')" ondragover="event.preventDefault();this.classList.add('active')" ondragleave="this.classList.remove('active')" ondrop="handleFileDrop(event, '${id}')">
        <div class="archivex-media-dropzone-icon">${field.type === "image" ? "🖼️" : field.type === "video" ? "🎬" : "🎵"}</div>
        <div class="archivex-media-dropzone-text">Click or drag to upload</div>
      </div>`;
      html += `<input type="file" id="${id}-file" style="display:none" accept="${getAcceptType(field.type)}" multiple onchange="handleFileSelect(event, '${id}')">`;
      html += `</div>`;
      return html;
    default:
      return `<input type="text" class="modal-input" id="${id}" data-field="${field.name}" data-type="${field.type}" value="${escapeHtml(String(val))}">`;
  }
}

function getAcceptType(type) {
  switch (type) {
    case "image": return "image/*";
    case "video": return "video/*";
    case "audio": return "audio/*";
    default: return "*/*";
  }
}

function triggerFileUpload(fieldId) {
  document.getElementById(`${fieldId}-file`).click();
}

async function handleFileSelect(event, fieldId) {
  const files = event.target.files;
  for (const file of files) {
    await uploadFile(file, fieldId);
  }
}

async function handleFileDrop(event, fieldId) {
  event.preventDefault();
  event.currentTarget.classList.remove("active");
  const files = event.dataTransfer.files;
  for (const file of files) {
    await uploadFile(file, fieldId);
  }
}

async function uploadFile(file, fieldId) {
  if (!currentDb) return;
  const formData = new FormData();
  formData.append("file", file);

  try {
    const result = await fetch(`${API_BASE}/api/databases/${encodeURIComponent(currentDb.name)}/upload`, {
      method: "POST",
      body: formData,
    }).then((r) => r.json());

    // Add to media list
    const listEl = document.getElementById(`${fieldId}-list`);
    const container = document.getElementById(fieldId);
    const fieldType = container.dataset.type;

    const item = document.createElement("div");
    item.className = "archivex-media-list-item";
    item.innerHTML = `
      ${fieldType === "image" ? `<img class="archivex-media-list-thumb" src="${getAssetUrl(result.path)}">` : `<span>📎</span>`}
      <span style="max-width:100px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:0.8em">${result.hash.slice(0, 8)}...</span>
      <button class="archivex-media-list-remove" onclick="removeMediaItem(this, '${fieldId}')">×</button>
      <input type="hidden" class="media-path-value" value="${result.path}">
    `;
    listEl.appendChild(item);
  } catch (e) {
    alert("Upload failed: " + e.message);
  }
}

function removeMediaItem(btn, fieldId) {
  btn.closest(".archivex-media-list-item").remove();
}

function collectRecordData() {
  if (!currentDb) return null;
  const record = {};
  for (const field of currentDb.schema.fields) {
    const id = `field-input-${field.name}`;

    if (field.type === "image" || field.type === "video" || field.type === "audio") {
      const container = document.getElementById(id);
      if (container) {
        const paths = Array.from(container.querySelectorAll(".media-path-value")).map((inp) => inp.value);
        record[field.name] = paths.length > 0 ? paths : null;
      } else {
        record[field.name] = null;
      }
    } else if (field.type === "checkbox") {
      const el = document.getElementById(id);
      record[field.name] = el ? el.checked : false;
    } else if (field.type === "tags" || field.type === "multiselect") {
      const el = document.getElementById(id);
      const val = el ? el.value.trim() : "";
      record[field.name] = val ? val.split(",").map((s) => s.trim()).filter(Boolean) : [];
    } else if (field.type === "integer") {
      const el = document.getElementById(id);
      record[field.name] = el && el.value ? parseInt(el.value) : null;
    } else if (field.type === "number") {
      const el = document.getElementById(id);
      record[field.name] = el && el.value ? parseFloat(el.value) : null;
    } else {
      const el = document.getElementById(id);
      record[field.name] = el ? el.value.trim() || null : null;
    }
  }
  return record;
}

async function saveNewRecord() {
  const record = collectRecordData();
  if (!record) return;

  try {
    await api("POST", `/api/databases/${encodeURIComponent(currentDb.name)}/records`, record);
    hideModal();
    openDatabase(currentDb.name);
  } catch (e) {
    alert("Failed to save record: " + e.message);
  }
}

async function saveEditRecord(index) {
  const record = collectRecordData();
  if (!record) return;

  try {
    await api("PUT", `/api/databases/${encodeURIComponent(currentDb.name)}/records/${index}`, record);
    hideModal();
    openDatabase(currentDb.name);
  } catch (e) {
    alert("Failed to save record: " + e.message);
  }
}

// ==================== Delete Record ====================
function confirmDeleteRecord(index) {
  showModal((content) => {
    content.innerHTML = `
      <div class="modal-title">Delete Record</div>
      <p>Are you sure you want to delete this record? This action cannot be undone.</p>
      <div class="modal-actions">
        <button class="archivex-btn" onclick="hideModal()">Cancel</button>
        <button class="archivex-btn archivex-btn-danger" onclick="deleteRecord(${index})">Delete</button>
      </div>
    `;
  });
}

async function deleteRecord(index) {
  try {
    await api("DELETE", `/api/databases/${encodeURIComponent(currentDb.name)}/records/${index}`);
    hideModal();
    openDatabase(currentDb.name);
  } catch (e) {
    alert("Failed to delete record: " + e.message);
  }
}

// ==================== Backup & Restore ====================
function showBackupRestore() {
  showModal(async (content) => {
    let dataDir = "Loading...";
    try {
      const config = await api("GET", "/api/config");
      dataDir = config.dataDir || "Unknown";
    } catch (e) {
      dataDir = "Failed to load";
    }
    content.innerHTML = `
      <div class="modal-title">Settings</div>
      <div class="settings-section">
        <h3>Data Path</h3>
        <p style="margin-bottom:8px;color:var(--text-muted);font-size:0.9em">Current data storage path (set via <code>DATA_DIR</code> environment variable):</p>
        <code style="display:block;padding:8px 12px;background:var(--bg-secondary);border-radius:4px;margin-bottom:8px;word-break:break-all">${escapeHtml(dataDir)}</code>
        <p style="color:var(--text-muted);font-size:0.85em">To change, update <code>DATA_DIR</code> in docker-compose.yml or environment and restart the service.</p>
      </div>
      <div class="settings-section">
        <h3>Backup</h3>
        <p style="margin-bottom:12px;color:var(--text-muted);font-size:0.9em">Download all databases and assets as a .tar.gz archive.</p>
        <a href="/api/backup" class="archivex-btn archivex-btn-primary" style="text-decoration:none;display:inline-block">⬇️ Download Backup</a>
      </div>
      <div class="settings-section">
        <h3>Restore</h3>
        <p style="margin-bottom:12px;color:var(--text-muted);font-size:0.9em">Upload a previously exported .tar.gz backup to restore data to the current data path.</p>
        <input type="file" id="restore-file" accept=".tar.gz,.tgz,.gz,application/gzip,application/x-gzip,application/x-tar" style="display:none" onchange="performRestore(event)">
        <button class="archivex-btn" onclick="triggerRestoreFileSelect()">⬆️ Upload Backup</button>
        <div id="restore-status" style="margin-top:12px"></div>
      </div>
      <div class="modal-actions">
        <button class="archivex-btn" onclick="hideModal()">Close</button>
      </div>
    `;
  });
}

function triggerRestoreFileSelect() {
  const fileInput = document.getElementById('restore-file');
  // Reset value so the same file can be selected again
  fileInput.value = '';
  fileInput.click();
}

async function performRestore(event) {
  const file = event.target.files[0];
  if (!file) return;

  const statusEl = document.getElementById("restore-status");
  statusEl.innerHTML = '<span style="color:var(--text-muted)">Restoring...</span>';

  const formData = new FormData();
  formData.append("backup", file);

  try {
    const result = await fetch(`${API_BASE}/api/restore`, {
      method: "POST",
      body: formData,
    }).then((r) => r.json());

    if (result.success) {
      statusEl.innerHTML = '<span style="color:green">✅ Restore completed! Refreshing...</span>';
      setTimeout(() => { hideModal(); renderHomePage(); }, 1500);
    } else {
      statusEl.innerHTML = `<span style="color:var(--bg-error)">❌ ${result.error}</span>`;
    }
  } catch (e) {
    statusEl.innerHTML = `<span style="color:var(--bg-error)">❌ Restore failed: ${e.message}</span>`;
  }
}

// ==================== Utility ====================
function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function getFieldIcon(type) {
  const icons = {
    text: "📝", integer: "🔢", number: "🔣", date: "📅",
    select: "📋", multiselect: "☑️", checkbox: "✅",
    image: "🖼️", video: "🎬", audio: "🎵",
    url: "🔗", tags: "🏷️", boolean: "✅", file: "📎",
  };
  return icons[type] || "📝";
}

function getFieldTypeOptions(selectedType) {
  const types = ["text", "integer", "number", "date", "select", "multiselect", "checkbox", "image", "video", "audio", "url", "tags"];
  return types.map((t) => `<option value="${t}" ${t === selectedType ? "selected" : ""}>${t}</option>`).join("");
}
