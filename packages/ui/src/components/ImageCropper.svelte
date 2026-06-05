<script lang="ts">
  import { onMount, onDestroy } from "svelte";

  export let imageFile: File;
  export let onCrop: (croppedFile: File) => void;
  export let onCancel: () => void;

  let canvas: HTMLCanvasElement;
  let imgEl: HTMLImageElement;
  let containerEl: HTMLDivElement;

  // Crop state
  let imgSrc = "";
  let imgWidth = 0;
  let imgHeight = 0;
  let displayWidth = 0;
  let displayHeight = 0;

  // Crop box (relative to displayed image)
  let cropX = 0;
  let cropY = 0;
  let cropW = 0;
  let cropH = 0;

  // Drag state
  let dragging: "move" | "nw" | "ne" | "sw" | "se" | null = null;
  let dragStartX = 0;
  let dragStartY = 0;
  let dragStartCropX = 0;
  let dragStartCropY = 0;
  let dragStartCropW = 0;
  let dragStartCropH = 0;

  onMount(() => {
    imgSrc = URL.createObjectURL(imageFile);
  });

  onDestroy(() => {
    if (imgSrc) URL.revokeObjectURL(imgSrc);
  });

  function onImageLoad() {
    imgWidth = imgEl.naturalWidth;
    imgHeight = imgEl.naturalHeight;

    // Fit image in container (max 400px)
    const maxSize = 400;
    const ratio = Math.min(maxSize / imgWidth, maxSize / imgHeight, 1);
    displayWidth = Math.round(imgWidth * ratio);
    displayHeight = Math.round(imgHeight * ratio);

    // Default crop: 80% center area so user can see the crop effect
    const margin = 0.1;
    cropX = Math.round(displayWidth * margin);
    cropY = Math.round(displayHeight * margin);
    cropW = Math.round(displayWidth * (1 - 2 * margin));
    cropH = Math.round(displayHeight * (1 - 2 * margin));
  }

  function onMouseDown(e: MouseEvent, type: "move" | "nw" | "ne" | "sw" | "se") {
    e.preventDefault();
    e.stopPropagation();
    dragging = type;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    dragStartCropX = cropX;
    dragStartCropY = cropY;
    dragStartCropW = cropW;
    dragStartCropH = cropH;
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }

  function onMouseMove(e: MouseEvent) {
    if (!dragging) return;
    const dx = e.clientX - dragStartX;
    const dy = e.clientY - dragStartY;

    if (dragging === "move") {
      cropX = Math.max(0, Math.min(displayWidth - cropW, dragStartCropX + dx));
      cropY = Math.max(0, Math.min(displayHeight - cropH, dragStartCropY + dy));
    } else if (dragging === "se") {
      cropW = Math.max(30, Math.min(displayWidth - cropX, dragStartCropW + dx));
      cropH = Math.max(30, Math.min(displayHeight - cropY, dragStartCropH + dy));
    } else if (dragging === "sw") {
      const newW = Math.max(30, dragStartCropW - dx);
      const newX = dragStartCropX + (dragStartCropW - newW);
      if (newX >= 0) { cropX = newX; cropW = newW; }
      cropH = Math.max(30, Math.min(displayHeight - cropY, dragStartCropH + dy));
    } else if (dragging === "ne") {
      cropW = Math.max(30, Math.min(displayWidth - cropX, dragStartCropW + dx));
      const newH = Math.max(30, dragStartCropH - dy);
      const newY = dragStartCropY + (dragStartCropH - newH);
      if (newY >= 0) { cropY = newY; cropH = newH; }
    } else if (dragging === "nw") {
      const newW = Math.max(30, dragStartCropW - dx);
      const newX = dragStartCropX + (dragStartCropW - newW);
      const newH = Math.max(30, dragStartCropH - dy);
      const newY = dragStartCropY + (dragStartCropH - newH);
      if (newX >= 0) { cropX = newX; cropW = newW; }
      if (newY >= 0) { cropY = newY; cropH = newH; }
    }
  }

  function onMouseUp() {
    dragging = null;
    window.removeEventListener("mousemove", onMouseMove);
    window.removeEventListener("mouseup", onMouseUp);
  }

  async function doCrop() {
    // Calculate actual pixel coordinates
    const scaleX = imgWidth / displayWidth;
    const scaleY = imgHeight / displayHeight;

    const sx = Math.round(cropX * scaleX);
    const sy = Math.round(cropY * scaleY);
    const sw = Math.round(cropW * scaleX);
    const sh = Math.round(cropH * scaleY);

    // Draw cropped image to canvas
    canvas.width = sw;
    canvas.height = sh;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(imgEl, sx, sy, sw, sh, 0, 0, sw, sh);

    // Convert to blob
    const blob = await new Promise<Blob>((resolve) => {
      canvas.toBlob((b) => resolve(b!), imageFile.type || "image/jpeg", 0.92);
    });

    const croppedFile = new File([blob], imageFile.name, { type: blob.type });
    onCrop(croppedFile);
  }
</script>

<div class="image-cropper">
  <div class="image-cropper-title">Crop Image</div>

  <div class="image-cropper-container" bind:this={containerEl} style="width:{displayWidth}px;height:{displayHeight}px;background:#000">
    <img
      bind:this={imgEl}
      src={imgSrc}
      alt=""
      class="image-cropper-img"
      style="width:{displayWidth}px;height:{displayHeight}px"
      on:load={onImageLoad}
    />

    {#if displayWidth > 0}
      <!-- Overlay mask -->
      <div class="image-cropper-overlay" style="
        clip-path: polygon(
          0% 0%, 0% 100%, {cropX}px 100%, {cropX}px {cropY}px,
          {cropX + cropW}px {cropY}px, {cropX + cropW}px {cropY + cropH}px,
          {cropX}px {cropY + cropH}px, {cropX}px 100%, 100% 100%, 100% 0%
        )
      "></div>

      <!-- Crop box border -->
      <div
        class="image-cropper-box"
        style="left:{cropX}px;top:{cropY}px;width:{cropW}px;height:{cropH}px"
        on:mousedown={(e) => onMouseDown(e, "move")}
        role="slider"
        tabindex="0"
        aria-label="Crop area"
        aria-valuenow={0}
      >
        <!-- Corner handles -->
        <div class="crop-handle crop-handle-nw" on:mousedown={(e) => onMouseDown(e, "nw")} role="button" tabindex="0"></div>
        <div class="crop-handle crop-handle-ne" on:mousedown={(e) => onMouseDown(e, "ne")} role="button" tabindex="0"></div>
        <div class="crop-handle crop-handle-sw" on:mousedown={(e) => onMouseDown(e, "sw")} role="button" tabindex="0"></div>
        <div class="crop-handle crop-handle-se" on:mousedown={(e) => onMouseDown(e, "se")} role="button" tabindex="0"></div>
      </div>
    {/if}
  </div>

  <canvas bind:this={canvas} style="display:none"></canvas>

  <div class="image-cropper-actions">
    <button class="archivex-btn" on:click={onCancel}>Cancel</button>
    <button class="archivex-btn archivex-btn-primary" on:click={doCrop}>Confirm</button>
  </div>
</div>
