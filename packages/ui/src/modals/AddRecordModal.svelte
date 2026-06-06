<script lang="ts">
  import { dataProvider } from "../stores";
  import { getAcceptType } from "@archivex/core";
  import type { Database, DatabaseRecord, FieldDefinition } from "@archivex/core";
  import ImageCropper from "../components/ImageCropper.svelte";
  import Icon from "../components/Icon.svelte";

  export let closeModal: () => void;
  export let database: Database & { name: string };
  export let editIndex: number | undefined = undefined;
  export let editRecord: DatabaseRecord | undefined = undefined;
  export let onSaved: () => void;

  let formData: Record<string, any> = {};
  let formDataInitialized = false;

  // Image cropper state
  let showCropper = false;
  let cropperFile: File | null = null;
  let cropperFieldName = "";

  // Initialize form data only once
  $: if (!formDataInitialized && database) {
    const data: Record<string, any> = {};
    for (const field of database.schema.fields) {
      if (editRecord) {
        data[field.name] = editRecord[field.name] ?? getDefaultValue(field);
      } else {
        data[field.name] = getDefaultValue(field);
      }
    }
    formData = data;
    formDataInitialized = true;
  }

  function getDefaultValue(field: FieldDefinition): any {
    switch (field.type) {
      case "checkbox": return false;
      case "tags":
      case "multiselect": return [];
      case "image":
      case "video":
      case "audio": return [];
      default: return "";
    }
  }

  function getMediaPaths(fieldName: string, data: Record<string, any>): string[] {
    const val = data[fieldName];
    if (!val) return [];
    if (Array.isArray(val)) return val.filter(Boolean).map(String);
    return val ? [String(val)] : [];
  }

  function getAssetUrl(path: string): string {
    const provider = $dataProvider;
    if (!provider || !path) return "";
    return provider.getAssetUrl(path);
  }

  function handleFileSelect(fieldName: string, files: FileList | null) {
    if (!files || files.length === 0) return;
    const field = database.schema.fields.find((f) => f.name === fieldName);

    if (field?.type === "image") {
      // Open cropper for image files
      cropperFile = files[0];
      cropperFieldName = fieldName;
      showCropper = true;
    } else {
      // For non-image media, upload directly
      uploadFiles(fieldName, Array.from(files));
    }
  }

  function triggerFileSelect(fieldName: string, fieldType: string) {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = getAcceptType(fieldType);
    input.onchange = () => {
      handleFileSelect(fieldName, input.files);
    };
    input.click();
  }

  async function uploadFiles(fieldName: string, files: File[]) {
    const provider = $dataProvider;
    if (!provider) return;

    for (const file of files) {
      try {
        const result = await provider.uploadFile(database.name, file);
        const current = getMediaPaths(fieldName, formData);
        formData[fieldName] = [...current, result.path];
        formData = { ...formData };
      } catch (e) {
        alert("Upload failed: " + (e as Error).message);
      }
    }
  }

  async function handleCropDone(croppedFile: File) {
    const fieldName = cropperFieldName;
    showCropper = false;
    cropperFile = null;
    cropperFieldName = "";

    // Upload and update formData to trigger reactivity
    const provider = $dataProvider;
    if (!provider) return;
    try {
      const result = await provider.uploadFile(database.name, croppedFile);
      const current = getMediaPaths(fieldName, formData);
      const updated = [...current, result.path];
      formData = { ...formData, [fieldName]: updated };
    } catch (e) {
      alert("Upload failed: " + (e as Error).message);
    }
  }

  function handleCropCancel() {
    showCropper = false;
    cropperFile = null;
    cropperFieldName = "";
  }

  function removeMedia(fieldName: string, index: number) {
    const paths = getMediaPaths(fieldName, formData);
    paths.splice(index, 1);
    formData = { ...formData, [fieldName]: [...paths] };
  }

  async function handleSave() {
    const provider = $dataProvider;
    if (!provider) return;

    // Build record
    const record: DatabaseRecord = {};
    for (const field of database.schema.fields) {
      const val = formData[field.name];
      if (field.type === "image" || field.type === "video" || field.type === "audio") {
        const paths = Array.isArray(val) ? val.filter(Boolean) : (val ? [val] : []);
        record[field.name] = paths.length === 0 ? null : paths.length === 1 ? paths[0] : paths;
      } else if (field.type === "checkbox") {
        record[field.name] = !!val;
      } else if (field.type === "tags" || field.type === "multiselect") {
        if (Array.isArray(val)) {
          record[field.name] = val;
        } else {
          record[field.name] = val ? String(val).split(",").map((s: string) => s.trim()).filter(Boolean) : [];
        }
      } else if (field.type === "integer") {
        record[field.name] = val !== "" && val !== null ? parseInt(val) : null;
      } else if (field.type === "number") {
        record[field.name] = val !== "" && val !== null ? parseFloat(val) : null;
      } else {
        record[field.name] = val || null;
      }
    }

    try {
      if (editIndex !== undefined) {
        await provider.updateRecord(database.name, editIndex, record);
      } else {
        await provider.addRecord(database.name, record);
      }
      closeModal();
      onSaved();
    } catch (e) {
      alert("Failed to save record: " + (e as Error).message);
    }
  }
