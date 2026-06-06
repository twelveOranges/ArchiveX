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
  let dragging: "move" | "nw" | "ne" | "sw" | "se" | "n" | "s" | "e" | "w" | null = null;
  let dragStartX = 0;
  let dragStartY = 0;
  let dragStartCropX = 0;
  let dragStartCropY = 0;
  let dragStartCropW = 0;
  let dragStartCropH = 0;

  // Minimum crop size
  const MIN_SIZE = 20;

  onMount(() => {
    imgSrc = URL.createObjectURL(imageFile);
  });

  onDestroy(() => {
    if (imgSrc) URL.revokeObjectURL(imgSrc);
  });

  function onImageLoad() {
    imgWidth = imgEl.naturalWidth;
    imgHeight = imgEl.naturalHeight;

    // Responsive: fit image in container, max 90vw or 400px
    const maxW = Math.min(window.innerWidth * 0.85, 400);
    const maxH = Math.min(window.innerHeight * 0.5, 400);
    const ratio = Math.min(maxW / imgWidth, maxH / imgHeight, 1);
    displayWidth = Math.round(imgWidth * ratio);
    displayHeight = Math.round(imgHeight * ratio);

    // Default crop: full image (user can adjust to crop)
    cropX = 0;
    cropY = 0;
    cropW = displayWidth;
    cropH = displayHeight;
  }

  // Unified pointer handling for both mouse and touch
  type DragType = "move" | "nw" | "ne" | "sw" | "se" | "n" | "s" | "e" | "w";

  function getPointerPos(e: MouseEvent | TouchEvent): { x: number; y: number } {
    if ("touches" in e) {
      return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
    return { x: e.clientX, y: e.clientY };
  }

  function startDrag(e: MouseEvent | TouchEvent, type: DragType) {
    e.preventDefault();
    e.stopPropagation();
    dragging = type;
    const pos = getPointerPos(e);
    dragStartX = pos.x;
    dragStartY = pos.y;
    dragStartCropX = cropX;
    dragStartCropY = cropY;
    dragStartCropW = cropW;
    dragStartCropH = cropH;

    window.addEventListener("mousemove", onPointerMove);
    window.addEventListener("mouseup", onPointerUp);
    window.addEventListener("touchmove", onPointerMove, { passive: false });
    window.addEventListener("touchend", onPointerUp);
    window.addEventListener("touchcancel", onPointerUp);
  }

  function onPointerMove(e: MouseEvent | TouchEvent) {
    if (!dragging) return;
    e.preventDefault();
    const pos = getPointerPos(e);
    const dx = pos.x - dragStartX;
    const dy = pos.y - dragStartY;

    if (dragging === "move") {
      cropX = Math.max(0, Math.min(displayWidth - cropW, dragStartCropX + dx));
      cropY = Math.max(0, Math.min(displayHeight - cropH, dragStartCropY + dy));
    } else if (dragging === "se") {
      cropW = Math.max(MIN_SIZE, Math.min(displayWidth - cropX, dragStartCropW + dx));
      cropH = Math.max(MIN_SIZE, Math.min(displayHeight - cropY, dragStartCropH + dy));
    } else if (dragging === "sw") {
      const newW = Math.max(MIN_SIZE, dragStartCropW - dx);
      const newX = dragStartCropX + (dragStartCropW - newW);
      if (newX >= 0) { cropX = newX; cropW = newW; }
      cropH = Math.max(MIN_SIZE, Math.min(displayHeight - cropY, dragStartCropH + dy));
    } else if (dragging === "ne") {
      cropW = Math.max(MIN_SIZE, Math.min(displayWidth - cropX, dragStartCropW + dx));
      const newH = Math.max(MIN_SIZE, dragStartCropH - dy);
      const newY = dragStartCropY + (dragStartCropH - newH);
      if (newY >= 0) { cropY = newY; cropH = newH; }
    } else if (dragging === "nw") {
      const newW = Math.max(MIN_SIZE, dragStartCropW - dx);
      const newX = dragStartCropX + (dragStartCropW - newW);
      const newH = Math.max(MIN_SIZE, dragStartCropH - dy);
      const newY = dragStartCropY + (dragStartCropH - newH);
      if (newX >= 0) { cropX = newX; cropW = newW; }
      if (newY >= 0) { cropY = newY; cropH = newH; }
    } else if (dragging === "n") {
      const newH = Math.max(MIN_SIZE, dragStartCropH - dy);
      const newY = dragStartCropY + (dragStartCropH - newH);
      if (newY >= 0) { cropY = newY; cropH = newH; }
    } else if (dragging === "s") {
      cropH = Math.max(MIN_SIZE, Math.min(displayHeight - cropY, dragStartCropH + dy));
    } else if (dragging === "e") {
      cropW = Math.max(MIN_SIZE, Math.min(displayWidth - cropX, dragStartCropW + dx));
    } else if (dragging === "w") {
      const newW = Math.max(MIN_SIZE, dragStartCropW - dx);
      const newX = dragStartCropX + (dragStartCropW - newW);
      if (newX >= 0) { cropX = newX; cropW = newW; }
    }
  }

  function onPointerUp() {
    dragging = null;
    window.removeEventListener("mousemove", onPointerMove);
    window.removeEventListener("mouseup", onPointerUp);
    window.removeEventListener("touchmove", onPointerMove);
    window.removeEventListener("touchend", onPointerUp);
    window.removeEventListener("touchcancel", onPointerUp);
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
        on:mousedown={(e) => startDrag(e, "move")}
        on:touchstart={(e) => startDrag(e, "move")}
        role="slider"
        tabindex="0"
        aria-label="Crop area"
        aria-valuenow={0}
      >
        <!-- Edge handles (for easier resizing on mobile) -->
        <div class="crop-handle crop-handle-edge crop-handle-n" on:mousedown={(e) => startDrag(e, "n")} on:touchstart={(e) => startDrag(e, "n")} role="button" tabindex="0"></div>
        <div class="crop-handle crop-handle-edge crop-handle-s" on:mousedown={(e) => startDrag(e, "s")} on:touchstart={(e) => startDrag(e, "s")} role="button" tabindex="0"></div>
        <div class="crop-handle crop-handle-edge crop-handle-w" on:mousedown={(e) => startDrag(e, "w")} on:touchstart={(e) => startDrag(e, "w")} role="button" tabindex="0"></div>
        <div class="crop-handle crop-handle-edge crop-handle-e" on:mousedown={(e) => startDrag(e, "e")} on:touchstart={(e) => startDrag(e, "e")} role="button" tabindex="0"></div>
        <!-- Corner handles -->
        <div class="crop-handle crop-handle-corner crop-handle-nw" on:mousedown={(e) => startDrag(e, "nw")} on:touchstart={(e) => startDrag(e, "nw")} role="button" tabindex="0"></div>
        <div class="crop-handle crop-handle-corner crop-handle-ne" on:mousedown={(e) => startDrag(e, "ne")} on:touchstart={(e) => startDrag(e, "ne")} role="button" tabindex="0"></div>
        <div class="crop-handle crop-handle-corner crop-handle-sw" on:mousedown={(e) => startDrag(e, "sw")} on:touchstart={(e) => startDrag(e, "sw")} role="button" tabindex="0"></div>
        <div class="crop-handle crop-handle-corner crop-handle-se" on:mousedown={(e) => startDrag(e, "se")} on:touchstart={(e) => startDrag(e, "se")} role="button" tabindex="0"></div>
      </div>
    {/if}
  </div>

  <canvas bind:this={canvas} style="display:none"></canvas>

  <div class="image-cropper-actions">
    <button class="archivex-btn" on:click={onCancel}>Cancel</button>
    <button class="archivex-btn archivex-btn-primary" on:click={doCrop}>Confirm</button>
  </div>
</div>
