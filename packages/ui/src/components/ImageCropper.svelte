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

  // Auto-trim: detect and remove uniform-color borders (black, white, gray, or any solid color)
  // The algorithm checks if an entire row/column consists of pixels similar to the border color.
  function autoTrim() {
    const tmpCanvas = document.createElement("canvas");
    tmpCanvas.width = imgWidth;
    tmpCanvas.height = imgHeight;
    const tmpCtx = tmpCanvas.getContext("2d")!;
    tmpCtx.drawImage(imgEl, 0, 0);
    const imageData = tmpCtx.getImageData(0, 0, imgWidth, imgHeight);
    const data = imageData.data;

    // Tolerance for considering a pixel as "border color"
    const tolerance = 30;

    function getPixel(x: number, y: number): [number, number, number] {
      const idx = (y * imgWidth + x) * 4;
      return [data[idx], data[idx + 1], data[idx + 2]];
    }

    // Determine the border color by sampling corners and edges
    function detectBorderColor(): [number, number, number] {
      const samples: [number, number, number][] = [];
      // Sample from all 4 corners (3x3 area each)
      for (let dy = 0; dy < 3; dy++) {
        for (let dx = 0; dx < 3; dx++) {
          samples.push(getPixel(dx, dy));
          samples.push(getPixel(imgWidth - 1 - dx, dy));
          samples.push(getPixel(dx, imgHeight - 1 - dy));
          samples.push(getPixel(imgWidth - 1 - dx, imgHeight - 1 - dy));
        }
      }
      // Use median of samples as border color
      const r = samples.map(s => s[0]).sort((a, b) => a - b)[Math.floor(samples.length / 2)];
      const g = samples.map(s => s[1]).sort((a, b) => a - b)[Math.floor(samples.length / 2)];
      const b = samples.map(s => s[2]).sort((a, b) => a - b)[Math.floor(samples.length / 2)];
      return [r, g, b];
    }

    const [borderR, borderG, borderB] = detectBorderColor();

    // Check if a pixel matches the border color
    function isBorderPixel(x: number, y: number): boolean {
      const [r, g, b] = getPixel(x, y);
      return Math.abs(r - borderR) <= tolerance &&
             Math.abs(g - borderG) <= tolerance &&
             Math.abs(b - borderB) <= tolerance;
    }

    // Check if a row is all border color (scan every pixel for accuracy)
    function isBorderRow(y: number): boolean {
      const step = Math.max(1, Math.floor(imgWidth / 500));
      for (let x = 0; x < imgWidth; x += step) {
        if (!isBorderPixel(x, y)) return false;
      }
      return true;
    }

    // Check if a column is all border color
    function isBorderCol(x: number, yStart: number, yEnd: number): boolean {
      const step = Math.max(1, Math.floor((yEnd - yStart) / 500));
      for (let y = yStart; y <= yEnd; y += step) {
        if (!isBorderPixel(x, y)) return false;
      }
      return true;
    }

    // Scan from top
    let top = 0;
    for (let y = 0; y < imgHeight; y++) {
      if (!isBorderRow(y)) { top = y; break; }
      if (y === imgHeight - 1) { top = 0; }
    }

    // Scan from bottom
    let bottom = imgHeight - 1;
    for (let y = imgHeight - 1; y > top; y--) {
      if (!isBorderRow(y)) { bottom = y; break; }
    }

    // Scan from left (only within the content rows)
    let left = 0;
    for (let x = 0; x < imgWidth; x++) {
      if (!isBorderCol(x, top, bottom)) { left = x; break; }
      if (x === imgWidth - 1) { left = 0; }
    }

    // Scan from right
    let right = imgWidth - 1;
    for (let x = imgWidth - 1; x > left; x--) {
      if (!isBorderCol(x, top, bottom)) { right = x; break; }
    }

    // Add 2px inward safety margin to ensure absolutely no border remnant is visible
    const margin = 2;
    if (top > 0) top = Math.min(top + margin, imgHeight - 1);
    if (bottom < imgHeight - 1) bottom = Math.max(bottom - margin, top);
    if (left > 0) left = Math.min(left + margin, imgWidth - 1);
    if (right < imgWidth - 1) right = Math.max(right - margin, left);

    // Convert from original pixel coords to display coords
    const scaleX = displayWidth / imgWidth;
    const scaleY = displayHeight / imgHeight;

    const newCropX = Math.ceil(left * scaleX);
    const newCropY = Math.ceil(top * scaleY);
    const newCropW = Math.floor((right - left + 1) * scaleX);
    const newCropH = Math.floor((bottom - top + 1) * scaleY);

    // Only update if we found meaningful content area
    if (newCropW >= MIN_SIZE && newCropH >= MIN_SIZE) {
      cropX = Math.max(0, newCropX);
      cropY = Math.max(0, newCropY);
      cropW = Math.min(displayWidth - cropX, newCropW);
      cropH = Math.min(displayHeight - cropY, newCropH);
    }
  }

  async function doCrop() {
    // If crop covers the entire image, use original file without re-encoding
    if (cropX === 0 && cropY === 0 && cropW === displayWidth && cropH === displayHeight) {
      onCrop(imageFile);
      return;
    }

    // Calculate actual pixel coordinates from original image dimensions
    const scaleX = imgWidth / displayWidth;
    const scaleY = imgHeight / displayHeight;

    const sx = Math.round(cropX * scaleX);
    const sy = Math.round(cropY * scaleY);
    const sw = Math.round(cropW * scaleX);
    const sh = Math.round(cropH * scaleY);

    // Use full resolution canvas matching original pixel dimensions
    canvas.width = sw;
    canvas.height = sh;
    const ctx = canvas.getContext("2d")!;

    // Disable image smoothing to preserve original pixel data without interpolation artifacts
    ctx.imageSmoothingEnabled = false;

    // Use createImageBitmap for highest quality source if available
    if (typeof createImageBitmap !== "undefined") {
      const bitmap = await createImageBitmap(imageFile, sx, sy, sw, sh);
      ctx.drawImage(bitmap, 0, 0, sw, sh);
      bitmap.close();
    } else {
      ctx.drawImage(imgEl, sx, sy, sw, sh, 0, 0, sw, sh);
    }

    // Always output as PNG to avoid any lossy compression
    // PNG is lossless and preserves full quality regardless of source format
    const blob = await new Promise<Blob>((resolve) => {
      canvas.toBlob((b) => resolve(b!), "image/png");
    });

    const outputName = imageFile.name.replace(/\.[^.]+$/, ".png");
    const croppedFile = new File([blob], outputName, { type: "image/png" });
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
    <button class="archivex-btn" on:click={autoTrim} title="Auto-detect and remove black/white borders">Auto Trim</button>
    <button class="archivex-btn archivex-btn-primary" on:click={doCrop}>Confirm</button>
  </div>
</div>
