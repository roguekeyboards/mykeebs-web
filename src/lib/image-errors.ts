export const MAX_IMAGE_BYTES = 1_572_864;
export const MAX_IMAGE_SIZE = `${MAX_IMAGE_BYTES / 1024 / 1024} MB`;

export class UnsupportedImageError extends Error {
	constructor() {
		super('The browser could not decode this image.');
		this.name = 'UnsupportedImageError';
	}
}

export class ImageTooLargeError extends Error {
	constructor() {
		super(`The image is over ${MAX_IMAGE_SIZE} even after shrinking.`);
		this.name = 'ImageTooLargeError';
	}
}