</script>

{#if showCropper && cropperFile}
  <ImageCropper imageFile={cropperFile} onCrop={handleCropDone} onCancel={handleCropCancel} />
{:else}
  <div class="modal-title">{editIndex !== undefined ? "Edit Record" : "Add Record"}</div>

  {#each database.schema.fields as field}
    <div class="modal-group">
      <!-- svelte-ignore a11y-label-has-associated-control -->
      <label class="modal-label">{field.label || field.name}</label>

      {#if field.type === "text" || field.type === "url" || field.type === "select"}
        <input type="text" class="modal-input" bind:value={formData[field.name]} />
      {:else if field.type === "integer"}
        <input type="number" class="modal-input" step="1" bind:value={formData[field.name]} />
      {:else if field.type === "number"}
        <input type="number" class="modal-input" step="any" bind:value={formData[field.name]} />
      {:else if field.type === "date"}
        <input type="date" class="modal-input" bind:value={formData[field.name]} />
      {:else if field.type === "checkbox"}
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
          <input type="checkbox" bind:checked={formData[field.name]} />
          <span>{formData[field.name] ? "Yes" : "No"}</span>
        </label>
      {:else if field.type === "tags" || field.type === "multiselect"}
        <input
          type="text"
          class="modal-input"
          value={Array.isArray(formData[field.name]) ? formData[field.name].join(", ") : formData[field.name]}
          on:input={(e) => { formData[field.name] = e.currentTarget.value; }}
          placeholder="Comma separated values"
        />
      {:else if field.type === "image" || field.type === "video" || field.type === "audio"}
        <div class="media-field-container">
          <div class="archivex-media-list">
            {#each getMediaPaths(field.name, formData) as path, pi}
              <div class="archivex-media-list-item">
                {#if field.type === "image"}
                  <img class="archivex-media-list-thumb" src={getAssetUrl(path)} alt="" />
                {:else}
                <span><Icon name="file" size={14} /></span>
                {/if}
                <span style="max-width:100px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:0.8em">
                  {path.split("/").pop()?.slice(0, 8)}...
                </span>
                <button class="archivex-media-list-remove" on:click={() => removeMedia(field.name, pi)}>×</button>
              </div>
            {/each}
          </div>
          <button
            class="archivex-media-select-btn"
            on:click={() => triggerFileSelect(field.name, field.type)}
          >
            {#if field.type === "image"}<Icon name="image" size={14} />{:else if field.type === "video"}<Icon name="video" size={14} />{:else}<Icon name="music" size={14} />{/if} Choose File
          </button>        </div>
      {:else}
        <input type="text" class="modal-input" bind:value={formData[field.name]} />
      {/if}
    </div>
  {/each}

  <div class="modal-actions">
    <button class="archivex-btn" on:click={closeModal}>Cancel</button>
    <button class="archivex-btn archivex-btn-primary" on:click={handleSave}>Save</button>
  </div>
{/if}
