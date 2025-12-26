/**
 * Telea Inpainting Algorithm - Pure JavaScript Implementation
 * Based on the Fast Marching Method by Alexandru Telea
 * Reference: "An Image Inpainting Technique Based on the Fast Marching Method"
 */

const Inpaint = {
    KNOWN: 0,
    BAND: 1,
    INSIDE: 2,

    /**
     * Main inpainting function
     * @param {ImageData} imageData - The image data to inpaint
     * @param {ImageData} maskData - The mask (non-zero pixels are areas to inpaint)
     * @param {number} radius - The neighborhood radius for inpainting
     * @returns {ImageData} - The inpainted image
     */
    inpaint: function (imageData, maskData, radius = 5) {
        const width = imageData.width;
        const height = imageData.height;
        const result = new ImageData(
            new Uint8ClampedArray(imageData.data),
            width,
            height
        );

        // Initialize flags and distances
        const flags = new Uint8Array(width * height);
        const dist = new Float32Array(width * height);
        const LARGE = 1e10;

        // Initialize: set known pixels and find the narrow band
        const heap = [];

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const idx = y * width + x;
                const maskIdx = idx * 4;

                // Check if pixel is in mask (any non-zero value in RGB or alpha > 0)
                const isMasked = maskData.data[maskIdx] > 0 ||
                    maskData.data[maskIdx + 1] > 0 ||
                    maskData.data[maskIdx + 2] > 0 ||
                    maskData.data[maskIdx + 3] > 0;

                if (isMasked) {
                    flags[idx] = this.INSIDE;
                    dist[idx] = LARGE;
                } else {
                    flags[idx] = this.KNOWN;
                    dist[idx] = 0;
                }
            }
        }

        // Find initial narrow band (boundary of masked region)
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const idx = y * width + x;
                if (flags[idx] === this.INSIDE) {
                    // Check 4-neighbors
                    const neighbors = [
                        [x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]
                    ];

                    for (const [nx, ny] of neighbors) {
                        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                            const nidx = ny * width + nx;
                            if (flags[nidx] === this.KNOWN) {
                                flags[idx] = this.BAND;
                                dist[idx] = 1;
                                heap.push({ x, y, dist: 1 });
                                break;
                            }
                        }
                    }
                }
            }
        }

        // Sort heap by distance
        heap.sort((a, b) => a.dist - b.dist);

        // Fast Marching Method
        while (heap.length > 0) {
            // Get pixel with smallest distance
            const current = heap.shift();
            const { x, y } = current;
            const idx = y * width + x;

            if (flags[idx] === this.KNOWN) continue;

            // Mark as known
            flags[idx] = this.KNOWN;

            // Inpaint this pixel
            this.inpaintPixel(result, x, y, width, height, flags, radius);

            // Update neighbors
            const neighbors = [
                [x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]
            ];

            for (const [nx, ny] of neighbors) {
                if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                    const nidx = ny * width + nx;
                    if (flags[nidx] === this.INSIDE) {
                        // Calculate new distance
                        const newDist = dist[idx] + 1;
                        if (newDist < dist[nidx]) {
                            dist[nidx] = newDist;
                            flags[nidx] = this.BAND;
                            // Insert into heap maintaining sort
                            let inserted = false;
                            for (let i = 0; i < heap.length; i++) {
                                if (heap[i].dist > newDist) {
                                    heap.splice(i, 0, { x: nx, y: ny, dist: newDist });
                                    inserted = true;
                                    break;
                                }
                            }
                            if (!inserted) {
                                heap.push({ x: nx, y: ny, dist: newDist });
                            }
                        }
                    }
                }
            }
        }

        return result;
    },

    /**
     * Inpaint a single pixel using weighted average of known neighbors
     */
    inpaintPixel: function (imageData, x, y, width, height, flags, radius) {
        const idx = (y * width + x) * 4;
        let sumR = 0, sumG = 0, sumB = 0;
        let sumWeight = 0;

        // Sample from circular neighborhood
        for (let dy = -radius; dy <= radius; dy++) {
            for (let dx = -radius; dx <= radius; dx++) {
                if (dx === 0 && dy === 0) continue;

                const nx = x + dx;
                const ny = y + dy;

                if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;

                const nidx = ny * width + nx;
                if (flags[nidx] !== this.KNOWN) continue;

                const distance = Math.sqrt(dx * dx + dy * dy);
                if (distance > radius) continue;

                // Weight decreases with distance
                const weight = 1.0 / (distance * distance + 0.1);

                const pixelIdx = nidx * 4;
                sumR += imageData.data[pixelIdx] * weight;
                sumG += imageData.data[pixelIdx + 1] * weight;
                sumB += imageData.data[pixelIdx + 2] * weight;
                sumWeight += weight;
            }
        }

        if (sumWeight > 0) {
            imageData.data[idx] = Math.round(sumR / sumWeight);
            imageData.data[idx + 1] = Math.round(sumG / sumWeight);
            imageData.data[idx + 2] = Math.round(sumB / sumWeight);
            imageData.data[idx + 3] = 255;
        }
    }
};
